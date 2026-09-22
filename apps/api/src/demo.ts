/**
 * DemoConductor — drives the killer scenario against REAL deployed
 * contracts. Every step is actual transactions; the UI only calls this API.
 *
 * Scenario (mirrors test/DemoVaults.t.sol, proven onchain):
 *   seed     → user deposits 10 stock tokens + borrows $400 in BOTH vaults
 *   attest   → attested 4:1 FORWARD_SPLIT lands onchain → ACTION_PENDING
 *   probe    → naive vault lets user borrow on stale units; aware vault reverts
 *   execute  → issuer schedules 4e18 multiplier + price moves 100→25; action ADJUSTING
 *   reconcile→ registry verifies the onchain multiplier → action RESOLVED
 *   liquidate→ naive vault wrongfully liquidates the healthy position;
 *              the same call on the aware vault reverts NotLiquidatable
 */
import {
  parseEther,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Account,
} from "viem";
import {
  ActionType,
  AssetState,
  ASSET_STATE_NAMES,
  canonicalize,
  type CanonicalAction,
} from "@corpshift/core";
import {
  CorpShiftAwareVaultAbi,
  CorpShiftRegistryAbi,
  MockPriceOracleAbi,
  MockStockTokenAbi,
  MockUSDGAbi,
  NaiveVaultAbi,
} from "@corpshift/sdk";
import { explorerTxUrl, LOCAL_CHAIN_ID } from "@corpshift/shared";
import { Attester } from "@corpshift/indexer/attester";
import type { Store } from "@corpshift/indexer/db";
import type { ApiConfig } from "./config.ts";
import type { ChainClients } from "./clients.ts";
import { walletFor } from "./clients.ts";
import { assertSuccessfulReceipt, expectedRevert } from "./demo-evidence.ts";

export const DEMO_DEPOSIT = parseEther("10"); // 10 stock tokens
export const DEMO_BORROW = 400_000_000n; //      $400 mUSDG (6dp)
const NEW_MULTIPLIER = 4n * 10n ** 18n; //       4e18 (4:1 split)
const POST_SPLIT_PRICE = 25n * 10n ** 8n; //     $25 (was $100)
const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

export interface DemoStepResult {
  step: string;
  ok: boolean;
  detail: string;
  txs: { label: string; hash: Hex; url?: string | undefined }[];
  reverts?: { label: string; error: string }[];
}

interface Role {
  account: Account;
  wallet: WalletClient;
  address: Address;
}

function shortErr(e: unknown): string {
  const s = e instanceof Error ? e.message : String(e);
  // viem surfaces contract reverts as `Error: UnsafeAssetState(uint8 op, bytes32 reason)`
  const named = s.match(/Error:\s*([A-Za-z][A-Za-z0-9]*(?:\([^)]*\))?)/);
  if (named) return named[1]!;
  const custom = s.match(/custom error (0x[0-9a-fA-F]+)/);
  if (custom) return `custom error ${custom[1]}`;
  return s.split("\n")[0]!.slice(0, 200);
}

export class DemoConductor {
  private readonly cfg: ApiConfig;
  private readonly clients: ChainClients;
  private readonly store: Store;
  private readonly pub: PublicClient;
  private readonly user: Role;
  private readonly operator: Role;
  private readonly liquidator: Role;
  private readonly attester: Attester;
  private snapshotId: Hex | undefined;
  /** Steps are strictly sequential — a duplicate POST while one is in
   *  flight would double-execute (e.g. seed twice). */
  private busy = false;

  constructor(cfg: ApiConfig, clients: ChainClients, store: Store) {
    if (!cfg.demoUserKey || !cfg.demoOperatorKey || !cfg.demoLiquidatorKey || !cfg.attesterKey) {
      throw new Error(
        "demo keys not configured (CORPSHIFT_DEMO_USER_KEY, CORPSHIFT_OPERATOR_KEY, CORPSHIFT_LIQUIDATOR_KEY, CORPSHIFT_ATTESTER_KEY)",
      );
    }
    this.cfg = cfg;
    this.clients = clients;
    this.store = store;
    this.pub = clients.publicClient;
    const mk = (key: Hex): Role => {
      const { account, wallet } = walletFor(clients.chain, cfg.rpcUrl, key);
      return { account, wallet, address: account.address };
    };
    this.user = mk(cfg.demoUserKey);
    this.operator = mk(cfg.demoOperatorKey);
    this.liquidator = mk(cfg.demoLiquidatorKey);
    this.attester = new Attester(cfg.attesterKey, BigInt(cfg.chainId), cfg.manifest.registry);
  }

  get isLocal(): boolean {
    return this.cfg.chainId === LOCAL_CHAIN_ID;
  }

  private get m() {
    const m = this.cfg.manifest;
    if (!m.mockStockToken || !m.mockUSDG || !m.naiveVault || !m.awareVault || !m.priceOracle) {
      throw new Error("deployment manifest is not demo-mode (missing mock/vault addresses)");
    }
    return m as Required<typeof m>;
  }

  /* ------------------------- helpers ------------------------- */

  private async send(
    role: Role,
    to: Address,
    abi: unknown,
    fn: string,
    args: unknown[],
  ): Promise<Hex> {
    const hash = await role.wallet.writeContract({
      account: role.account,
      chain: this.clients.chain,
      address: to,
      abi,
      functionName: fn,
      args,
    } as never);
    assertSuccessfulReceipt(await this.pub.waitForTransactionReceipt({ hash }));
    return hash;
  }

  private async read<T>(to: Address, abi: unknown, fn: string, args: unknown[] = []): Promise<T> {
    return this.pub.readContract({
      address: to,
      abi,
      functionName: fn,
      args,
    } as never) as Promise<T>;
  }

  private async simulateError(
    role: Role,
    to: Address,
    abi: unknown,
    fn: string,
    args: unknown[],
    expected: string,
  ): Promise<string> {
    try {
      await this.pub.simulateContract({
        account: role.address,
        address: to,
        abi,
        functionName: fn,
        args,
      } as never);
      throw new Error(
        `Expected ${expected}, but ${fn} simulation succeeded; protection is not verified`,
      );
    } catch (e) {
      if (!expectedRevert(e, expected)) throw e;
      return shortErr(e);
    }
  }

  private txRec(label: string, hash: Hex) {
    return { label, hash, url: explorerTxUrl(this.cfg.chainId, hash) };
  }

  private metaStep(): number {
    return Number(this.store.getMeta("demo.step") ?? "0");
  }

  private setStep(n: number) {
    this.store.setMeta("demo.step", String(n));
  }

  async reset(): Promise<DemoStepResult> {
    if (!this.isLocal) {
      return {
        step: "reset",
        ok: false,
        detail:
          "reset requires evm_revert — only available on local chains; redeploy for a fresh run",
        txs: [],
      };
    }
    if (this.busy) {
      return {
        step: "reset",
        ok: false,
        detail: "a step is already in flight — wait for it to finish",
        txs: [],
      };
    }
    this.busy = true;
    try {
      // self-heal: the boot-time snapshot may have raced chain/db startup
      if (!this.snapshotId) await this.prepare().catch(() => undefined);
      if (!this.snapshotId) {
        return {
          step: "reset",
          ok: false,
          detail: "no evm snapshot available — restart `pnpm demo` for a clean baseline",
          txs: [],
        };
      }
      const reverted = (await this.pub.request({
        method: "evm_revert" as never,
        params: [this.snapshotId] as never,
      })) as boolean;
      // snapshot ids are single-use — retake for the next reset regardless
      this.snapshotId = (await this.pub.request({
        method: "evm_snapshot" as never,
        params: [] as never,
      })) as Hex;
      if (reverted !== true) {
        return {
          step: "reset",
          ok: false,
          detail:
            "evm snapshot was consumed (anvil restarted?) — restart `pnpm demo` for a clean baseline",
          txs: [],
        };
      }
      // verify the reverted state really is the deploy baseline — a snapshot
      // taken mid-scenario would silently "reset" onto a dirty chain
      const [mult, naiveRaw] = await Promise.all([
        this.read<bigint>(this.m.mockStockToken, MockStockTokenAbi, "uiMultiplier"),
        this.read<bigint>(this.m.naiveVault, NaiveVaultAbi, "collateralRaw", [this.user.address]),
      ]);
      if (mult !== 10n ** 18n || naiveRaw !== 0n) {
        return {
          step: "reset",
          ok: false,
          detail:
            "snapshot baseline is dirty (chain diverged from deploy state) — restart `pnpm demo`",
          txs: [],
        };
      }
      this.setStep(0);
      this.store.setMeta("demo.actionId", "");
      return { step: "reset", ok: true, detail: "chain reverted to post-deploy snapshot", txs: [] };
    } finally {
      this.busy = false;
    }
  }

  /* ------------------------- steps ------------------------- */

  /** step 1: user mints stock, deposits 10 into both vaults, borrows $400 each. */
  async seed(): Promise<DemoStepResult> {
    const { mockStockToken, mockUSDG, naiveVault, awareVault } = this.m;
    const txs: DemoStepResult["txs"] = [];
    const stock = MockStockTokenAbi;
    const usdg = MockUSDGAbi;

    // gas top-up for demo EOAs (operator funds them — works on any chain
    // where the operator is funded; on anvil this covers non-default keys)
    for (const role of [this.user, this.liquidator]) {
      const bal = await this.pub.getBalance({ address: role.address });
      if (bal < parseEther("0.005")) {
        const hash = await this.operator.wallet.sendTransaction({
          account: this.operator.account,
          chain: this.clients.chain,
          to: role.address,
          value: parseEther("0.05"),
        });
        assertSuccessfulReceipt(await this.pub.waitForTransactionReceipt({ hash }));
        txs.push(this.txRec(`fund ${role === this.user ? "user" : "liquidator"} gas`, hash));
      }
    }

    // faucet: stock for user, mUSDG for liquidator (both permissionless mints)
    if (
      (await this.read<bigint>(mockStockToken, stock, "balanceOf", [this.user.address])) <
      DEMO_DEPOSIT * 2n
    ) {
      txs.push(
        this.txRec(
          "mint 20 stock to user",
          await this.send(this.user, mockStockToken, stock, "mint", [
            this.user.address,
            DEMO_DEPOSIT * 2n,
          ]),
        ),
      );
    }
    if (
      (await this.read<bigint>(mockUSDG, usdg, "balanceOf", [this.liquidator.address])) <
      DEMO_BORROW * 2n
    ) {
      txs.push(
        this.txRec(
          "mint mUSDG to liquidator",
          await this.send(this.liquidator, mockUSDG, usdg, "mint", [
            this.liquidator.address,
            DEMO_BORROW * 10n,
          ]),
        ),
      );
    }
    for (const [label, vault] of [
      ["naive", naiveVault],
      ["aware", awareVault],
    ] as const) {
      const [stockAllowance, debtAllowance] = await Promise.all([
        this.read<bigint>(mockStockToken, stock, "allowance", [this.user.address, vault]),
        this.read<bigint>(mockUSDG, usdg, "allowance", [this.user.address, vault]),
      ]);
      if (stockAllowance < DEMO_DEPOSIT) {
        txs.push(
          this.txRec(
            `approve stock→${label} vault`,
            await this.send(this.user, mockStockToken, stock, "approve", [
              vault,
              DEMO_DEPOSIT * 100n,
            ]),
          ),
        );
      }
      if (debtAllowance < DEMO_BORROW * 4n) {
        txs.push(
          this.txRec(
            `approve mUSDG→${label} vault`,
            await this.send(this.user, mockUSDG, usdg, "approve", [vault, DEMO_BORROW * 100n]),
          ),
        );
      }
      // idempotent: if the position already exists (re-run without reset,
      // or snapshot taken mid-scenario), top it up rather than stacking
      const abi = label === "naive" ? NaiveVaultAbi : CorpShiftAwareVaultAbi;
      const [haveRaw, haveDebt] = await Promise.all([
        this.read<bigint>(vault, abi, "collateralRaw", [this.user.address]),
        this.read<bigint>(vault, abi, "debtOf", [this.user.address]),
      ]);
      if (haveRaw < DEMO_DEPOSIT) {
        txs.push(
          this.txRec(
            `deposit 10 → ${label} vault`,
            await this.send(this.user, vault, abi, "deposit", [DEMO_DEPOSIT - haveRaw]),
          ),
        );
      }
      if (haveDebt < DEMO_BORROW) {
        txs.push(
          this.txRec(
            `borrow $400 ← ${label} vault`,
            await this.send(this.user, vault, abi, "borrow", [DEMO_BORROW - haveDebt]),
          ),
        );
      }
    }
    this.setStep(1);
    return {
      step: "seed",
      ok: true,
      detail: "user deposited 10 stock tokens + borrowed $400 in both vaults (HF 2.0 each)",
      txs,
    };
  }

  /** step 2: attested 4:1 split lands onchain → asset ACTION_PENDING. */
  async attest(): Promise<DemoStepResult> {
    const { mockStockToken } = this.m;
    const now = BigInt(Math.floor(Date.now() / 1000));
    const action: CanonicalAction = {
      schema: "corpshift.action.v1",
      source: "corpshift-demo",
      sourceEventId: `demo-4for1-${now}`,
      asset: mockStockToken,
      actionType: ActionType.ForwardSplit,
      announcedAt: now - 3600n,
      effectiveAt: now + BigInt(this.cfg.demoPendingSeconds),
      observedAt: now,
      params: { numerator: 4n, denominator: 1n, expectedMultiplier: NEW_MULTIPLIER },
      evidence: {
        kind: "forward_split",
        ratio: "4:1",
        symbol: await this.read<string>(mockStockToken, MockStockTokenAbi, "symbol"),
        source: "corpshift.demo.conductor",
      },
    };
    const { actionId } = canonicalize(action);
    const signed = await this.attester.sign(action);
    const hash = await this.operator.wallet.writeContract({
      account: this.operator.account,
      chain: this.clients.chain,
      address: this.cfg.manifest.registry,
      abi: CorpShiftRegistryAbi,
      functionName: "submitAction",
      args: [signed.payload, signed.params, signed.signature],
    } as never);
    assertSuccessfulReceipt(await this.pub.waitForTransactionReceipt({ hash }));
    this.store.setMeta("demo.actionId", actionId);
    this.store.setMeta("demo.effectiveAt", action.effectiveAt.toString());
    this.setStep(2);
    return {
      step: "attest",
      ok: true,
      detail: `attested FORWARD_SPLIT 4:1 (actionId ${actionId.slice(0, 10)}…) → asset ACTION_PENDING`,
      txs: [this.txRec("submitAction (attested)", hash)],
    };
  }

  /** step 3: naive vault borrows on stale units; aware vault reverts. */
  async probe(): Promise<DemoStepResult> {
    const { naiveVault, awareVault } = this.m;
    const txs: DemoStepResult["txs"] = [];
    // naive vault: knows nothing — borrow + repay succeed on stale assumptions
    txs.push(
      this.txRec(
        "naive borrow +$10 (stale)",
        await this.send(this.user, naiveVault, NaiveVaultAbi, "borrow", [10_000_000n]),
      ),
    );
    txs.push(
      this.txRec(
        "naive repay $10",
        await this.send(this.user, naiveVault, NaiveVaultAbi, "repay", [10_000_000n]),
      ),
    );
    // aware vault: policy gate blocks borrow while ACTION_PENDING
    const awareErr = await this.simulateError(
      this.user,
      awareVault,
      CorpShiftAwareVaultAbi,
      "borrow",
      [10_000_000n],
      "UnsafeAssetState",
    );
    this.setStep(3);
    return {
      step: "probe",
      ok: true,
      detail: `naive vault processed borrow on stale units; aware vault rejected it (${awareErr})`,
      txs,
      reverts: [{ label: "aware borrow (policy-gated)", error: awareErr }],
    };
  }

  /** step 4: issuer schedules the multiplier, price moves, action ADJUSTING. */
  async execute(): Promise<DemoStepResult> {
    const { mockStockToken, priceOracle } = this.m;
    const actionId = this.store.getMeta("demo.actionId") as Hex;
    const effectiveAt = BigInt(this.store.getMeta("demo.effectiveAt") ?? "0");
    const txs: DemoStepResult["txs"] = [];

    txs.push(
      this.txRec(
        "issuer scheduleMultiplierUpdate(4e18)",
        await this.send(
          this.operator,
          mockStockToken,
          MockStockTokenAbi,
          "scheduleMultiplierUpdate",
          [NEW_MULTIPLIER, effectiveAt],
        ),
      ),
    );

    if (this.isLocal) {
      const now = await this.pub.getBlock().then((b) => b.timestamp);
      const target = effectiveAt > now ? effectiveAt + 1n : now + 1n;
      await this.pub.request({
        method: "evm_setNextBlockTimestamp" as never,
        params: [Number(target)] as never,
      });
    } else {
      const now = BigInt(Math.floor(Date.now() / 1000));
      if (now < effectiveAt) {
        return {
          step: "execute",
          ok: false,
          detail: `not yet effective — wait ${effectiveAt - now}s`,
          txs,
        };
      }
    }
    txs.push(
      this.txRec(
        "oracle setPrice $100→$25",
        await this.send(this.operator, priceOracle, MockPriceOracleAbi, "setPrice", [
          mockStockToken,
          POST_SPLIT_PRICE,
        ]),
      ),
    );
    txs.push(
      this.txRec(
        "activateAction → ADJUSTING",
        await this.send(
          this.operator,
          this.cfg.manifest.registry,
          CorpShiftRegistryAbi,
          "activateAction",
          [actionId],
        ),
      ),
    );
    txs.push(
      this.txRec(
        "syncMultiplier (crank)",
        await this.send(this.operator, mockStockToken, MockStockTokenAbi, "syncMultiplier", []),
      ),
    );
    this.setStep(4);
    return {
      step: "execute",
      ok: true,
      detail: "4e18 multiplier scheduled + effective; share price $100→$25; action ADJUSTING",
      txs,
    };
  }

  /** step 5: registry reconciles the onchain multiplier → RESOLVED. */
  async reconcile(): Promise<DemoStepResult> {
    const actionId = this.store.getMeta("demo.actionId") as Hex;
    const hash = await this.send(
      this.operator,
      this.cfg.manifest.registry,
      CorpShiftRegistryAbi,
      "applyAction",
      [actionId],
    );
    const state = await this.clients.corpshift.assetState(this.m.mockStockToken);
    this.setStep(5);
    return {
      step: "reconcile",
      ok: state === AssetState.Active,
      detail: `registry verified the 4e18 multiplier landed onchain → action RESOLVED, asset ${ASSET_STATE_NAMES[state as AssetState]}`,
      txs: [this.txRec("applyAction (verify+resolve)", hash)],
    };
  }

  /** step 6: naive vault wrongfully liquidates; aware vault refuses. */
  async liquidate(): Promise<DemoStepResult> {
    const { mockUSDG, naiveVault, awareVault } = this.m;
    const txs: DemoStepResult["txs"] = [];
    const liq = this.liquidator;
    const allowance = await this.read<bigint>(mockUSDG, MockUSDGAbi, "allowance", [
      liq.address,
      naiveVault,
    ]);
    if (allowance < DEMO_BORROW) {
      txs.push(
        this.txRec(
          "liquidator approve mUSDG",
          await this.send(liq, mockUSDG, MockUSDGAbi, "approve", [naiveVault, DEMO_BORROW * 10n]),
        ),
      );
    }
    txs.push(
      this.txRec(
        "naive liquidate(user) — WRONGFUL",
        await this.send(liq, naiveVault, NaiveVaultAbi, "liquidate", [this.user.address]),
      ),
    );
    const awareErr = await this.simulateError(
      liq,
      awareVault,
      CorpShiftAwareVaultAbi,
      "liquidate",
      [this.user.address],
      "NotLiquidatable",
    );
    this.setStep(6);
    return {
      step: "liquidate",
      ok: true,
      detail: `naive vault seized a HEALTHY position; aware vault refused (${awareErr}) — CorpShift kept it economically correct`,
      txs,
      reverts: [{ label: "aware liquidate (protected)", error: awareErr }],
    };
  }

  /** advance one step — the UI's "next" button. */
  async step(): Promise<DemoStepResult> {
    const steps = [
      () => this.seed(),
      () => this.attest(),
      () => this.probe(),
      () => this.execute(),
      () => this.reconcile(),
      () => this.liquidate(),
    ];
    const at = this.metaStep();
    if (at >= steps.length) {
      return {
        step: "done",
        ok: true,
        detail: "scenario complete — call reset to run again",
        txs: [],
      };
    }
    if (this.busy) {
      return {
        step: "busy",
        ok: false,
        detail: "a step is already in flight — poll /v1/demo/state",
        txs: [],
      };
    }
    this.busy = true;
    try {
      return await steps[at]!();
    } finally {
      this.busy = false;
    }
  }

  /** ensure the evm snapshot exists (call once at boot on local chains). */
  async prepare(): Promise<void> {
    if (this.isLocal && !this.snapshotId) {
      this.snapshotId = (await this.pub.request({
        method: "evm_snapshot" as never,
        params: [] as never,
      })) as Hex;
      // Resync persisted step metadata when the chain sits at the deploy
      // baseline — demo.step survives redeploys in the shared db and would
      // otherwise claim step N on a fresh chain. If the chain is dirty the
      // scenario is mid-flight and the stored step stays authoritative.
      try {
        const [mult, naiveRaw] = await Promise.all([
          this.read<bigint>(this.m.mockStockToken, MockStockTokenAbi, "uiMultiplier"),
          this.read<bigint>(this.m.naiveVault, NaiveVaultAbi, "collateralRaw", [this.user.address]),
        ]);
        if (mult === 10n ** 18n && naiveRaw === 0n) {
          this.setStep(0);
          this.store.setMeta("demo.actionId", "");
        }
      } catch {
        /* manifest incomplete pre-deploy — step stays as stored */
      }
    }
  }

  /* ------------------------- state ------------------------- */

  private async vaultView(vault: Address, abi: unknown, user: Address) {
    const [raw, value, debt, hf] = await Promise.all([
      this.read<bigint>(vault, abi, "collateralRaw", [user]),
      this.read<bigint>(vault, abi, "collateralValue", [user]),
      this.read<bigint>(vault, abi, "debtOf", [user]),
      this.read<bigint>(vault, abi, "healthFactor", [user]),
    ]);
    return {
      collateralRaw: raw.toString(),
      collateralValue: value.toString(),
      debt: debt.toString(),
      healthFactor: hf.toString(),
    };
  }

  async state() {
    const m = this.m;
    const user = this.user.address;
    const [
      state,
      factor,
      verifiedFactor,
      pending,
      multiplier,
      price,
      naive,
      aware,
      stockBal,
      debtBal,
    ] = await Promise.all([
      this.clients.corpshift.assetState(m.mockStockToken),
      this.clients.corpshift.normalizationFactor(m.mockStockToken),
      this.clients.corpshift.verifiedFactor(m.mockStockToken),
      this.clients.corpshift.pendingAction(m.mockStockToken),
      this.read<bigint>(m.mockStockToken, MockStockTokenAbi, "uiMultiplier"),
      this.read<bigint>(m.priceOracle, MockPriceOracleAbi, "latestAnswer", [m.mockStockToken]),
      this.vaultView(m.naiveVault, NaiveVaultAbi, user),
      this.vaultView(m.awareVault, CorpShiftAwareVaultAbi, user),
      this.read<bigint>(m.mockStockToken, MockStockTokenAbi, "balanceOf", [user]),
      this.read<bigint>(m.mockUSDG, MockUSDGAbi, "balanceOf", [user]),
    ]);
    let pendingEffectiveAt: number | null = null;
    if (pending !== ZERO_BYTES32) {
      try {
        pendingEffectiveAt = Number((await this.clients.corpshift.getAction(pending)).effectiveAt);
      } catch {
        /* pending id not yet readable — countdown just stays hidden */
      }
    }
    return {
      step: this.metaStep(),
      chainId: this.cfg.chainId,
      registry: this.cfg.manifest.registry,
      contracts: {
        naiveVault: m.naiveVault,
        awareVault: m.awareVault,
        priceOracle: m.priceOracle,
        debtToken: m.mockUSDG,
      },
      user,
      asset: m.mockStockToken,
      assetState: ASSET_STATE_NAMES[state as AssetState],
      normalizationFactor: factor.toString(),
      verifiedFactor: verifiedFactor.toString(),
      pendingActionId: pending,
      pendingEffectiveAt,
      demoActionId: this.store.getMeta("demo.actionId") || null,
      uiMultiplier: multiplier.toString(),
      price: price.toString(),
      userStockBalance: stockBal.toString(),
      userDebtTokenBalance: debtBal.toString(),
      vaults: { naive, aware },
      roles: {
        user: this.user.address,
        operator: this.operator.address,
        liquidator: this.liquidator.address,
        attester: this.attester.address,
      },
    };
  }
}
