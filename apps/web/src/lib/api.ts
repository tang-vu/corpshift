/**
 * Typed client for the CorpShift API — the web app never simulates chain
 * state; everything displayed comes from these endpoints (which read live
 * onchain data + the indexer db).
 */

export interface Health {
  ok: boolean;
  chainId: number;
  chain: string;
  registry: string;
  demoMode: boolean;
  demoEnabled: boolean;
}

export interface AssetRow {
  asset: string;
  state: string;
  normalizationFactor: string;
  verifiedFactor: string;
  pendingActionId: string;
  explorerUrl?: string;
}

export interface ActionItem {
  actionId: string;
  asset: string;
  actionType: string;
  status: string;
  announcedAt: number;
  effectiveAt: number;
  observedAt: number;
  submittedAt: number | null;
  params: string;
  paramsHash: string;
  evidenceHash: string;
  evidence: unknown;
  attestedBy: string | null;
  txHash: string | null;
  txUrl?: string;
  trust: string;
  error: string | null;
}

export interface EventItem {
  id: number;
  block_number: number;
  tx_hash: string;
  log_index: number;
  event_name: string;
  asset: string | null;
  action_id: string | null;
  data: string;
  txUrl?: string;
}

export interface PolicyResult {
  allowed: boolean;
  reason: string;
}

export interface Exposure {
  units: string;
  normalizationFactor: string;
  verifiedFactor: string;
  state: string;
  pendingActionId: string;
}

export interface SourceStatus {
  lastTick: string | undefined;
  lastBlock: string | undefined;
  counts: { actions: number; events: number; normalizationFailures: number };
  normalizationFailures: { sourceEventId: string; reason: string; observedAt: number }[];
}

export interface VaultView {
  collateralRaw: string;
  collateralValue: string;
  debt: string;
  healthFactor: string;
}

export interface DemoState {
  step: number;
  user: string;
  asset: string;
  assetState: string;
  normalizationFactor: string;
  verifiedFactor: string;
  pendingActionId: string;
  pendingEffectiveAt: number | null;
  demoActionId: string | null;
  uiMultiplier: string;
  price: string;
  userStockBalance: string;
  userDebtTokenBalance: string;
  vaults: { naive: VaultView; aware: VaultView };
  roles: { user: string; operator: string; liquidator: string; attester: string };
}

export interface DemoStepResult {
  step: string;
  ok: boolean;
  detail: string;
  txs: { label: string; hash: string; url?: string }[];
  reverts?: { label: string; error: string }[];
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {
      /* non-json error body */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => fetch("/health").then((r) => j<Health>(r)),
  source: () => fetch("/v1/source").then((r) => j<SourceStatus>(r)),
  assets: () => fetch("/v1/assets").then((r) => j<{ assets: AssetRow[] }>(r)),
  asset: (a: string) =>
    fetch(`/v1/assets/${a}`).then((r) => j<AssetRow & { actions: ActionItem[] }>(r)),
  actions: (q = "") => fetch(`/v1/actions${q}`).then((r) => j<{ actions: ActionItem[] }>(r)),
  action: (id: string) =>
    fetch(`/v1/actions/${id}`).then((r) => j<ActionItem & { events: EventItem[] }>(r)),
  events: (q = "") => fetch(`/v1/events${q}`).then((r) => j<{ events: EventItem[] }>(r)),
  policy: (asset: string, op: number) =>
    fetch(`/v1/policy/${asset}/${op}`).then((r) => j<PolicyResult>(r)),
  exposure: (asset: string, account: string) =>
    fetch(`/v1/exposure/${asset}/${account}`).then((r) => j<Exposure>(r)),
  demoState: () => fetch("/v1/demo/state").then((r) => j<DemoState>(r)),
  demoStep: () => fetch("/v1/demo/step", { method: "POST" }).then((r) => j<DemoStepResult>(r)),
  demoReset: () => fetch("/v1/demo/reset", { method: "POST" }).then((r) => j<DemoStepResult>(r)),
};
