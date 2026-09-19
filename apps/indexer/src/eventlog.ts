/**
 * Registry event indexer — polls eth_getLogs from the last indexed block,
 * decodes CorpShift events, and persists them. Also refreshes the stored
 * onchain status of indexed actions so the API mirrors chain truth.
 */
import { decodeEventLog, type Address, type Hex, type Log, type PublicClient } from "viem";
import { CorpShiftRegistryAbi } from "@corpshift/sdk";
import type { Store } from "./db.ts";

const WATCHED_EVENTS = new Set([
  "CorporateActionAttested",
  "CorporateActionActivated",
  "CorporateActionApplied",
  "CorporateActionResolved",
  "CorporateActionInvalidated",
  "CorporateActionUnsupported",
  "AssetStateChanged",
  "NormalizationVerified",
  "ReconciliationFailed",
  "AssetRegistered",
  "SettlementOpened",
]);

export class EventIndexer {
  private readonly client: PublicClient;
  private readonly registry: Address;
  private readonly store: Store;
  private readonly fromBlock: bigint;

  constructor(client: PublicClient, registry: Address, store: Store, fromBlock: bigint) {
    this.client = client;
    this.registry = registry;
    this.store = store;
    this.fromBlock = fromBlock;
  }

  /** Poll new logs once. Returns the new high-water mark. */
  async tick(): Promise<bigint> {
    const head = await this.client.getBlockNumber();
    const last = BigInt(this.store.getMeta("lastBlock") ?? this.fromBlock.toString());
    if (head <= last) return last;

    const logs = await this.client.getLogs({
      address: this.registry,
      fromBlock: last + 1n,
      toBlock: head,
    });
    for (const log of logs) this.indexLog(log);
    this.store.setMeta("lastBlock", head.toString());
    return head;
  }

  private indexLog(log: Log): void {
    let decoded: { eventName: string; args: Record<string, unknown> } | undefined;
    try {
      decoded = decodeEventLog({ abi: CorpShiftRegistryAbi, ...log }) as typeof decoded;
    } catch {
      return; // not a registry event we model
    }
    if (!decoded || !WATCHED_EVENTS.has(decoded.eventName)) return;

    const args = decoded.args ?? {};
    const actionId = (args.actionId as Hex | undefined) ?? null;
    const asset = (args.asset as Address | undefined) ?? null;

    this.store.insertEvent({
      block_number: Number(log.blockNumber ?? 0),
      tx_hash: log.transactionHash ?? "0x",
      log_index: Number(log.logIndex ?? 0),
      event_name: decoded.eventName,
      asset: asset?.toLowerCase() ?? null,
      action_id: actionId,
      data: JSON.stringify(args, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
    });

    // Reflect onchain lifecycle into the actions table so the API reads
    // chain truth, not submission-time optimism.
    if (actionId && this.store.hasAction(actionId)) {
      const status =
        decoded.eventName === "CorporateActionActivated"
          ? 1
          : decoded.eventName === "CorporateActionResolved" ||
              decoded.eventName === "CorporateActionApplied"
            ? 2
            : decoded.eventName === "CorporateActionInvalidated"
              ? 3
              : decoded.eventName === "CorporateActionUnsupported"
                ? 4
                : undefined;
      if (status !== undefined) {
        const row = this.store.getAction(actionId);
        if (row && status > row.status) {
          row.status = status;
          this.store.upsertAction({ ...row });
        }
      }
    }
  }
}
