/**
 * EIP-712 typed-data construction — byte-for-byte identical to
 * `AttestationLib.sol`:
 *   domain:  EIP712Domain(name="CorpShift", version="1", chainId, verifyingContract)
 *   primary: CorporateAction(bytes32 schemaHash, bytes32 sourceHash,
 *           bytes32 sourceEventId, address asset, uint8 actionType,
 *           uint64 announcedAt, uint64 effectiveAt, uint64 observedAt,
 *           bytes32 paramsHash, bytes32 evidenceHash)
 */
import { hashTypedData, type Address, type Hex } from "viem";
import type { ActionPayload, CanonicalizedAction } from "./types.js";
import { canonicalize } from "./canonicalize.js";
import type { CanonicalAction } from "./types.js";

export const EIP712_NAME = "CorpShift";
export const EIP712_VERSION = "1";

export const CORPORATE_ACTION_TYPES = {
  CorporateAction: [
    { name: "schemaHash", type: "bytes32" },
    { name: "sourceHash", type: "bytes32" },
    { name: "sourceEventId", type: "bytes32" },
    { name: "asset", type: "address" },
    { name: "actionType", type: "uint8" },
    { name: "announcedAt", type: "uint64" },
    { name: "effectiveAt", type: "uint64" },
    { name: "observedAt", type: "uint64" },
    { name: "paramsHash", type: "bytes32" },
    { name: "evidenceHash", type: "bytes32" },
  ],
} as const;

export interface AttestationDomain {
  chainId: number | bigint;
  verifyingContract: Address;
}

export function attestationDomain(d: AttestationDomain) {
  return {
    name: EIP712_NAME,
    version: EIP712_VERSION,
    chainId: d.chainId,
    verifyingContract: d.verifyingContract,
  } as const;
}

export function attestationTypedData(payload: ActionPayload, domain: AttestationDomain) {
  return {
    domain: attestationDomain(domain),
    types: CORPORATE_ACTION_TYPES,
    primaryType: "CorporateAction",
    message: {
      schemaHash: payload.schemaHash,
      sourceHash: payload.sourceHash,
      sourceEventId: payload.sourceEventId,
      asset: payload.asset,
      actionType: payload.actionType,
      announcedAt: payload.announcedAt,
      effectiveAt: payload.effectiveAt,
      observedAt: payload.observedAt,
      paramsHash: payload.paramsHash,
      evidenceHash: payload.evidenceHash,
    },
  } as const;
}

/** The exact digest `ECDSA.recover` checks inside `submitAction`. */
export function attestDigest(payload: ActionPayload, domain: AttestationDomain): Hex {
  return hashTypedData(attestationTypedData(payload, domain));
}

/** Canonicalize + produce everything a signer/submitter needs. */
export function attestableAction(
  action: CanonicalAction,
  domain: AttestationDomain,
): CanonicalizedAction & { digest: Hex; typedData: ReturnType<typeof attestationTypedData> } {
  const c = canonicalize(action);
  const typedData = attestationTypedData(c.payload, domain);
  return { ...c, typedData, digest: hashTypedData(typedData) };
}
