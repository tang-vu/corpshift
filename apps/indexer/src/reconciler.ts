/**
 * Reconciler — the crank that keeps onchain state honest:
 *   1. SCHEDULED actions whose effectiveAt arrived → activateAction.
 *   2. ACTIVE actions → applyAction (the registry itself verifies the
 *      attested expectation against live token state; divergence → DEGRADED).
 *   3. Observes adapter normalization factors into the DB for the API.
 */
import type { Address, Hex, PublicClient } from "viem";
import { CorpShiftRegistryAbi, IAssetAdapterAbi } from "@corpshift/sdk";
import type { Store } from "./db.ts";
import type { Submitter } from "./submitter.ts";

export class Reconciler {
  private readonly client: PublicClient;
  private readonly registry: Address;
  private readonly store: Store;
  private readonly submitter: Submitter | undefined;

  constructor(client: PublicClient, registry: Address, store: Store, submitter?: Submitter) {
    this.client = client;
    this.registry = registry;
    this.store = store;
    this.submitter = submitter;
  }

  /** One reconciliation pass over indexed non-terminal actions. */
  async tick(): Promise<{ activated: Hex[]; applied: Hex[] }> {
    const out = { activated: [] as Hex[], applied: [] as Hex[] };
    const pending = this.store
      .listActions({ limit: 1000 })
      .filter((a) => a.status === 0 || a.status === 1);

    const now = BigInt(Math.floor(Date.now() / 1000));
    for (const a of pending) {
      const id = a.action_id as Hex;
      // Prefer chain truth when the indexer has run: read the stored status.
      if (a.status === 0 && BigInt(a.effective_at) <= now) {
        const tx = await this.submitter?.activate(id);
        if (tx) out.activated.push(id);
      } else if (a.status === 1) {
        const tx = await this.submitter?.apply(id);
        if (tx) out.applied.push(id);
      }
    }
    return out;
  }

  /** Registered assets, read from the registry's onchain list. */
  async listRegisteredAssets(): Promise<Address[]> {
    const count = (await this.client.readContract({
      address: this.registry,
      abi: CorpShiftRegistryAbi,
      functionName: "assetCount",
    })) as bigint;
    const assets = await Promise.all(
      Array.from(
        { length: Number(count) },
        (_, i) =>
          this.client.readContract({
            address: this.registry,
            abi: CorpShiftRegistryAbi,
            functionName: "assetAt",
            args: [BigInt(i)],
          }) as Promise<Address>,
      ),
    );
    return assets;
  }

  /** Snapshot every registered asset's normalization state into the DB. */
  async observeAssets(assets?: Address[]): Promise<void> {
    assets ??= await this.listRegisteredAssets();
    const block = await this.client.getBlockNumber();
    for (const asset of assets) {
      try {
        const rec = (await this.client.readContract({
          address: this.registry,
          abi: CorpShiftRegistryAbi,
          functionName: "getAsset",
          args: [asset],
        })) as { adapter: Address; exists: boolean };
        if (!rec.exists) continue;
        const [factor, pending] = await Promise.all([
          this.client.readContract({
            address: rec.adapter,
            abi: IAssetAdapterAbi,
            functionName: "normalizationFactor",
            args: [asset],
          }) as Promise<bigint>,
          this.client
            .readContract({
              address: rec.adapter,
              abi: IAssetAdapterAbi,
              functionName: "pendingNormalization",
              args: [asset],
            })
            .catch(() => undefined) as Promise<readonly [bigint, bigint] | undefined>,
        ]);
        this.store.insertNormalizationObs({
          asset,
          blockNumber: block,
          factor,
          pendingFactor: pending?.[0],
          pendingEffectiveAt: pending?.[1],
        });
      } catch {
        // Adapter read failure is a chain-level fact worth surfacing, but
        // it must not kill the observation loop.
      }
    }
  }
}
