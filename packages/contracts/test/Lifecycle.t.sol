// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CorpShiftTest} from "./helpers/CorpShiftTest.sol";
import {CorpShiftTypes} from "../src/libraries/CorpShiftTypes.sol";
import {CorpShiftRegistry} from "../src/CorpShiftRegistry.sol";

/// @title LifecycleTest
/// @notice End-to-end corporate-action lifecycles: split (the killer flow),
///         halt/resume, merger, redemption, invalidation, unsupported types,
///         and the reconciliation-mismatch path to DEGRADED.
contract LifecycleTest is CorpShiftTest {
    uint8 internal constant FS = uint8(CorpShiftTypes.ActionType.FORWARD_SPLIT);
    uint8 internal constant RS = uint8(CorpShiftTypes.ActionType.REVERSE_SPLIT);
    uint8 internal constant HALT = uint8(CorpShiftTypes.ActionType.TRADING_HALT);
    uint8 internal constant RESUME = uint8(CorpShiftTypes.ActionType.TRADING_RESUME);

    function _state() internal view returns (CorpShiftTypes.AssetState) {
        return registry.assetRuntimeState(address(stock));
    }

    function _status(bytes32 id) internal view returns (CorpShiftTypes.ActionStatus) {
        return registry.getAction(id).status;
    }

    /*//////////////////////////////////////////////////////////////
                          FORWARD SPLIT FLOW
    //////////////////////////////////////////////////////////////*/

    function test_forwardSplit_fullLifecycle() public {
        uint64 effectiveAt = uint64(block.timestamp + 1 days);
        bytes32 id = _submit(
            keccak256("evt.4for1"), FS, uint64(block.timestamp - 1 days), effectiveAt, _splitParams(4, 1, 4e18)
        );

        // Announced: asset pending, action scheduled.
        assertEq(uint8(_state()), uint8(CorpShiftTypes.AssetState.ACTION_PENDING));
        assertEq(uint8(_status(id)), uint8(CorpShiftTypes.ActionStatus.SCHEDULED));

        // Early crank reverts.
        vm.expectRevert(abi.encodeWithSelector(CorpShiftRegistry.ActionNotYetEffective.selector, id, effectiveAt));
        registry.activateAction(id);

        // Effective time arrives — the issuer's token schedules the new
        // multiplier (mirrors the real Stock Token's newUIMultiplier path).
        vm.warp(effectiveAt);
        vm.prank(admin);
        stock.scheduleMultiplierUpdate(4e18, effectiveAt);

        // Crank: SCHEDULED → ACTIVE, asset ADJUSTING.
        registry.activateAction(id);
        assertEq(uint8(_status(id)), uint8(CorpShiftTypes.ActionStatus.ACTIVE));
        assertEq(uint8(_state()), uint8(CorpShiftTypes.AssetState.ADJUSTING));

        // Reconcile: token's live multiplier now reads 4e18 → matches the
        // attested expectation → RESOLVED, asset back to ACTIVE.
        stock.syncMultiplier();
        bool ok = registry.applyAction(id);
        assertTrue(ok);
        assertEq(uint8(_status(id)), uint8(CorpShiftTypes.ActionStatus.RESOLVED));
        assertEq(uint8(_state()), uint8(CorpShiftTypes.AssetState.ACTIVE));
        assertEq(registry.verifiedNormalizationFactor(address(stock)), 4e18);
        assertEq(registry.pendingCorporateAction(address(stock)), bytes32(0));
    }

    function test_applyBeforeTokenUpdated_degrades() public {
        uint64 effectiveAt = uint64(block.timestamp + 1 days);
        bytes32 id = _submit(
            keccak256("evt.4for1.late"), FS, uint64(block.timestamp - 1 days), effectiveAt, _splitParams(4, 1, 4e18)
        );
        vm.warp(effectiveAt);
        // The issuer has NOT scheduled the multiplier yet — token still 1e18.
        registry.activateAction(id);

        // Reconciliation fails loudly: expected 4e18, actual 1e18 → DEGRADED.
        bool ok = registry.applyAction(id);
        assertFalse(ok);
        assertEq(uint8(_state()), uint8(CorpShiftTypes.AssetState.DEGRADED));
        // Action stays ACTIVE — retryable once the token catches up.
        assertEq(uint8(_status(id)), uint8(CorpShiftTypes.ActionStatus.ACTIVE));

        // Token catches up; retry reconciles.
        vm.prank(admin);
        stock.scheduleMultiplierUpdate(4e18, effectiveAt);
        stock.syncMultiplier();
        ok = registry.applyAction(id);
        assertTrue(ok);
        // Asset remains DEGRADED until governance reconciles — a mismatch is
        // evidence, not something to silently sweep under a retry.
        assertEq(uint8(_state()), uint8(CorpShiftTypes.AssetState.DEGRADED));
        vm.prank(admin);
        registry.reconcileAsset(address(stock));
        assertEq(uint8(_state()), uint8(CorpShiftTypes.AssetState.ACTIVE));
        assertEq(registry.verifiedNormalizationFactor(address(stock)), 4e18);
    }

    function test_effectiveNowSplit_immediatelyActive() public {
        // Action already effective at submission → ACTIVE + ADJUSTING now.
        vm.prank(admin);
        stock.scheduleMultiplierUpdate(4e18, block.timestamp);
        stock.syncMultiplier();
        bytes32 id = _submit(
            keccak256("evt.now"),
            FS,
            uint64(block.timestamp - 2 days),
            uint64(block.timestamp),
            _splitParams(4, 1, 4e18)
        );
        assertEq(uint8(_status(id)), uint8(CorpShiftTypes.ActionStatus.ACTIVE));
        assertEq(uint8(_state()), uint8(CorpShiftTypes.AssetState.ADJUSTING));
        bool ok = registry.applyAction(id);
        assertTrue(ok);
        assertEq(uint8(_state()), uint8(CorpShiftTypes.AssetState.ACTIVE));
    }

    /*//////////////////////////////////////////////////////////////
                          HALT / RESUME
    //////////////////////////////////////////////////////////////*/

    function test_haltAndResume() public {
        bytes32 haltId = _submit(
            keccak256("evt.halt"),
            HALT,
            uint64(block.timestamp - 1),
            uint64(block.timestamp),
            abi.encode("volatility pause")
        );
        assertEq(uint8(_state()), uint8(CorpShiftTypes.AssetState.HALTED));
        assertEq(uint8(_status(haltId)), uint8(CorpShiftTypes.ActionStatus.ACTIVE));
        assertEq(registry.activeHaltAction(address(stock)), haltId);

        // applyAction on a halt is invalid — it resolves via resume only.
        vm.expectRevert(abi.encodeWithSelector(CorpShiftRegistry.InvalidParams.selector, "halt resolves via resume"));
        registry.applyAction(haltId);

        bytes32 resumeId = _submit(
            keccak256("evt.resume"), RESUME, uint64(block.timestamp), uint64(block.timestamp), abi.encode("halt lifted")
        );
        assertEq(uint8(_state()), uint8(CorpShiftTypes.AssetState.ACTIVE));
        // Halt record resolved; resume record resolves on apply.
        assertEq(uint8(_status(haltId)), uint8(CorpShiftTypes.ActionStatus.RESOLVED));
        assertEq(registry.activeHaltAction(address(stock)), bytes32(0));
        registry.applyAction(resumeId);
        assertEq(uint8(_status(resumeId)), uint8(CorpShiftTypes.ActionStatus.RESOLVED));
    }

    /*//////////////////////////////////////////////////////////////
                          MERGER / REDEMPTION
    //////////////////////////////////////////////////////////////*/

    function test_mergerTransitionsToRedeeming() public {
        bytes32 id = _submit(
            keccak256("evt.merger"),
            _t(CorpShiftTypes.ActionType.MERGER),
            uint64(block.timestamp - 1 days),
            uint64(block.timestamp),
            abi.encode(address(0), uint256(42e6), uint256(0)) // cash merger
        );
        assertEq(uint8(_state()), uint8(CorpShiftTypes.AssetState.MIGRATING));
        registry.applyAction(id);
        assertEq(uint8(_state()), uint8(CorpShiftTypes.AssetState.REDEEMING));
        assertEq(uint8(_status(id)), uint8(CorpShiftTypes.ActionStatus.RESOLVED));
    }

    function test_redemptionStaysRedeeming() public {
        bytes32 id = _submit(
            keccak256("evt.redeem"),
            _t(CorpShiftTypes.ActionType.REDEMPTION),
            uint64(block.timestamp - 1 days),
            uint64(block.timestamp),
            abi.encode(uint256(105e6)) // redemption rate per unit
        );
        assertEq(uint8(_state()), uint8(CorpShiftTypes.AssetState.REDEEMING));
        registry.applyAction(id);
        assertEq(uint8(_status(id)), uint8(CorpShiftTypes.ActionStatus.RESOLVED));
        // Asset stays REDEEMING — winding down is sticky until governance.
        assertEq(uint8(_state()), uint8(CorpShiftTypes.AssetState.REDEEMING));
    }

    /*//////////////////////////////////////////////////////////////
                        INVALIDATION / EDGE PATHS
    //////////////////////////////////////////////////////////////*/

    function test_invalidateScheduledAction_restoresActive() public {
        bytes32 id = _submit(
            keccak256("evt.cancel"),
            FS,
            uint64(block.timestamp - 1 days),
            uint64(block.timestamp + 1 days),
            _splitParams(4, 1, 4e18)
        );
        assertEq(uint8(_state()), uint8(CorpShiftTypes.AssetState.ACTION_PENDING));
        vm.prank(admin);
        registry.invalidateAction(id, bytes32("source correction"));
        assertEq(uint8(_status(id)), uint8(CorpShiftTypes.ActionStatus.INVALIDATED));
        assertEq(uint8(_state()), uint8(CorpShiftTypes.AssetState.ACTIVE));
        assertEq(registry.pendingCorporateAction(address(stock)), bytes32(0));

        // Invalidated action can't be cranked.
        vm.warp(block.timestamp + 2 days);
        vm.expectRevert();
        registry.activateAction(id);
    }

    function test_revert_activateNotScheduled() public {
        bytes32 id = _submit(
            keccak256("evt.now2"),
            FS,
            uint64(block.timestamp - 1 days),
            uint64(block.timestamp),
            _splitParams(4, 1, 4e18)
        );
        vm.expectRevert(abi.encodeWithSelector(CorpShiftRegistry.ActionNotScheduled.selector, id));
        registry.activateAction(id);
    }

    function test_revert_applyUnknownAction() public {
        vm.expectRevert();
        registry.applyAction(keccak256("nonexistent"));
    }

    function test_symbolChangeInformational() public {
        bytes32 id = _submit(
            keccak256("evt.rename"),
            _t(CorpShiftTypes.ActionType.SYMBOL_CHANGE),
            uint64(block.timestamp - 1),
            uint64(block.timestamp),
            abi.encode("XYZ2")
        );
        // Informational: asset stays ACTIVE throughout.
        assertEq(uint8(_state()), uint8(CorpShiftTypes.AssetState.ACTIVE));
        registry.applyAction(id);
        assertEq(uint8(_status(id)), uint8(CorpShiftTypes.ActionStatus.RESOLVED));
        assertEq(uint8(_state()), uint8(CorpShiftTypes.AssetState.ACTIVE));
    }

    function test_actionHistoryAccumulates() public {
        _submit(keccak256("e1"), HALT, uint64(block.timestamp - 1), uint64(block.timestamp), "");
        _submit(keccak256("e2"), RESUME, uint64(block.timestamp), uint64(block.timestamp), "");
        _submit(
            keccak256("e3"), FS, uint64(block.timestamp), uint64(block.timestamp + 1 days), _splitParams(4, 1, 4e18)
        );
        bytes32[] memory h = registry.getActionHistory(address(stock));
        assertEq(h.length, 3);
    }
}
