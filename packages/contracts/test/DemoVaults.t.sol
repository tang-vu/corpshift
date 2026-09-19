// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CorpShiftTest} from "./helpers/CorpShiftTest.sol";
import {CorpShiftTypes} from "../src/libraries/CorpShiftTypes.sol";
import {CorpShiftAwareVault} from "../src/demo/CorpShiftAwareVault.sol";
import {IERC20} from "../src/interfaces/IERC20Metadata.sol";

/// @title DemoVaultsTest
/// @notice THE KILLER DEMO, proven onchain: a 4:1 split makes NaiveVault
///         wrongfully liquidate a healthy position, while CorpShiftAwareVault
///         blocks unsafe operations during the transition and values the
///         position correctly throughout.
contract DemoVaultsTest is CorpShiftTest {
    uint256 internal constant DEPOSIT = 10e18; // 10 tokens
    uint256 internal constant DEBT = 400e6; //    $400 mUSDG

    function _setupPositions() internal {
        vm.startPrank(alice);
        stock.approve(address(naiveVault), type(uint256).max);
        stock.approve(address(awareVault), type(uint256).max);
        usdg.approve(address(naiveVault), type(uint256).max);
        usdg.approve(address(awareVault), type(uint256).max);
        naiveVault.deposit(DEPOSIT);
        awareVault.deposit(DEPOSIT);
        naiveVault.borrow(DEBT);
        awareVault.borrow(DEBT);
        vm.stopPrank();
    }

    function test_preSplit_healthFactorsAgree() public {
        _setupPositions();
        // 10 tokens @ $100 = $1000 collateral; $400 debt; LT 0.8 → HF 2.0.
        assertEq(naiveVault.healthFactor(alice), 2e18);
        assertEq(awareVault.healthFactor(alice), 2e18);
    }

    /// @dev THE DEMO: identical inputs, identical corporate action —
    ///      diametrically opposed outcomes.
    function test_killerDemo_splitWrongfulLiquidationVsProtection() public {
        _setupPositions();

        // ── Step 1: 4:1 split is attested (effective tomorrow) ────────────
        uint64 effectiveAt = uint64(block.timestamp + 1 days);
        bytes32 id = _submit(
            keccak256("evt.demo.4for1"),
            _t(CorpShiftTypes.ActionType.FORWARD_SPLIT),
            uint64(block.timestamp - 1 days),
            effectiveAt,
            _splitParams(4, 1, 4e18)
        );
        assertEq(uint8(registry.assetRuntimeState(address(stock))), uint8(CorpShiftTypes.AssetState.ACTION_PENDING));

        // ── Step 2: while pending, the aware vault blocks new risk ops ────
        vm.prank(alice);
        vm.expectRevert(); // UnsafeAssetState(BORROW, "ACTION_PENDING")
        awareVault.borrow(1e6);

        // The naive vault doesn't even know anything happened.
        vm.prank(alice);
        naiveVault.borrow(1e6); // happily borrows more on stale assumptions
        vm.prank(alice);
        naiveVault.repay(1e6); // tidy up the extra debt for the demo

        // ── Step 3: effective time — issuer schedules 4e18 multiplier ─────
        vm.warp(effectiveAt);
        vm.prank(admin);
        stock.scheduleMultiplierUpdate(4e18, effectiveAt);
        registry.activateAction(id); // → ADJUSTING

        // Share price updates 100 → 25 (4:1). Value per token unchanged.
        vm.prank(admin);
        oracle.setPrice(address(stock), 25e8);
        stock.syncMultiplier();

        // ── Step 4: reconcile — CorpShift verifies 4e18 landed onchain ────
        bool ok = registry.applyAction(id);
        assertTrue(ok);
        assertEq(uint8(registry.assetRuntimeState(address(stock))), uint8(CorpShiftTypes.AssetState.ACTIVE));

        // ── Step 5: the divergence, objectively measurable ────────────────
        //  Naive: 10 raw × $25 = $250 → HF 0.5 → "liquidatable" (WRONG).
        //  Aware: 40 units × $25 = $1000 → HF 2.0 → safe (CORRECT).
        assertEq(naiveVault.collateralValue(alice), 250e18);
        assertEq(awareVault.collateralValue(alice), 1000e18);
        assertEq(naiveVault.healthFactor(alice), 0.5e18);
        assertEq(awareVault.healthFactor(alice), 2e18);

        // ── Step 6: the naive vault wrongfully liquidates alice ───────────
        vm.startPrank(liquidator);
        usdg.approve(address(naiveVault), type(uint256).max);
        naiveVault.liquidate(alice); // SUCCEEDS — steals a healthy position
        vm.stopPrank();
        assertEq(naiveVault.collateralRaw(alice), 0);
        assertEq(naiveVault.debtOf(alice), 0);
        assertEq(stock.balanceOf(liquidator), 10e18); // seized collateral

        // The same call on the aware vault reverts — the position is healthy.
        vm.prank(liquidator);
        vm.expectRevert(); // NotLiquidatable
        awareVault.liquidate(alice);
        // Alice keeps her collateral; her economic position is intact.
        assertEq(awareVault.collateralRaw(alice), DEPOSIT);
        assertEq(awareVault.debtOf(alice), DEBT);
    }

    function test_borrowBlockedDuringPending_thenResumes() public {
        _setupPositions();
        uint64 effectiveAt = uint64(block.timestamp + 1 days);
        bytes32 id = _submit(
            keccak256("evt.demo.borrow"),
            _t(CorpShiftTypes.ActionType.FORWARD_SPLIT),
            uint64(block.timestamp - 1 days),
            effectiveAt,
            _splitParams(4, 1, 4e18)
        );

        vm.prank(alice);
        vm.expectRevert();
        awareVault.borrow(1e6);

        vm.warp(effectiveAt);
        vm.prank(admin);
        stock.scheduleMultiplierUpdate(4e18, effectiveAt);
        registry.activateAction(id);
        stock.syncMultiplier();
        registry.applyAction(id);

        // Resolved → borrows work again with normalized units.
        vm.prank(alice);
        awareVault.borrow(100e6); // HF still ≥1: value $1000, debt $500 → 1.6
        assertEq(awareVault.debtOf(alice), DEBT + 100e6);
    }

    function test_depositBlockedWhileAdjusting() public {
        _setupPositions();
        uint64 effectiveAt = uint64(block.timestamp + 1 days);
        bytes32 id = _submit(
            keccak256("evt.demo.dep"),
            _t(CorpShiftTypes.ActionType.FORWARD_SPLIT),
            uint64(block.timestamp - 1 days),
            effectiveAt,
            _splitParams(4, 1, 4e18)
        );
        vm.warp(effectiveAt);
        vm.prank(admin);
        stock.scheduleMultiplierUpdate(4e18, effectiveAt);
        registry.activateAction(id); // → ADJUSTING

        // During reconciliation even deposits pause (default policy).
        vm.prank(alice);
        vm.expectRevert();
        awareVault.deposit(1e18);
    }

    function test_reverseSplit_naiveOverLends() public {
        _setupPositions();
        // 1:10 reverse split: multiplier 1e18 → 1e17; share price 100 → 1000.
        uint64 effectiveAt = uint64(block.timestamp + 1 days);
        bytes32 id = _submit(
            keccak256("evt.demo.1for10"),
            _t(CorpShiftTypes.ActionType.REVERSE_SPLIT),
            uint64(block.timestamp - 1 days),
            effectiveAt,
            abi.encode(uint256(1), uint256(10), uint256(1e17))
        );
        vm.warp(effectiveAt);
        vm.prank(admin);
        stock.scheduleMultiplierUpdate(1e17, effectiveAt);
        registry.activateAction(id);
        vm.prank(admin);
        oracle.setPrice(address(stock), 1000e8);
        stock.syncMultiplier();
        registry.applyAction(id);

        // Naive reads 10 raw × $1000 = $10,000 (10× too high — insolvency risk).
        // Aware reads 1 unit × $1000 = $1,000 (correct).
        assertEq(naiveVault.collateralValue(alice), 10_000e18);
        assertEq(awareVault.collateralValue(alice), 1000e18);
        assertEq(naiveVault.healthFactor(alice), 20e18); // phantom health
        assertEq(awareVault.healthFactor(alice), 2e18);
    }
}
