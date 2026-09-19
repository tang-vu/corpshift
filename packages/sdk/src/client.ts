/**
 * CorpShiftClient — the integration surface downstream protocols and the
 * CorpShift apps use. Reads go through a viem PublicClient; attested writes
 * sign EIP-712 typed data locally and relay `submitAction`.
 */
import {
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import {
  attestableAction,
  type AssetState,
  type CanonicalAction,
  type PolicyOp,
} from "@corpshift/core";
import { CorpShiftRegistryAbi } from "./abi/index.js";

export interface CorpShiftClientOptions {
  publicClient: PublicClient;
  registry: Address;
  /** Optional settlement vault address (for settlement helpers). */
  settlementVault?: Address;
  /** Chain id for EIP-712 domain binding. Defaults to publicClient.chain.id. */
  chainId?: number | bigint;
}

export interface PolicyDecision {
  allowed: boolean;
  reason: Hex;
}

export interface EconomicExposure {
  units: bigint;
  normalizationFactor: bigint;
  verifiedFactor: bigint;
  state: AssetState;
  pendingActionId: Hex;
}

export interface ActionRecord {
  actionId: Hex;
  sourceHash: Hex;
  sourceEventId: Hex;
  asset: Address;
  actionType: number;
  status: number;
  announcedAt: bigint;
  effectiveAt: bigint;
  observedAt: bigint;
  submittedAt: bigint;
  params: Hex;
  paramsHash: Hex;
  evidenceHash: Hex;
  attestedBy: Address;
}

export class CorpShiftClient {
  readonly publicClient: PublicClient;
  readonly registry: Address;
  readonly settlementVault?: Address;
  readonly chainId: bigint;

  constructor(opts: CorpShiftClientOptions) {
    this.publicClient = opts.publicClient;
    this.registry = opts.registry;
    if (opts.settlementVault) this.settlementVault = opts.settlementVault;
    this.chainId = BigInt(opts.chainId ?? this.publicClient.chain?.id ?? 0);
  }

  private read<T>(functionName: string, args: readonly unknown[] = []): Promise<T> {
    return this.publicClient.readContract({
      address: this.registry,
      abi: CorpShiftRegistryAbi,
      functionName,
      args,
    } as never) as Promise<T>;
  }

  /* ---------------------------- reads ---------------------------- */

  assetState(asset: Address): Promise<AssetState> {
    return this.read<AssetState>("assetRuntimeState", [asset]);
  }

  normalizationFactor(asset: Address): Promise<bigint> {
    return this.read<bigint>("normalizationFactor", [asset]);
  }

  verifiedFactor(asset: Address): Promise<bigint> {
    return this.read<bigint>("verifiedNormalizationFactor", [asset]);
  }

  economicBalanceOf(asset: Address, account: Address): Promise<bigint> {
    return this.read<bigint>("economicBalanceOf", [asset, account]);
  }

  economicUnitsOfAmount(asset: Address, amount: bigint): Promise<bigint> {
    return this.read<bigint>("economicUnitsOfAmount", [asset, amount]);
  }

  exposureOf(asset: Address, account: Address): Promise<EconomicExposure> {
    return this.read<EconomicExposure>("economicExposureOf", [asset, account]);
  }

  pendingAction(asset: Address): Promise<Hex> {
    return this.read<Hex>("pendingCorporateAction", [asset]);
  }

  getAction(actionId: Hex): Promise<ActionRecord> {
    return this.read<ActionRecord>("getAction", [actionId]);
  }

  actionHistory(asset: Address): Promise<readonly Hex[]> {
    return this.read<readonly Hex[]>("getActionHistory", [asset]);
  }

  assetCount(): Promise<bigint> {
    return this.read<bigint>("assetCount");
  }

  assetAt(index: bigint): Promise<Address> {
    return this.read<Address>("assetAt", [index]);
  }

  async listAssets(): Promise<Address[]> {
    const n = await this.assetCount();
    return Promise.all(
      Array.from({ length: Number(n) }, (_, i) => this.assetAt(BigInt(i))),
    );
  }

  domainSeparator(): Promise<Hex> {
    return this.read<Hex>("domainSeparator");
  }

  /* --------------------------- policy ---------------------------- */

  async checkPolicy(asset: Address, op: PolicyOp): Promise<PolicyDecision> {
    const [allowed, reason] = await this.read<readonly [boolean, Hex]>("checkPolicy", [
      asset,
      op,
    ]);
    return { allowed, reason };
  }

  canUseAsCollateral(asset: Address): Promise<boolean> {
    return this.read<boolean>("canUseAsCollateral", [asset]);
  }

  canTransferSafely(asset: Address): Promise<boolean> {
    return this.read<boolean>("canTransferSafely", [asset]);
  }

  canSettle(asset: Address): Promise<boolean> {
    return this.read<boolean>("canSettle", [asset]);
  }

  /* --------------------------- writes ---------------------------- */

  /** Sign + submit a canonical action. The wallet's address must be an
   *  authorized attester on the registry — otherwise the tx reverts with
   *  InvalidSigner. Returns the canonical actionId + tx hash. */
  async submitCanonicalAction(
    wallet: WalletClient,
    action: CanonicalAction,
    account: Account,
  ): Promise<{ actionId: Hex; txHash: Hex }> {
    const attestable = attestableAction(action, {
      chainId: this.chainId,
      verifyingContract: this.registry,
    });
    const signature = await wallet.signTypedData({
      account,
      domain: attestable.typedData.domain,
      types: attestable.typedData.types,
      primaryType: "CorporateAction",
      message: attestable.typedData.message,
    });
    const txHash = await wallet.writeContract({
      account,
      chain: wallet.chain ?? this.publicClient.chain,
      address: this.registry,
      abi: CorpShiftRegistryAbi,
      functionName: "submitAction",
      args: [attestable.payload, attestable.encodedParams, signature],
    } as never);
    return { actionId: attestable.actionId, txHash };
  }

  activateAction(wallet: WalletClient, actionId: Hex, account: Account): Promise<Hex> {
    return this.write(wallet, account, "activateAction", [actionId]);
  }

  applyAction(wallet: WalletClient, actionId: Hex, account: Account): Promise<Hex> {
    return this.write(wallet, account, "applyAction", [actionId]);
  }

  private write(
    wallet: WalletClient,
    account: Account,
    functionName: string,
    args: readonly unknown[],
  ): Promise<Hex> {
    return wallet.writeContract({
      account,
      chain: wallet.chain ?? this.publicClient.chain,
      address: this.registry,
      abi: CorpShiftRegistryAbi,
      functionName,
      args,
    } as never);
  }
}
