/**
 * Pipeline — one ingestion pass:
 *   fetch → dedupe → attest → submit → record → index events → reconcile.
 * Dedupe anchor is the canonical actionId (keccak(sourceHash, sourceEventId)),
 * which is also the registry's onchain replay guard.
 */
import { canonicalize } from "@corpshift/core";
import type { IndexerConfig } from "./config.ts";
import type { Store } from "./db.ts";
import type { Attester } from "./attester.ts";
import type { Submitter } from "./submitter.ts";
import type { EventIndexer } from "./eventlog.ts";
import type { Reconciler } from "./reconciler.ts";
import { fetchBatch } from "./sources.ts";

export interface PipelineDeps {
  cfg: IndexerConfig;
  store: Store;
  attester?: Attester | undefined;
  submitter?: Submitter | undefined;
  events?: EventIndexer | undefined;
  reconciler?: Reconciler | undefined;
}

export interface TickResult {
  mode: string;
  seen: number;
  newActions: number;
  submitted: number;
  failures: number;
  block: bigint | undefined;
}

export async function tick(deps: PipelineDeps, mockNonce: number): Promise<TickResult> {
  const { cfg, store, attester, submitter, events, reconciler } = deps;
  const batch = await fetchBatch(cfg, mockNonce);

  let newActions = 0;
  let submitted = 0;

  // Phase 1: record all observations in ONE transaction (per-statement
  // auto-commit fsyncs are ~340ms each on Windows — this is ~100x faster).
  const fresh: { action: (typeof batch.actions)[number]; enc: ReturnType<typeof canonicalize> }[] = [];
  store.tx(() => {
    for (const failure of batch.failures) {
      store.insertNormalizationFailure(failure.sourceEventId, failure.reason, failure.raw);
    }
    for (const action of batch.actions) {
      const c = canonicalize(action);
      if (store.hasAction(c.actionId)) continue;
      fresh.push({ action, enc: c });
      newActions++;
      // Record immediately with status -1 ("observed") so the audit trail
      // exists even when submission is disabled or fails.
      store.upsertAction({
        action_id: c.actionId,
        source_hash: c.payload.sourceHash,
        source_event_id: c.payload.sourceEventId,
        asset: c.payload.asset,
        action_type: action.actionType,
        status: -1,
        announced_at: Number(action.announcedAt),
        effective_at: Number(action.effectiveAt),
        observed_at: Number(action.observedAt),
        submitted_at: null,
        params: c.encodedParams,
        params_hash: c.payload.paramsHash,
        evidence_hash: c.payload.evidenceHash,
        evidence_json: JSON.stringify(action.evidence),
        attested_by: null,
        tx_hash: null,
        chain_id: cfg.chainId,
        trust: batch.trust,
        error: null,
      });
    }
  });

  // Phase 2: attest + submit fresh actions (async — outside the tx).
  if (!cfg.dryRun && attester && submitter) {
    for (const { action, enc } of fresh) {
      try {
        const signed = await attester.sign(action);
        const res = await submitter.submit(signed);
        const row = store.getAction(enc.actionId);
        if (row) {
          store.upsertAction({
            ...row,
            status: action.effectiveAt > BigInt(Date.now() / 1000) ? 0 : 1,
            submitted_at: Math.floor(Date.now() / 1000),
            attested_by: signed.signer,
            tx_hash: res.txHash,
          });
        }
        submitted++;
      } catch (e) {
        const row = store.getAction(enc.actionId);
        if (row) {
          store.upsertAction({ ...row, error: e instanceof Error ? e.message : String(e) });
        }
      }
    }
  }

  const block = await events?.tick().catch(() => undefined);
  await reconciler?.tick().catch(() => undefined);
  await reconciler?.observeAssets().catch(() => undefined);

  return {
    mode: batch.mode,
    seen: batch.actions.length,
    newActions,
    submitted,
    failures: batch.failures.length,
    block,
  };
}
