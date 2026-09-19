import { describe, expect, it } from "vitest";
import { Store } from "../src/db.ts";
import { canonicalize, CRWD_FORWARD_SPLIT } from "@corpshift/core";

const c = canonicalize(CRWD_FORWARD_SPLIT);

function row(overrides: Partial<Parameters<Store["upsertAction"]>[0]> = {}) {
  return {
    action_id: c.actionId,
    source_hash: c.payload.sourceHash,
    source_event_id: c.payload.sourceEventId,
    asset: c.payload.asset,
    action_type: 0,
    status: -1,
    announced_at: 1,
    effective_at: 2,
    observed_at: 3,
    submitted_at: null,
    params: c.encodedParams,
    params_hash: c.payload.paramsHash,
    evidence_hash: c.payload.evidenceHash,
    evidence_json: "{}",
    attested_by: null,
    tx_hash: null,
    chain_id: 31337,
    trust: "fixture-replay",
    error: null,
    ...overrides,
  };
}

describe("Store", () => {
  it("round-trips actions and dedupes by actionId", () => {
    const s = new Store(":memory:");
    s.upsertAction(row());
    expect(s.hasAction(c.actionId)).toBe(true);
    s.upsertAction(row({ status: 1, tx_hash: "0xabc" }));
    const a = s.getAction(c.actionId);
    expect(a?.status).toBe(1);
    expect(a?.tx_hash).toBe("0xabc");
    expect(s.listActions()).toHaveLength(1);
    s.close();
  });

  it("asset filtering is case-insensitive", () => {
    const s = new Store(":memory:");
    s.upsertAction(row());
    expect(s.listActions({ asset: c.payload.asset.toUpperCase() })).toHaveLength(1);
    s.close();
  });

  it("events dedupe on (tx_hash, log_index)", () => {
    const s = new Store(":memory:");
    const e = {
      block_number: 5,
      tx_hash: "0xtx",
      log_index: 0,
      event_name: "CorporateActionAttested",
      asset: "0xa",
      action_id: "0xid",
      data: "{}",
    };
    s.insertEvent(e);
    s.insertEvent(e); // duplicate ignored
    expect(s.listEvents()).toHaveLength(1);
    s.close();
  });

  it("meta persists high-water marks", () => {
    const s = new Store(":memory:");
    s.setMeta("lastBlock", "123");
    expect(s.getMeta("lastBlock")).toBe("123");
    s.close();
  });

  it("normalization observations + failures persist", () => {
    const s = new Store(":memory:");
    s.insertNormalizationObs({ asset: "0xAb", blockNumber: 7n, factor: 4n * 10n ** 18n });
    s.insertNormalizationFailure("evt-1", "no deployment", { raw: true });
    const fails = s.listNormalizationFailures();
    expect(fails).toHaveLength(1);
    expect(fails[0]?.reason).toBe("no deployment");
    s.close();
  });
});
