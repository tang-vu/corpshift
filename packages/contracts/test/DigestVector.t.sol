// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CorpShiftTest} from "./helpers/CorpShiftTest.sol";
import {CorpShiftRegistry} from "../src/CorpShiftRegistry.sol";
import {CorpShiftTypes} from "../src/libraries/CorpShiftTypes.sol";
import {AttestationLib} from "../src/libraries/AttestationLib.sol";

/// @title DigestVectorTest
/// @notice Cross-implementation EIP-712 pin: the registry is etched at a
///         FIXED address and the chain id is fixed, so `attestDigest` is a
///         pure function of the payload. The TypeScript attestation code in
///         packages/core asserts the SAME digest — if either side's EIP-712
///         construction drifts, one of the two test suites fails.
contract DigestVectorTest is CorpShiftTest {
    // Fixed verification context — the TS test uses identical values.
    address internal constant VECTOR_CONTRACT = 0xc0f5c0f5C0F5c0f5C0f5c0F5C0F5c0f5C0f5c0F5;
    uint256 internal constant VECTOR_CHAIN = 46630;

    function _vectorPayload() internal pure returns (CorpShiftTypes.ActionPayload memory p) {
        bytes memory params = abi.encode(uint256(4), uint256(1), uint256(4e18));
        p = CorpShiftTypes.ActionPayload({
            schemaHash: AttestationLib.SCHEMA_V1,
            sourceHash: keccak256("robinhood-rhj"),
            sourceEventId: keccak256("fixture.crwd.forward-split.4for1.2026-07-02"),
            asset: 0xea72Ecca2d0f6bFA1394DBBCff85b52CD4233931, // CRWD
            actionType: 0, // FORWARD_SPLIT
            announcedAt: 1_781_625_600,
            effectiveAt: 1_782_999_000,
            observedAt: 1_782_864_000,
            paramsHash: keccak256(params),
            evidenceHash: keccak256("digest-vector-evidence")
        });
    }

    function test_digestVector_matchesTypeScriptImplementation() public {
        vm.chainId(VECTOR_CHAIN);
        vm.etch(VECTOR_CONTRACT, address(registry).code);
        bytes32 digest = CorpShiftRegistry(VECTOR_CONTRACT).attestDigest(_vectorPayload());
        emit log_named_bytes32("digest", digest);
        // Pinned value — also asserted by packages/core/test/eip712.test.ts.
        assertEq(
            digest,
            bytes32(0x3c797903908c70165d94936322246ba9613621e04d047ac52f240db971126aa9),
            "update this constant AND packages/core/test/eip712.test.ts together"
        );
    }

    function test_domainSeparatorVector() public {
        vm.chainId(VECTOR_CHAIN);
        vm.etch(VECTOR_CONTRACT, address(registry).code);
        bytes32 domain = CorpShiftRegistry(VECTOR_CONTRACT).domainSeparator();
        emit log_named_bytes32("domain", domain);
        assertEq(
            domain,
            bytes32(0x38a90cad00bfcf3aae4f2ebbc89dd2ad53627caf210f201facf1c3f87f225646),
            "update this constant AND packages/core/test/eip712.test.ts together"
        );
    }
}
