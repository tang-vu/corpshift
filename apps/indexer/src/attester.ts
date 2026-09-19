/**
 * EIP-712 attestation — signs canonical actions offline with the attester
 * key. The produced (payload, params, signature) triple is exactly what
 * `CorpShiftRegistry.submitAction` verifies.
 */
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import {
  attestableAction,
  type ActionPayload,
  type CanonicalAction,
} from "@corpshift/core";

export interface SignedAction {
  payload: ActionPayload;
  params: Hex;
  signature: Hex;
  actionId: Hex;
  digest: Hex;
  signer: Address;
}

export class Attester {
  readonly account: PrivateKeyAccount;
  private readonly chainId: bigint;
  private readonly verifyingContract: Address;

  constructor(key: Hex, chainId: bigint, verifyingContract: Address) {
    this.chainId = chainId;
    this.verifyingContract = verifyingContract;
    this.account = privateKeyToAccount(key);
  }

  get address(): Address {
    return this.account.address;
  }

  async sign(action: CanonicalAction): Promise<SignedAction> {
    const a = attestableAction(action, {
      chainId: this.chainId,
      verifyingContract: this.verifyingContract,
    });
    const signature = await this.account.signTypedData({
      domain: a.typedData.domain,
      types: a.typedData.types,
      primaryType: "CorporateAction",
      message: a.typedData.message,
    });
    return {
      payload: a.payload,
      params: a.encodedParams,
      signature,
      actionId: a.actionId,
      digest: a.digest,
      signer: this.account.address,
    };
  }
}
