// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CorpShiftTest} from "./helpers/CorpShiftTest.sol";
import {CorpShiftTypes} from "../src/libraries/CorpShiftTypes.sol";
import {AttestationLib} from "../src/libraries/AttestationLib.sol";
import {CorpShiftRegistry} from "../src/CorpShiftRegistry.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";

/// @title AttestationTest
/// @notice Security coverage for the EIP-712 attestation path: wrong signer,
///         replay, cross-domain replay, tampered payload, malformed sigs,
///         schema mismatch, and duplicate source events.
contract AttestationTest is CorpShiftTest {
    uint256 internal constant ATTACKER_KEY = 0xBAD;

    function _splitPayload(uint64 effectiveAt)
        internal
        view
        returns (CorpShiftTypes.ActionPayload memory, bytes memory)
    {
        bytes memory params = _splitParams(4, 1, 4e18);
        CorpShiftTypes.ActionPayload memory p = _payload(
            keccak256("evt.split.1"),
            address(stock),
            _t(CorpShiftTypes.ActionType.FORWARD_SPLIT),
            uint64(block.timestamp - 1 days),
            effectiveAt,
            uint64(block.timestamp),
            params
        );
        return (p, params);
    }

    function test_submit_validAttestation_schedules() public {
        (CorpShiftTypes.ActionPayload memory p, bytes memory params) = _splitPayload(uint64(block.timestamp + 1 days));
        bytes32 actionId = registry.submitAction(p, params, _sign(p, ATTESTER_KEY));

        CorpShiftTypes.ActionRecord memory rec = registry.getAction(actionId);
        assertEq(uint8(rec.status), uint8(CorpShiftTypes.ActionStatus.SCHEDULED));
        assertEq(rec.attestedBy, attester);
        assertEq(rec.asset, address(stock));
        assertEq(rec.effectiveAt, p.effectiveAt);
        assertEq(rec.paramsHash, keccak256(params));

        // Economic scheduled action moves the asset to ACTION_PENDING.
        assertEq(uint8(registry.assetRuntimeState(address(stock))), uint8(CorpShiftTypes.AssetState.ACTION_PENDING));
        assertEq(registry.pendingCorporateAction(address(stock)), actionId);
    }

    function test_revert_wrongSigner() public {
        (CorpShiftTypes.ActionPayload memory p, bytes memory params) = _splitPayload(uint64(block.timestamp + 1 days));
        bytes memory sig = _sign(p, ATTACKER_KEY);
        address attacker = vm.addr(ATTACKER_KEY);
        vm.expectRevert(abi.encodeWithSelector(CorpShiftRegistry.InvalidSigner.selector, attacker));
        registry.submitAction(p, params, sig);
    }

    function test_revert_replayedSignature_duplicateAction() public {
        (CorpShiftTypes.ActionPayload memory p, bytes memory params) = _splitPayload(uint64(block.timestamp + 1 days));
        bytes memory sig = _sign(p, ATTESTER_KEY);
        registry.submitAction(p, params, sig);

        bytes32 actionId = AttestationLib.actionIdOf(p.sourceHash, p.sourceEventId);
        vm.expectRevert(abi.encodeWithSelector(CorpShiftRegistry.DuplicateAction.selector, actionId));
        registry.submitAction(p, params, sig);
    }

    function test_revert_tamperedParams() public {
        (CorpShiftTypes.ActionPayload memory p, bytes memory params) = _splitPayload(uint64(block.timestamp + 1 days));
        bytes memory sig = _sign(p, ATTESTER_KEY);

        // Attacker swaps in different params — hash mismatch caught before
        // signature verification even runs.
        bytes memory evil = _splitParams(8, 1, 8e18);
        vm.expectRevert(abi.encodeWithSelector(CorpShiftRegistry.InvalidParams.selector, "params hash mismatch"));
        registry.submitAction(p, evil, sig);
    }

    function test_revert_signatureOverDifferentPayload() public {
        (CorpShiftTypes.ActionPayload memory p1, bytes memory params1) = _splitPayload(uint64(block.timestamp + 1 days));
        bytes memory sigForP1 = _sign(p1, ATTESTER_KEY);

        // Same signer, but the signature commits to p1's digest — replayed
        // against a different payload it recovers a non-attester address.
        CorpShiftTypes.ActionPayload memory p2 = _payload(
            keccak256("evt.split.2"),
            address(stock),
            _t(CorpShiftTypes.ActionType.FORWARD_SPLIT),
            uint64(block.timestamp - 1 days),
            uint64(block.timestamp + 2 days),
            uint64(block.timestamp),
            params1
        );
        vm.expectRevert(); // InvalidSigner(recovered != attester)
        registry.submitAction(p2, params1, sigForP1);
    }

    function test_revert_crossChainReplay() public {
        (CorpShiftTypes.ActionPayload memory p, bytes memory params) = _splitPayload(uint64(block.timestamp + 1 days));

        // Signature created on chainid X; replay on a different chain id.
        uint64 forkChain = 999_999;
        vm.chainId(forkChain);
        bytes memory sigOtherChain = _sign(p, ATTESTER_KEY);

        vm.chainId(31_337); // back to anvil default
        // The sig was made for a domain with chainId 999999 — digest differs.
        vm.expectRevert(); // InvalidSigner(recovered != attester)
        registry.submitAction(p, params, sigOtherChain);
    }

    function test_revert_crossContractReplay() public {
        // A signature valid for registry A must not verify on registry B.
        (CorpShiftTypes.ActionPayload memory p, bytes memory params) = _splitPayload(uint64(block.timestamp + 1 days));
        bytes memory sigA = _sign(p, ATTESTER_KEY);

        vm.prank(admin);
        CorpShiftRegistry registryB = new CorpShiftRegistry(address(new PolicyEngine()), attester);
        // Same signer set, different verifyingContract → different domain.
        vm.expectRevert();
        registryB.submitAction(p, params, sigA);
    }

    function test_revert_invalidSchema() public {
        bytes memory params = _splitParams(4, 1, 4e18);
        CorpShiftTypes.ActionPayload memory p = _payload(
            keccak256("evt.bad.schema"),
            address(stock),
            _t(CorpShiftTypes.ActionType.FORWARD_SPLIT),
            uint64(block.timestamp),
            uint64(block.timestamp + 1),
            uint64(block.timestamp),
            params
        );
        p.schemaHash = keccak256("corpshift.action.v999");
        bytes memory sig = _sign(p, ATTESTER_KEY);
        vm.expectRevert(abi.encodeWithSelector(CorpShiftRegistry.InvalidSchema.selector, p.schemaHash));
        registry.submitAction(p, params, sig);
    }

    function test_revert_malformedSignatureLength() public {
        (CorpShiftTypes.ActionPayload memory p, bytes memory params) = _splitPayload(uint64(block.timestamp + 1 days));
        vm.expectRevert(); // InvalidSignatureLength
        registry.submitAction(p, params, hex"1234");
    }

    function test_revert_malleableHighS() public {
        (CorpShiftTypes.ActionPayload memory p, bytes memory params) = _splitPayload(uint64(block.timestamp + 1 days));
        bytes32 digest = registry.attestDigest(p);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTESTER_KEY, digest);
        // Malleate: s' = n - s (still valid ECDSA, rejected by EIP-2 check).
        bytes32 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes32 s2 = bytes32(uint256(n) - uint256(s));
        uint8 v2 = v == 27 ? 28 : 27;
        vm.expectRevert(); // InvalidSignatureS
        registry.submitAction(p, params, abi.encodePacked(r, s2, v2));
    }

    function test_revert_revokedSigner() public {
        (CorpShiftTypes.ActionPayload memory p, bytes memory params) = _splitPayload(uint64(block.timestamp + 1 days));
        bytes memory sig = _sign(p, ATTESTER_KEY);
        vm.prank(admin);
        registry.setSigner(attester, false);
        vm.expectRevert(abi.encodeWithSelector(CorpShiftRegistry.InvalidSigner.selector, attester));
        registry.submitAction(p, params, sig);
    }

    function test_revert_onlyOwnerCanSetSigner() public {
        vm.prank(alice);
        vm.expectRevert(); // Unauthorized
        registry.setSigner(alice, true);
    }

    function test_revert_zeroAsset() public {
        bytes memory params = _splitParams(4, 1, 4e18);
        CorpShiftTypes.ActionPayload memory p = _payload(
            keccak256("evt.zero.asset"),
            address(0),
            _t(CorpShiftTypes.ActionType.FORWARD_SPLIT),
            uint64(block.timestamp),
            uint64(block.timestamp + 1),
            uint64(block.timestamp),
            params
        );
        bytes memory sig = _sign(p, ATTESTER_KEY);
        vm.expectRevert(abi.encodeWithSelector(CorpShiftRegistry.InvalidAsset.selector, address(0)));
        registry.submitAction(p, params, sig);
    }

    function test_unsupportedTypeMarksUnsupportedAndDegrades() public {
        bytes32 actionId = _submit(
            keccak256("evt.unknown.1"),
            _t(CorpShiftTypes.ActionType.UNKNOWN),
            uint64(block.timestamp - 1),
            uint64(block.timestamp + 1 days),
            abi.encode(uint256(1))
        );
        CorpShiftTypes.ActionRecord memory rec = registry.getAction(actionId);
        assertEq(uint8(rec.status), uint8(CorpShiftTypes.ActionStatus.UNSUPPORTED));
        // Unmodelled action → asset flagged DEGRADED (we can't prove correctness).
        assertEq(uint8(registry.assetRuntimeState(address(stock))), uint8(CorpShiftTypes.AssetState.DEGRADED));
    }

    function testFuzz_anyUnsignedPayloadReverts(bytes32 eventId, uint8 rawType, uint64 effectiveAt, bytes memory params)
        public
    {
        rawType = uint8(bound(rawType, 0, 11));
        CorpShiftTypes.ActionPayload memory p = _payload(
            eventId, address(stock), rawType, uint64(block.timestamp), effectiveAt, uint64(block.timestamp), params
        );
        bytes memory sig = _sign(p, ATTACKER_KEY);
        // Attacker key is never authorized → always InvalidSigner.
        vm.expectRevert();
        registry.submitAction(p, params, sig);
    }
}
