/**
 * SQLite persistence via node:sqlite (zero external deps).
 * WAL mode so the API process can read while the indexer writes.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS actions (
  action_id TEXT PRIMARY KEY,
  source_hash TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  asset TEXT NOT NULL,
  action_type INTEGER NOT NULL,
  status INTEGER NOT NULL DEFAULT -1,
  announced_at INTEGER NOT NULL,
  effective_at INTEGER NOT NULL,
  observed_at INTEGER NOT NULL,
  submitted_at INTEGER,
  params TEXT NOT NULL,
  params_hash TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  attested_by TEXT,
  tx_hash TEXT,
  chain_id INTEGER NOT NULL,
  trust TEXT NOT NULL,
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_actions_asset ON actions(asset);
CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status);
CREATE INDEX IF NOT EXISTS idx_actions_effective ON actions(effective_at);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  block_number INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  event_name TEXT NOT NULL,
  asset TEXT,
  action_id TEXT,
  data TEXT NOT NULL,
  indexed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS idx_events_asset ON events(asset);
CREATE INDEX IF NOT EXISTS idx_events_action ON events(action_id);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS normalization_obs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  factor TEXT NOT NULL,
  pending_factor TEXT,
  pending_effective_at INTEGER,
  observed_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_norm_asset ON normalization_obs(asset);

CREATE TABLE IF NOT EXISTS normalization_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_event_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  observed_at INTEGER NOT NULL DEFAULT (unixepoch())
);
`;

export interface ActionRow {
  action_id: string;
  source_hash: string;
  source_event_id: string;
  asset: string;
  action_type: number;
  status: number;
  announced_at: number;
  effective_at: number;
  observed_at: number;
  submitted_at: number | null;
  params: string;
  params_hash: string;
  evidence_hash: string;
  evidence_json: string;
  attested_by: string | null;
  tx_hash: string | null;
  chain_id: number;
  trust: string;
  error: string | null;
  created_at: number;
}

export interface EventRow {
  id: number;
  block_number: number;
  tx_hash: string;
  log_index: number;
  event_name: string;
  asset: string | null;
  action_id: string | null;
  data: string;
  indexed_at: number;
}

export class Store {
  readonly db: DatabaseSync;
  /** node:sqlite prepare() is expensive — hot paths use cached statements. */
  private readonly stmt: Record<string, ReturnType<DatabaseSync["prepare"]>> = {};

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA_SQL);
    const p = (sql: string) => this.db.prepare(sql);
    this.stmt.upsertAction = p(`INSERT INTO actions(
        action_id, source_hash, source_event_id, asset, action_type, status,
        announced_at, effective_at, observed_at, submitted_at, params,
        params_hash, evidence_hash, evidence_json, attested_by, tx_hash,
        chain_id, trust, error
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(action_id) DO UPDATE SET
        status = excluded.status,
        submitted_at = COALESCE(excluded.submitted_at, actions.submitted_at),
        attested_by = COALESCE(excluded.attested_by, actions.attested_by),
        tx_hash = COALESCE(excluded.tx_hash, actions.tx_hash),
        error = excluded.error`);
    this.stmt.getAction = p("SELECT * FROM actions WHERE action_id = ?");
    this.stmt.insertEvent = p(
      `INSERT OR IGNORE INTO events(block_number, tx_hash, log_index, event_name, asset, action_id, data)
       VALUES (?,?,?,?,?,?,?)`,
    );
    this.stmt.insertNormObs = p(
      `INSERT INTO normalization_obs(asset, block_number, factor, pending_factor, pending_effective_at)
       VALUES (?,?,?,?,?)`,
    );
    this.stmt.insertNormFail = p(
      "INSERT INTO normalization_failures(source_event_id, reason, raw_json) VALUES (?,?,?)",
    );
    this.stmt.getMeta = p("SELECT value FROM meta WHERE key = ?");
    this.stmt.setMeta = p(
      "INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
  }

  /** Wrap `fn` in a single transaction — 49 individual commits cost ~17s
   *  on Windows fsync; one commit is ~1ms. */
  tx<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const v = fn();
      this.db.exec("COMMIT");
      return v;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  getMeta(key: string): string | undefined {
    const row = this.stmt.getMeta!.get(key) as { value: string } | undefined;
    return row?.value;
  }

  setMeta(key: string, value: string): void {
    this.stmt.setMeta!.run(key, value);
  }

  upsertAction(a: Omit<ActionRow, "created_at">): void {
    this.stmt.upsertAction!.run(
        a.action_id, a.source_hash, a.source_event_id, a.asset.toLowerCase(), a.action_type,
        a.status, a.announced_at, a.effective_at, a.observed_at, a.submitted_at,
        a.params, a.params_hash, a.evidence_hash, a.evidence_json, a.attested_by,
        a.tx_hash, a.chain_id, a.trust, a.error,
      );
  }

  getAction(id: string): ActionRow | undefined {
    return this.stmt.getAction!.get(id) as ActionRow | undefined;
  }

  listActions(opts: { asset?: string; status?: number; limit?: number } = {}): ActionRow[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (opts.asset) {
      where.push("asset = ?");
      args.push(opts.asset.toLowerCase());
    }
    if (opts.status !== undefined) {
      where.push("status = ?");
      args.push(opts.status);
    }
    args.push(opts.limit ?? 500);
    return this.db
      .prepare(
        `SELECT * FROM actions ${where.length ? "WHERE " + where.join(" AND ") : ""}
         ORDER BY effective_at DESC LIMIT ?`,
      )
      .all(...args) as unknown as ActionRow[];
  }

  hasAction(id: string): boolean {
    return this.getAction(id) !== undefined;
  }

  insertEvent(e: Omit<EventRow, "id" | "indexed_at">): void {
    this.stmt.insertEvent!.run(
      e.block_number, e.tx_hash, e.log_index, e.event_name, e.asset, e.action_id, e.data,
    );
  }

  listEvents(opts: { asset?: string; actionId?: string; limit?: number } = {}): EventRow[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (opts.asset) {
      where.push("asset = ?");
      args.push(opts.asset.toLowerCase());
    }
    if (opts.actionId) {
      where.push("action_id = ?");
      args.push(opts.actionId);
    }
    args.push(opts.limit ?? 500);
    return this.db
      .prepare(
        `SELECT * FROM events ${where.length ? "WHERE " + where.join(" AND ") : ""}
         ORDER BY block_number DESC, log_index DESC LIMIT ?`,
      )
      .all(...args) as unknown as EventRow[];
  }

  insertNormalizationObs(o: {
    asset: string;
    blockNumber: bigint;
    factor: bigint;
    pendingFactor?: bigint | undefined;
    pendingEffectiveAt?: bigint | undefined;
  }): void {
    this.stmt.insertNormObs!.run(
        o.asset.toLowerCase(),
        Number(o.blockNumber),
        o.factor.toString(),
        o.pendingFactor?.toString() ?? null,
        o.pendingEffectiveAt !== undefined ? Number(o.pendingEffectiveAt) : null,
      );
  }

  insertNormalizationFailure(sourceEventId: string, reason: string, raw: unknown): void {
    this.stmt.insertNormFail!.run(sourceEventId, reason, JSON.stringify(raw));
  }

  listNormalizationFailures(limit = 100) {
    return this.db
      .prepare("SELECT * FROM normalization_failures ORDER BY id DESC LIMIT ?")
      .all(limit) as unknown as {
      id: number; source_event_id: string; reason: string; raw_json: string; observed_at: number;
    }[];
  }

  close(): void {
    this.db.close();
  }
}
