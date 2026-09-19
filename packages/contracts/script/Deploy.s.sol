// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CorpShiftRegistry} from "../src/CorpShiftRegistry.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";
import {SettlementVault} from "../src/SettlementVault.sol";
import {StockTokenAdapter} from "../src/adapters/StockTokenAdapter.sol";
import {ERC20Adapter} from "../src/adapters/ERC20Adapter.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {MockPriceOracle} from "../src/mocks/MockPriceOracle.sol";
import {NaiveVault} from "../src/demo/NaiveVault.sol";
import {CorpShiftAwareVault} from "../src/demo/CorpShiftAwareVault.sol";
import {IERC20} from "../src/interfaces/IERC20Metadata.sol";

/// @title Deploy
/// @notice Deploys the CorpShift core, and (in DEMO mode) the labelled mock
///         Stock Token, mock USDG, reference oracle, and the naive/aware
///         demo vaults. Writes a deployments/<chainId>.json artifact with
///         every address, tx context, and git commit for reproducibility.
///
/// @dev    Env:
///           PRIVATE_KEY        — deployer EOA (hex, no 0x required by forge)
///           ATTESTER_ADDRESS   — EIP-712 signer the registry will authorize
///           OPERATOR_ADDRESS   — settlement operator (demo)
///           DEMO_MODE          — "true" deploys mock token + demo vaults
///           DEMO_ASSET_SYMBOL  — mock stock token symbol (default "XYZT")
///           RH_USDG_ADDRESS    — real USDG address when present (mainnet);
///                                in demo mode a MockUSDG is used instead
contract Deploy is Script {
    struct Core {
        address policyEngine;
        address registry;
        address stockTokenAdapter;
        address erc20Adapter;
        address settlementVault;
    }

    struct Demo {
        address stockToken;
        address usdg;
        address priceOracle;
        address naiveVault;
        address awareVault;
    }

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address attester = vm.envOr("ATTESTER_ADDRESS", deployer);
        address operator = vm.envOr("OPERATOR_ADDRESS", deployer);
        bool demoMode = vm.envOr("DEMO_MODE", true);

        vm.startBroadcast(deployerKey);

        Core memory core = _deployCore(attester);
        Demo memory demo;
        if (demoMode) {
            demo = _deployDemo(core, deployer, operator);
        }

        vm.stopBroadcast();

        _writeArtifact(core, demo, attester, deployer, demoMode);

        console2.log("=== CorpShift deployment ===");
        console2.log("chainId:          ", block.chainid);
        console2.log("registry:         ", core.registry);
        console2.log("policyEngine:     ", core.policyEngine);
        console2.log("stockAdapter:     ", core.stockTokenAdapter);
        console2.log("settlementVault:  ", core.settlementVault);
        if (demoMode) {
            console2.log("mockStockToken:   ", demo.stockToken);
            console2.log("mockUSDG:         ", demo.usdg);
            console2.log("naiveVault:       ", demo.naiveVault);
            console2.log("awareVault:       ", demo.awareVault);
        }
    }

    function _deployCore(address attester) internal returns (Core memory core) {
        core.policyEngine = address(new PolicyEngine());
        core.registry = address(new CorpShiftRegistry(core.policyEngine, attester));
        core.stockTokenAdapter = address(new StockTokenAdapter());
        core.erc20Adapter = address(new ERC20Adapter());
        core.settlementVault = address(new SettlementVault(CorpShiftRegistry(core.registry)));
    }

    function _deployDemo(Core memory core, address deployer, address operator) internal returns (Demo memory demo) {
        string memory symbol = vm.envOr("DEMO_ASSET_SYMBOL", string("XYZT"));
        bytes32 uid = keccak256(abi.encodePacked("corpshift.mock.", symbol));
        demo.stockToken = address(new MockStockToken("XYZ Corp Stock Token (demo)", symbol, uid, 0, operator));
        demo.usdg = address(new MockUSDG(0));
        demo.priceOracle = address(new MockPriceOracle());
        demo.naiveVault =
            address(new NaiveVault(IERC20(demo.stockToken), IERC20(demo.usdg), MockPriceOracle(demo.priceOracle)));
        demo.awareVault = address(
            new CorpShiftAwareVault(
                CorpShiftRegistry(core.registry),
                IERC20(demo.stockToken),
                IERC20(demo.usdg),
                MockPriceOracle(demo.priceOracle)
            )
        );

        CorpShiftRegistry(core.registry).registerAsset(demo.stockToken, core.stockTokenAdapter, symbol);

        // Reference share price for the demo asset: $100.00 (8dp).
        MockPriceOracle(demo.priceOracle).setPrice(demo.stockToken, 100e8);

        // Seed the operator's demo wallet with stock tokens + mUSDG so the
        // killer demo can run immediately.
        MockStockToken(demo.stockToken).mint(operator, 1000e18);
        MockUSDG(demo.usdg).mint(operator, 1_000_000e6);
        MockUSDG(demo.usdg).mint(demo.naiveVault, 500_000e6);
        MockUSDG(demo.usdg).mint(demo.awareVault, 500_000e6);
        MockUSDG(demo.usdg).mint(deployer, 1_000_000e6);
    }

    function _writeArtifact(Core memory core, Demo memory demo, address attester, address deployer, bool demoMode)
        internal
    {
        string memory json = "deployment";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeUint(json, "deployedAt", block.timestamp);
        vm.serializeString(json, "deployer", vm.toString(deployer));
        vm.serializeString(json, "attester", vm.toString(attester));
        vm.serializeBool(json, "demoMode", demoMode);
        vm.serializeString(json, "policyEngine", vm.toString(core.policyEngine));
        vm.serializeString(json, "registry", vm.toString(core.registry));
        vm.serializeString(json, "stockTokenAdapter", vm.toString(core.stockTokenAdapter));
        vm.serializeString(json, "erc20Adapter", vm.toString(core.erc20Adapter));
        vm.serializeString(json, "settlementVault", vm.toString(core.settlementVault));
        if (demoMode) {
            vm.serializeString(json, "mockStockToken", vm.toString(demo.stockToken));
            vm.serializeString(json, "mockUSDG", vm.toString(demo.usdg));
            vm.serializeString(json, "priceOracle", vm.toString(demo.priceOracle));
            vm.serializeString(json, "naiveVault", vm.toString(demo.naiveVault));
            vm.serializeString(json, "awareVault", vm.toString(demo.awareVault));
        }
        string memory commit = _gitCommit();
        string memory out = vm.serializeString(json, "gitCommit", commit);

        string memory dir = "../../deployments";
        vm.createDir(dir, true);
        string memory path = string.concat(dir, "/", vm.toString(block.chainid), ".json");
        vm.writeJson(out, path);
        console2.log("artifact written: ", path);
    }

    function _gitCommit() internal view returns (string memory) {
        // ffi stays disabled; CI passes GIT_COMMIT explicitly when available.
        return vm.envOr("GIT_COMMIT", string("unknown"));
    }
}
