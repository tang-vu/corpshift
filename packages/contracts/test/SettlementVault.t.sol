// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CorpShiftTest} from "./helpers/CorpShiftTest.sol";
import {CorpShiftTypes} from "../src/libraries/CorpShiftTypes.sol";
import {SettlementVault} from "../src/SettlementVault.sol";
import {IERC20} from "../src/interfaces/IERC20Metadata.sol";

/// @title SettlementVaultTest
/// @notice USDG cash-entitlement lifecycle: open, fund, entitlement math,
///         claim, double-claim prevention, underfunding, close + sweep.
contract SettlementVaultTest is CorpShiftTest {
    bytes32 internal dividendAction;
    bytes32 internal settlementId;
    /// $0.28 per share-equivalent in 6-dp mUSDG atomic units.
    uint256 internal constant RATE = 280_000;
    uint64 internal closesAt;

    function setUp() public override {
        super.setUp();
        closesAt = uint64(block.timestamp + 30 days);

        // Attest a cash dividend of $0.28/share (informational — no
        // multiplier expectation attached).
        dividendAction = _submit(
            keccak256("evt.div.0.28"),
            _t(CorpShiftTypes.ActionType.CASH_DIVIDEND),
            uint64(block.timestamp - 1 days),
            uint64(block.timestamp),
            abi.encode(uint256(280_000), uint256(0)) // rate, expectedMultiplier=0
        );
        vm.prank(admin);
        settlementId = vault.openSettlement(dividendAction, address(usdg), RATE, closesAt);
    }

    function _fund(uint256 amount) internal {
        vm.startPrank(admin);
        usdg.approve(address(vault), amount);
        vault.fundSettlement(settlementId, amount);
        vm.stopPrank();
    }

    function test_open_recordsSnapshotFactor() public {
        SettlementVault.Settlement memory s = vault.getSettlement(settlementId);
        assertEq(s.actionId, dividendAction);
        assertEq(s.asset, address(stock));
        assertEq(s.ratePerUnit, RATE);
        assertEq(s.snapshotFactor, 1e18);
        assertTrue(s.open);
        assertEq(s.operator, admin);
    }

    function test_entitlement_math() public {
        // Alice holds 100 tokens × factor 1.0 → 100 units × $0.28 = $28.00.
        (uint256 units, uint256 payout) = vault.entitlementOf(settlementId, alice);
        assertEq(units, 100e18);
        assertEq(payout, 28e6); // 28 USDG
    }

    function test_claim_paysEntitlement() public {
        _fund(1000e6);
        uint256 before = usdg.balanceOf(alice);
        vm.prank(alice);
        uint256 paid = vault.claim(settlementId);
        assertEq(paid, 28e6);
        assertEq(usdg.balanceOf(alice) - before, 28e6);
    }

    function test_doubleClaim_reverts() public {
        _fund(1000e6);
        vm.prank(alice);
        vault.claim(settlementId);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SettlementVault.NothingToClaim.selector, settlementId));
        vault.claim(settlementId);
    }

    function test_incrementalClaim_onNewUnits() public {
        _fund(1000e6);
        vm.prank(alice);
        vault.claim(settlementId); // claims her 100 units

        // Alice acquires 50 more tokens → incremental entitlement opens.
        stock.mint(alice, 50e18);
        (uint256 units, uint256 payout) = vault.entitlementOf(settlementId, alice);
        assertEq(units, 50e18);
        assertEq(payout, 14e6); // 50 × 0.28
        vm.prank(alice);
        vault.claim(settlementId);
    }

    function test_underfunded_reverts() public {
        _fund(10e6); // only $10 funded; alice is owed $28
        vm.prank(alice);
        vm.expectRevert(); // Underfunded
        vault.claim(settlementId);
        assertFalse(vault.covers(settlementId, alice));
    }

    function test_claimBeforeFunding_thenFunded() public {
        vm.prank(alice);
        vm.expectRevert(); // Underfunded (0 available)
        vault.claim(settlementId);
        _fund(100e6);
        vm.prank(alice);
        vault.claim(settlementId);
    }

    function test_close_beforeClosesAt_reverts() public {
        _fund(100e6);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(SettlementVault.SettlementStillOpen.selector, settlementId));
        vault.closeSettlement(settlementId);
    }

    function test_close_sweepsRemainder() public {
        _fund(100e6);
        vm.prank(alice);
        vault.claim(settlementId); // $28 claimed, $72 remains
        vm.warp(closesAt);
        uint256 before = usdg.balanceOf(admin);
        vm.prank(admin);
        vault.closeSettlement(settlementId);
        assertEq(usdg.balanceOf(admin) - before, 72e6);

        SettlementVault.Settlement memory s = vault.getSettlement(settlementId);
        assertFalse(s.open);
    }

    function test_close_onlyOperator() public {
        _fund(100e6);
        vm.warp(closesAt);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SettlementVault.NotSettlementOperator.selector, settlementId));
        vault.closeSettlement(settlementId);
    }

    function test_claimOnClosed_reverts() public {
        _fund(100e6);
        vm.warp(closesAt);
        vm.prank(admin);
        vault.closeSettlement(settlementId);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SettlementVault.SettlementClosed_.selector, settlementId));
        vault.claim(settlementId);
    }

    function test_entitlement_usesSnapshotFactor() public {
        // A 4:1 split lands AFTER settlement opened → entitlement still
        // values units at the snapshot factor (record-date semantics).
        vm.prank(admin);
        stock.scheduleMultiplierUpdate(4e18, block.timestamp);
        stock.syncMultiplier();
        (uint256 units,) = vault.entitlementOf(settlementId, alice);
        assertEq(units, 100e18); // snapshot factor 1e18 frozen at open
    }

    function test_revert_zeroRate() public {
        vm.expectRevert(SettlementVault.InvalidRate.selector);
        vault.openSettlement(dividendAction, address(usdg), 0, closesAt);
    }

    function testFuzz_entitlementScales(uint96 rawBal) public {
        uint256 bal = bound(uint256(rawBal), 1, 1e30);
        stock.mint(alice, bal);
        (uint256 units, uint256 payout) = vault.entitlementOf(settlementId, alice);
        uint256 expectedUnits = ((100e18 + bal) * 1e18) / 1e18;
        assertEq(units, expectedUnits);
        assertEq(payout, (units * RATE) / 1e18);
    }
}
