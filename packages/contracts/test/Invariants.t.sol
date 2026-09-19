// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {CorpShiftTest} from "./helpers/CorpShiftTest.sol";
import {CorpShiftTypes} from "../src/libraries/CorpShiftTypes.sol";
import {CorpShiftRegistry} from "../src/CorpShiftRegistry.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {AttestationLib} from "../src/libraries/AttestationLib.sol";

/// @title CorpShiftHandler
/// @notice Drives randomized but *valid* action sequences at the registry:
///         submits attested actions across all types, warps time, cranks
///         activate/apply, moves the mock token's multiplier to match (or
///         deliberately mismatch) attested expectations.
contract CorpShiftHandler is Test {
    CorpShiftRegistry public registry;
    MockStockToken public stock;
    address public admin;
    uint256 public attesterKey;
    bytes32 public constant SOURCE = keccak256("robinhood-rhj");

    uint256 public actionCount;
    uint256 public callCount;
    bytes32[] public ids;
    // Shadow tracking for invariant assertions.
    mapping(bytes32 => CorpShiftTypes.ActionStatus) public lastStatus;

    uint256 private constant TOKEN_EFF_MULT = 4e18;
    /// @dev Bound the tracked universe so invariant scans stay O(small).
    uint256 private constant MAX_ACTIONS = 24;

    constructor(CorpShiftRegistry registry_, MockStockToken stock_, address admin_, uint256 key_) {
        registry = registry_;
        stock = stock_;
        admin = admin_;
        attesterKey = key_;
    }

    function submitEconomic(uint8 typeSeed, uint64 delaySeed) external {
        callCount++;
        if (actionCount >= MAX_ACTIONS) return;
        CorpShiftTypes.ActionType t =
            typeSeed % 4 == 0 ? CorpShiftTypes.ActionType.REVERSE_SPLIT : CorpShiftTypes.ActionType.FORWARD_SPLIT;
        uint64 effectiveAt = uint64(bound(uint256(delaySeed), 0, 3 days));
        effectiveAt += uint64(block.timestamp);
        uint256 expected = t == CorpShiftTypes.ActionType.FORWARD_SPLIT ? 4e18 : 1e17;
        bytes memory params = abi.encode(
            t == CorpShiftTypes.ActionType.FORWARD_SPLIT ? uint256(4) : uint256(1),
            t == CorpShiftTypes.ActionType.FORWARD_SPLIT ? uint256(1) : uint256(10),
            expected
        );
        _submitAndTrack(t, effectiveAt, params);
    }

    function submitHalt() external {
        callCount++;
        if (actionCount >= MAX_ACTIONS) return;
        _submitAndTrack(CorpShiftTypes.ActionType.TRADING_HALT, uint64(block.timestamp), abi.encode("h"));
    }

    function submitResume() external {
        callCount++;
        if (actionCount >= MAX_ACTIONS) return;
        _submitAndTrack(CorpShiftTypes.ActionType.TRADING_RESUME, uint64(block.timestamp), abi.encode("r"));
    }

    function submitUnknown() external {
        callCount++;
        if (actionCount >= MAX_ACTIONS) return;
        _submitAndTrack(CorpShiftTypes.ActionType.UNKNOWN, uint64(block.timestamp) + 1 days, abi.encode("u"));
    }

    function warp(uint32 secs) external {
        vm.warp(block.timestamp + bound(uint256(secs), 0, 2 days));
    }

    function activate(uint256 i) external {
        callCount++;
        if (ids.length == 0) return;
        bytes32 id = ids[i % ids.length];
        try registry.activateAction(id) {} catch {}
    }

    function applyCrank(uint256 i) external {
        callCount++;
        if (ids.length == 0) return;
        bytes32 id = ids[i % ids.length];
        try registry.applyAction(id) {} catch {}
    }

    function issuerSyncMultiplier(bool makeMatch) external {
        callCount++;
        vm.prank(admin);
        stock.scheduleMultiplierUpdate(makeMatch ? TOKEN_EFF_MULT : 2e18, block.timestamp);
        stock.syncMultiplier();
    }

    function _submitAndTrack(CorpShiftTypes.ActionType t, uint64 effectiveAt, bytes memory params) internal {
        bytes32 eventId = keccak256(abi.encodePacked("evt.", actionCount++));
        CorpShiftTypes.ActionPayload memory p = CorpShiftTypes.ActionPayload({
            schemaHash: AttestationLib.SCHEMA_V1,
            sourceHash: SOURCE,
            sourceEventId: eventId,
            asset: address(stock),
            actionType: uint8(t),
            announcedAt: uint64(block.timestamp),
            effectiveAt: effectiveAt,
            observedAt: uint64(block.timestamp),
            paramsHash: keccak256(params),
            evidenceHash: keccak256(abi.encodePacked("ev", eventId))
        });
        bytes32 digest = registry.attestDigest(p);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attesterKey, digest);
        try registry.submitAction(p, params, abi.encodePacked(r, s, v)) returns (bytes32 id) {
            ids.push(id);
        } catch {}
    }

    function allIds() external view returns (bytes32[] memory) {
        return ids;
    }
}

/// @title InvariantsTest
/// @notice System invariants under randomized action sequences.
contract InvariantsTest is CorpShiftTest {
    CorpShiftHandler internal handler;

    /// @dev Incremental scan state — invariant functions run after every
    ///      handler call, so full-array rescans are bounded via a watermark
    ///      (new ids only) and per-id shadow status tracking.
    uint256 private _scanned;
    mapping(bytes32 => bool) private _seen;
    mapping(bytes32 => uint8) private _lastStatus;

    function setUp() public override {
        super.setUp();
        handler = new CorpShiftHandler(registry, stock, admin, ATTESTER_KEY);
        targetContract(address(handler));
    }

    /// @dev The stored status of every action is always a member of the
    ///      lifecycle enum — never an out-of-range value.
    function invariant_actionStatusAlwaysValid() public view {
        bytes32[] memory ids = handler.allIds();
        for (uint256 i; i < ids.length; i++) {
            CorpShiftTypes.ActionStatus s = registry.getAction(ids[i]).status;
            assertLe(uint8(s), uint8(CorpShiftTypes.ActionStatus.UNSUPPORTED));
        }
    }

    /// @dev The asset state is always a valid enum member.
    function invariant_assetStateAlwaysValid() public view {
        CorpShiftTypes.AssetState s = registry.assetRuntimeState(address(stock));
        assertLe(uint8(s), uint8(CorpShiftTypes.AssetState.UNSUPPORTED));
    }

    /// @dev RESOLVED/INVALIDATED/UNSUPPORTED are terminal (top of the enum):
    ///      once observed terminal, a status must never change again.
    function invariant_terminalActionsStayTerminal() public {
        bytes32[] memory ids = handler.allIds();
        for (uint256 i; i < ids.length; i++) {
            uint8 prev = _lastStatus[ids[i]];
            uint8 cur = uint8(registry.getAction(ids[i]).status);
            if (prev >= uint8(CorpShiftTypes.ActionStatus.RESOLVED)) {
                assertEq(cur, prev);
            }
            _lastStatus[ids[i]] = cur;
        }
    }

    /// @dev HALTED implies an in-force halt action pointer.
    function invariant_haltedImpliesActiveHalt() public view {
        if (registry.assetRuntimeState(address(stock)) == CorpShiftTypes.AssetState.HALTED) {
            bytes32 haltId = registry.activeHaltAction(address(stock));
            assertTrue(haltId != bytes32(0));
            assertEq(uint8(registry.getAction(haltId).status), uint8(CorpShiftTypes.ActionStatus.ACTIVE));
        }
    }

    /// @dev Normalization factor is never zero for a registered asset.
    function invariant_factorNeverZero() public view {
        assertGt(registry.normalizationFactor(address(stock)), 0);
        assertGt(registry.verifiedNormalizationFactor(address(stock)), 0);
    }

    /// @dev pendingActionId always references a live (non-terminal) action
    ///      for the asset, or is zero.
    function invariant_pendingActionIsLive() public view {
        bytes32 pending = registry.pendingCorporateAction(address(stock));
        if (pending == bytes32(0)) return;
        CorpShiftTypes.ActionRecord memory rec = registry.getAction(pending);
        assertEq(rec.asset, address(stock));
        assertTrue(
            rec.status == CorpShiftTypes.ActionStatus.SCHEDULED || rec.status == CorpShiftTypes.ActionStatus.ACTIVE
        );
    }

    /// @dev Action ids are unique — no duplicate source events ever recorded.
    ///      Incremental: each new id is checked against all previously seen
    ///      ids exactly once.
    function invariant_actionIdsUnique() public {
        bytes32[] memory ids = handler.allIds();
        for (uint256 i = _scanned; i < ids.length; i++) {
            assertTrue(!_seen[ids[i]]);
            _seen[ids[i]] = true;
        }
        _scanned = ids.length;
    }
}
