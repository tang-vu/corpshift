/**
 * Onchain submitter — relays signed actions to the registry and cranks the
 * lifecycle (activate/apply). Records tx hashes for the audit trail.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { CorpShiftRegistryAbi } from "@corpshift/sdk";
import type { SignedAction } from "./attester.ts";

export interface SubmissionResult {
  actionId: Hex;
  txHash: Hex;
  blockNumber: bigint;
}

export class Submitter {
  readonly publicClient: PublicClient;
  readonly wallet: WalletClient;
  readonly account: PrivateKeyAccount;
  private readonly registry: Address;

  constructor(rpcUrl: string, operatorKey: Hex, registry: Address, chain?: { id: number }) {
    this.registry = registry;
    this.account = privateKeyToAccount(operatorKey);
    this.publicClient = createPublicClient({ transport: http(rpcUrl) });
    this.wallet = createWalletClient({
      account: this.account,
      transport: http(rpcUrl),
      ...(chain ? { chain: chain as never } : {}),
    });
  }

  async submit(signed: SignedAction): Promise<SubmissionResult> {
    const txHash = await this.wallet.writeContract({
      account: this.account,
      address: this.registry,
      abi: CorpShiftRegistryAbi,
      functionName: "submitAction",
      args: [signed.payload, signed.params, signed.signature],
      chain: null,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      throw new Error(`submitAction reverted: ${txHash}`);
    }
    return { actionId: signed.actionId, txHash, blockNumber: receipt.blockNumber };
  }

  async activate(actionId: Hex): Promise<Hex | undefined> {
    return this.crank("activateAction", actionId);
  }

  async apply(actionId: Hex): Promise<Hex | undefined> {
    return this.crank("applyAction", actionId);
  }

  /** Crank calls are best-effort: reverts (not yet effective, already
   *  resolved) are routine during polling, not errors. */
  private async crank(
    fn: "activateAction" | "applyAction",
    actionId: Hex,
  ): Promise<Hex | undefined> {
    try {
      const txHash = await this.wallet.writeContract({
        account: this.account,
        address: this.registry,
        abi: CorpShiftRegistryAbi,
        functionName: fn,
        args: [actionId],
        chain: null,
      });
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      return receipt.status === "success" ? txHash : undefined;
    } catch {
      return undefined;
    }
  }
}
