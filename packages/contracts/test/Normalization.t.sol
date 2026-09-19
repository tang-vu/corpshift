// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CorpShiftTest} from "./helpers/CorpShiftTest.sol";
import {CorpShiftTypes} from "../src/libraries/CorpShiftTypes.sol";
import {CorpShiftRegistry} from "../src/CorpShiftRegistry.sol";
import {StockTokenAdapter} from "../src/adapters/StockTokenAdapter.sol";
import {IAssetAdapter} from "../src/interfaces/IAssetAdapter.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";

/// @title NormalizationTest
/// @notice The economic-normalization layer: multiplier math, pending
///         multiplier reads, adapter probing, overflow bounds, and the
///         policy matrix across asset states.
contract NormalizationTest is CorpShiftTest {
    function test_economicBalance_reflectsMultiplier() public {
        // 10 raw tokens at 1.0 → 10 units.
        assertEq(registry.economicBalanceOf(address(stock), alice), 100e18);

        // 4:1 split lands → 100 raw = 400 share-equivalents.
        vm.prank(admin);
        stock.scheduleMultiplierUpdate(4e18, block.timestamp);
        stock.syncMultiplier();
        assertEq(registry.economicBalanceOf(address(stock), alice), 400e18);
        assertEq(registry.economicUnitsOfAmount(address(stock), 10e18), 40e18);
    }

    function test_pendingNormalization_readsScheduledChange() public {
        uint64 eff = uint64(block.timestamp + 1 days);
        vm.prank(admin);
        stock.scheduleMultiplierUpdate(4e18, eff);
        (uint256 newFactor, uint64 effectiveAt) = stockAdapter.pendingNormalization(address(stock));
        assertEq(newFactor, 4e18);
        assertEq(effectiveAt, eff);
        // Live multiplier still 1.0 until effective.
        assertEq(registry.normalizationFactor(address(stock)), 1e18);
    }

    function test_supportsAsset_probesERC8056() public {
        assertTrue(stockAdapter.supportsAsset(address(stock)));
        // A plain ERC-20 doesn't implement uiMultiplier → not supported.
        assertFalse(stockAdapter.supportsAsset(address(usdg)));
        // An EOA is definitely not.
        assertFalse(stockAdapter.supportsAsset(alice));
        // ERC20Adapter supports the plain token and also the stock token.
        assertTrue(erc20Adapter.supportsAsset(address(usdg)));
    }

    function test_normalizationFactor_revertsOnUnregistered() public {
        vm.expectRevert(abi.encodeWithSelector(CorpShiftRegistry.AssetNotRegistered.selector, address(usdg)));
        registry.normalizationFactor(address(usdg));
    }

    function test_multiplierZero_isRejectedAsCorrupt() public {
        // A token whose uiMultiplier returns 0 is corrupt — the adapter must
        // not silently treat it as 1.0.
        BadMultiplierToken bad = new BadMultiplierToken();
        assertFalse(stockAdapter.supportsAsset(address(bad)));
    }

    function testFuzz_scalingPrecision(uint128 raw, uint64 multX18) public {
        uint256 mult = bound(uint256(multX18), 1e15, 1e24);
        vm.prank(admin);
        stock.scheduleMultiplierUpdate(mult, block.timestamp);
        stock.syncMultiplier();
        uint256 expected = (uint256(raw) * mult) / 1e18;
        assertEq(registry.economicUnitsOfAmount(address(stock), raw), expected);
    }

    function testFuzz_scalingNeverOverflows(uint256 raw) public {
        // Extreme multiplier at the adapter's sanity bound.
        vm.prank(admin);
        stock.scheduleMultiplierUpdate(1e27, block.timestamp);
        stock.syncMultiplier();
        raw = bound(raw, 1, type(uint256).max / 1e27);
        registry.economicUnitsOfAmount(address(stock), raw); // must not revert
        // Beyond the bound it must revert loudly, not wrap.
        vm.expectRevert();
        registry.economicUnitsOfAmount(address(stock), type(uint256).max);
    }

    function test_adapterRejectsMultiplierAboveBound() public {
        EvilMultiplierToken evil = new EvilMultiplierToken();
        assertFalse(stockAdapter.supportsAsset(address(evil)));
    }

    /*//////////////////////////////////////////////////////////////
                            POLICY MATRIX
    //////////////////////////////////////////////////////////////*/

    function test_policy_activeAllowsAll() public {
        for (uint8 op = 0; op <= 8; op++) {
            (bool ok,) = registry.checkPolicy(address(stock), CorpShiftTypes.PolicyOp(op));
            assertTrue(ok, "ACTIVE should allow all ops");
        }
    }

    function test_policy_actionPending_blocksNewExposure() public {
        _submit(
            keccak256("evt.pol"),
            _t(CorpShiftTypes.ActionType.FORWARD_SPLIT),
            uint64(block.timestamp - 1),
            uint64(block.timestamp + 1 days),
            _splitParams(4, 1, 4e18)
        );
        // Deposit/withdraw/transfer still allowed...
        (bool dep,) = registry.checkPolicy(address(stock), CorpShiftTypes.PolicyOp.DEPOSIT);
        (bool wd,) = registry.checkPolicy(address(stock), CorpShiftTypes.PolicyOp.WITHDRAW);
        assertTrue(dep);
        assertTrue(wd);
        // ...but new borrows, liquidations, orders, settlement, collateral
        // counting are blocked while the action is pending.
        (bool bor, bytes32 r1) = registry.checkPolicy(address(stock), CorpShiftTypes.PolicyOp.BORROW);
        (bool liq,) = registry.checkPolicy(address(stock), CorpShiftTypes.PolicyOp.LIQUIDATE);
        (bool col,) = registry.checkPolicy(address(stock), CorpShiftTypes.PolicyOp.USE_AS_COLLATERAL);
        assertFalse(bor);
        assertFalse(liq);
        assertFalse(col);
        assertEq(r1, bytes32("ACTION_PENDING"));
        assertFalse(registry.canUseAsCollateral(address(stock)));
        assertTrue(registry.canTransferSafely(address(stock)));
    }

    function test_policy_halted_blocksTrading() public {
        _submit(
            keccak256("evt.halt.pol"),
            _t(CorpShiftTypes.ActionType.TRADING_HALT),
            uint64(block.timestamp - 1),
            uint64(block.timestamp),
            abi.encode("halt")
        );
        (bool ord, bytes32 r) = registry.checkPolicy(address(stock), CorpShiftTypes.PolicyOp.CREATE_ORDER);
        (bool bor,) = registry.checkPolicy(address(stock), CorpShiftTypes.PolicyOp.BORROW);
        (bool wd,) = registry.checkPolicy(address(stock), CorpShiftTypes.PolicyOp.WITHDRAW);
        assertFalse(ord);
        assertFalse(bor);
        assertTrue(wd); // exits allowed while halted
        assertEq(r, bytes32("HALTED"));
    }

    function test_policy_unregistered_denies() public {
        (bool ok, bytes32 reason) = registry.checkPolicy(address(usdg), CorpShiftTypes.PolicyOp.DEPOSIT);
        assertFalse(ok);
        assertEq(reason, bytes32("UNREGISTERED"));
    }

    function test_exposureStruct() public {
        CorpShiftTypes.EconomicExposure memory ex = registry.economicExposureOf(address(stock), alice);
        assertEq(ex.units, 100e18);
        assertEq(ex.normalizationFactor, 1e18);
        assertEq(ex.verifiedFactor, 1e18);
        assertEq(uint8(ex.state), uint8(CorpShiftTypes.AssetState.ACTIVE));
    }
}

/// @dev A token whose uiMultiplier returns 0 — corrupt input.
contract BadMultiplierToken {
    function uiMultiplier() external pure returns (uint256) {
        return 0;
    }

    function balanceOf(address) external pure returns (uint256) {
        return 0;
    }
}

/// @dev A token whose multiplier exceeds the adapter's sanity bound.
contract EvilMultiplierToken {
    function uiMultiplier() external pure returns (uint256) {
        return 1e40;
    }

    function balanceOf(address) external pure returns (uint256) {
        return 0;
    }
}
