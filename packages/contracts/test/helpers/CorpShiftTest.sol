// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CorpShiftRegistry} from "../../src/CorpShiftRegistry.sol";
import {PolicyEngine} from "../../src/PolicyEngine.sol";
import {SettlementVault} from "../../src/SettlementVault.sol";
import {StockTokenAdapter} from "../../src/adapters/StockTokenAdapter.sol";
import {ERC20Adapter} from "../../src/adapters/ERC20Adapter.sol";
import {MockStockToken} from "../../src/mocks/MockStockToken.sol";
import {MockUSDG} from "../../src/mocks/MockUSDG.sol";
import {MockPriceOracle} from "../../src/mocks/MockPriceOracle.sol";
import {NaiveVault} from "../../src/demo/NaiveVault.sol";
import {CorpShiftAwareVault} from "../../src/demo/CorpShiftAwareVault.sol";
import {CorpShiftTypes} from "../../src/libraries/CorpShiftTypes.sol";
import {AttestationLib} from "../../src/libraries/AttestationLib.sol";
import {IERC20} from "../../src/interfaces/IERC20Metadata.sol";

/// @title CorpShiftTest
/// @notice Shared fixture: deploys the full stack on a fresh EVM and exposes
///         helpers for building + signing attested ActionPayloads exactly as
///         the ingestion service does (EIP-712 over the registry's domain).
abstract contract CorpShiftTest is Test {
    CorpShiftRegistry internal registry;
    PolicyEngine internal policy;
    SettlementVault internal vault;
    StockTokenAdapter internal stockAdapter;
    ERC20Adapter internal erc20Adapter;
    MockStockToken internal stock;
    MockUSDG internal usdg;
    MockPriceOracle internal oracle;
    NaiveVault internal naiveVault;
    CorpShiftAwareVault internal awareVault;

    uint256 internal constant ATTESTER_KEY = 0xA77E57E5;
    address internal attester;
    address internal admin = address(0xAD);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal liquidator = address(0x11B1);

    bytes32 internal constant SOURCE = keccak256("robinhood-rhj");
    uint256 internal constant ONE = 1e18;

    function setUp() public virtual {
        attester = vm.addr(ATTESTER_KEY);
        // Foundry starts at timestamp 1 — warp to a realistic time so
        // `block.timestamp - 1 days` style offsets don't underflow.
        vm.warp(1_758_240_000); // 2025-09-19T00:00:00Z-ish demo time

        vm.startPrank(admin);
        policy = new PolicyEngine();
        registry = new CorpShiftRegistry(address(policy), attester);
        stockAdapter = new StockTokenAdapter();
        erc20Adapter = new ERC20Adapter();
        vault = new SettlementVault(registry);
        stock = new MockStockToken("XYZ Corp Stock Token (demo)", "XYZT", keccak256("uid.xyzt"), 0, admin);
        usdg = new MockUSDG(0);
        oracle = new MockPriceOracle();
        naiveVault = new NaiveVault(IERC20(address(stock)), IERC20(address(usdg)), oracle);
        awareVault = new CorpShiftAwareVault(registry, IERC20(address(stock)), IERC20(address(usdg)), oracle);
        registry.registerAsset(address(stock), address(stockAdapter), "XYZT");
        oracle.setPrice(address(stock), 100e8);
        vm.stopPrank();

        // Seed users.
        stock.mint(alice, 100e18);
        stock.mint(bob, 100e18);
        usdg.mint(alice, 100_000e6);
        usdg.mint(liquidator, 1_000_000e6);
        usdg.mint(address(naiveVault), 500_000e6);
        usdg.mint(address(awareVault), 500_000e6);
        usdg.mint(admin, 1_000_000e6);
    }

    /*//////////////////////////////////////////////////////////////
                        PAYLOAD / SIGNING HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @dev Build a canonical ActionPayload exactly as the ingestion layer
    ///      would (schema v1, keccak-hashed source, params pre-hashed).
    function _payload(
        bytes32 sourceEventId,
        address asset,
        uint8 actionType,
        uint64 announcedAt,
        uint64 effectiveAt,
        uint64 observedAt,
        bytes memory params
    ) internal pure returns (CorpShiftTypes.ActionPayload memory) {
        return CorpShiftTypes.ActionPayload({
            schemaHash: AttestationLib.SCHEMA_V1,
            sourceHash: SOURCE,
            sourceEventId: sourceEventId,
            asset: asset,
            actionType: actionType,
            announcedAt: announcedAt,
            effectiveAt: effectiveAt,
            observedAt: observedAt,
            paramsHash: keccak256(params),
            evidenceHash: keccak256(abi.encodePacked("evidence:", sourceEventId))
        });
    }

    /// @dev Sign a payload with `key` over the registry's live domain —
    ///      identical to the offchain attester's construction.
    function _sign(CorpShiftTypes.ActionPayload memory p, uint256 key) internal view returns (bytes memory) {
        bytes32 digest = registry.attestDigest(p);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev Submit an attested action end-to-end; returns the actionId.
    function _submit(
        bytes32 sourceEventId,
        uint8 actionType,
        uint64 announcedAt,
        uint64 effectiveAt,
        bytes memory params
    ) internal returns (bytes32) {
        CorpShiftTypes.ActionPayload memory p = _payload(
            sourceEventId, address(stock), actionType, announcedAt, effectiveAt, uint64(block.timestamp), params
        );
        return registry.submitAction(p, params, _sign(p, ATTESTER_KEY));
    }

    /// @dev Split params: (numerator, denominator, expectedNewMultiplier).
    function _splitParams(uint256 num, uint256 den, uint256 expectedMult) internal pure returns (bytes memory) {
        return abi.encode(num, den, expectedMult);
    }

    /// @dev ActionType constants as uint8 (for _submit).
    function _t(CorpShiftTypes.ActionType t) internal pure returns (uint8) {
        return uint8(t);
    }
}
