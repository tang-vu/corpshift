// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CorpShiftTypes} from "./CorpShiftTypes.sol";

/// @title ECDSA
/// @notice Minimal ECDSA recovery with malleability protection.
/// @dev    Rejects signatures with s in the upper half-order (EIP-2) and any
///         recovery id other than 27/28, so a given digest has exactly one
///         acceptable signature encoding per signer.
library ECDSA {
    error InvalidSignature();
    error InvalidSignatureLength();
    error InvalidSignatureS();

    /// @notice Recover the signer of `digest` from a 65-byte (r, s, v) signature.
    function recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) revert InvalidSignatureLength();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 0x20))
            v := byte(0, calldataload(add(signature.offset, 0x40)))
        }
        return recover(digest, v, r, s);
    }

    /// @notice Recover the signer of `digest` from split (v, r, s) components.
    function recover(bytes32 digest, uint8 v, bytes32 r, bytes32 s) internal pure returns (address) {
        // secp256k1n/2 — signatures with s above this are malleable (EIP-2).
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            revert InvalidSignatureS();
        }
        if (v != 27 && v != 28) revert InvalidSignature();
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
        return signer;
    }
}

/// @title AttestationLib
/// @notice EIP-712 typed-data hashing for CorpShift corporate-action
///         attestations.
/// @dev    Domain separator binds every signature to (name, version, chainId,
///         verifyingContract), so attestations cannot be replayed across
///         chains or across CorpShift deployments. `block.chainid` is read
///         fresh each call — a chain that forks keeps signatures valid on the
///         fork only if it keeps the same chain id, which is the desired
///         EIP-712 semantics.
library AttestationLib {
    bytes32 public constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 public constant ACTION_TYPEHASH = keccak256(
        "CorporateAction(bytes32 schemaHash,bytes32 sourceHash,bytes32 sourceEventId,"
        "address asset,uint8 actionType,uint64 announcedAt,uint64 effectiveAt,"
        "uint64 observedAt,bytes32 paramsHash,bytes32 evidenceHash)"
    );

    /// @notice Canonical schema identifier for `corpshift.action.v1`.
    bytes32 public constant SCHEMA_V1 = keccak256("corpshift.action.v1");

    bytes32 internal constant NAME_HASH = keccak256("CorpShift");
    bytes32 internal constant VERSION_HASH = keccak256("1");

    /// @notice The EIP-712 domain separator for this contract on this chain.
    function domainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    /// @notice Hash an ActionPayload per EIP-712.
    function hashAction(CorpShiftTypes.ActionPayload calldata p) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                ACTION_TYPEHASH,
                p.schemaHash,
                p.sourceHash,
                p.sourceEventId,
                p.asset,
                p.actionType,
                p.announcedAt,
                p.effectiveAt,
                p.observedAt,
                p.paramsHash,
                p.evidenceHash
            )
        );
    }

    /// @notice The final EIP-712 digest a signer must sign for `payload`.
    function digest(CorpShiftTypes.ActionPayload calldata payload) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), hashAction(payload)));
    }

    /// @notice Derive the canonical action id.
    /// @dev    Pure function of (source, sourceEventId): one source event can
    ///         only ever produce one action id, which is the replay anchor.
    function actionIdOf(bytes32 sourceHash, bytes32 sourceEventId) internal pure returns (bytes32) {
        return keccak256(abi.encode(sourceHash, sourceEventId));
    }
}
