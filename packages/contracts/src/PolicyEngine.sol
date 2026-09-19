// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CorpShiftTypes} from "./libraries/CorpShiftTypes.sol";
import {IPolicyEngine} from "./interfaces/IPolicyEngine.sol";

/// @title PolicyEngine
/// @notice Default CorpShift policy: a conservative (state, op) allow-matrix.
/// @dev    The matrix is stored per-(state × op) so governance can tune a cell
///         (e.g. allow withdrawals during HALTED) without redeploying. Every
///         denial carries a stable machine-readable reason code so downstream
///         protocols and UIs can explain *why* an operation was blocked.
contract PolicyEngine is IPolicyEngine {
    using CorpShiftTypes for *;

    /*//////////////////////////////////////////////////////////////
                               STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice allowed[state][op] — the decision matrix.
    mapping(uint8 => mapping(uint8 => bool)) private _allowed;

    /// @notice Contract owner (set at construction, typically governance).
    address public owner;

    /// @notice Pending owner for two-step ownership transfer.
    address public pendingOwner;

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event PolicyUpdated(CorpShiftTypes.AssetState indexed state, CorpShiftTypes.PolicyOp indexed op, bool allowed);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/

    error Unauthorized();
    error ZeroAddress();

    /*//////////////////////////////////////////////////////////////
                             REASON CODES
    //////////////////////////////////////////////////////////////*/

    /// @dev Stable machine-readable denial reasons.
    bytes32 public constant REASON_OK = bytes32(0);
    bytes32 public constant REASON_ACTION_PENDING = bytes32("ACTION_PENDING");
    bytes32 public constant REASON_ADJUSTING = bytes32("ADJUSTING");
    bytes32 public constant REASON_HALTED = bytes32("HALTED");
    bytes32 public constant REASON_MIGRATING = bytes32("MIGRATING");
    bytes32 public constant REASON_REDEEMING = bytes32("REDEEMING");
    bytes32 public constant REASON_DEGRADED = bytes32("DEGRADED");
    bytes32 public constant REASON_UNSUPPORTED = bytes32("UNSUPPORTED");
    bytes32 public constant REASON_UNREGISTERED = bytes32("UNREGISTERED");

    /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor() {
        owner = msg.sender;
        _seedDefaults();
    }

    /// @dev The conservative default matrix. Rationale:
    ///      ACTION_PENDING — reads/deposits/withdrawals stay open (the action
    ///        is announced, not effective); anything that *creates new
    ///        economic exposure* on a stale basis (borrow, liquidation, new
    ///        orders, settlement) pauses.
    ///      ADJUSTING — reconciliation in flight; only accounting reads and
    ///        withdrawals-open flags stay off until verified.
    ///      HALTED — trading operations stop; deposits/withdrawals allowed so
    ///        positions can be managed while price discovery is suspended.
    ///      MIGRATING / REDEEMING — funds are moving/settling; only exit ops.
    ///      DEGRADED / UNSUPPORTED — correctness cannot be guaranteed; only
    ///        risk-reducing exits (withdraw) remain open.
    function _seedDefaults() internal {
        uint8 s;
        uint8 o;

        // ACTIVE — everything allowed.
        s = uint8(CorpShiftTypes.AssetState.ACTIVE);
        for (o = 0; o <= uint8(CorpShiftTypes.PolicyOp.PRICE_READ); o++) {
            _allowed[s][o] = true;
        }

        // ACTION_PENDING — reads + deposit/withdraw/transfer; no new exposure.
        s = uint8(CorpShiftTypes.AssetState.ACTION_PENDING);
        _allowed[s][uint8(CorpShiftTypes.PolicyOp.DEPOSIT)] = true;
        _allowed[s][uint8(CorpShiftTypes.PolicyOp.WITHDRAW)] = true;
        _allowed[s][uint8(CorpShiftTypes.PolicyOp.TRANSFER)] = true;
        _allowed[s][uint8(CorpShiftTypes.PolicyOp.PRICE_READ)] = true;

        // ADJUSTING — only accounting reads.
        s = uint8(CorpShiftTypes.AssetState.ADJUSTING);
        _allowed[s][uint8(CorpShiftTypes.PolicyOp.PRICE_READ)] = true;

        // HALTED — no trading/borrow/liquidate; exits and reads allowed.
        s = uint8(CorpShiftTypes.AssetState.HALTED);
        _allowed[s][uint8(CorpShiftTypes.PolicyOp.DEPOSIT)] = true;
        _allowed[s][uint8(CorpShiftTypes.PolicyOp.WITHDRAW)] = true;
        _allowed[s][uint8(CorpShiftTypes.PolicyOp.PRICE_READ)] = true;

        // MIGRATING — exits only.
        s = uint8(CorpShiftTypes.AssetState.MIGRATING);
        _allowed[s][uint8(CorpShiftTypes.PolicyOp.WITHDRAW)] = true;
        _allowed[s][uint8(CorpShiftTypes.PolicyOp.PRICE_READ)] = true;

        // REDEEMING — withdrawals + settlement of the redemption.
        s = uint8(CorpShiftTypes.AssetState.REDEEMING);
        _allowed[s][uint8(CorpShiftTypes.PolicyOp.WITHDRAW)] = true;
        _allowed[s][uint8(CorpShiftTypes.PolicyOp.SETTLE)] = true;
        _allowed[s][uint8(CorpShiftTypes.PolicyOp.PRICE_READ)] = true;

        // DEGRADED — withdrawals only (risk-off).
        s = uint8(CorpShiftTypes.AssetState.DEGRADED);
        _allowed[s][uint8(CorpShiftTypes.PolicyOp.WITHDRAW)] = true;
        _allowed[s][uint8(CorpShiftTypes.PolicyOp.PRICE_READ)] = true;

        // UNSUPPORTED — withdrawals only.
        s = uint8(CorpShiftTypes.AssetState.UNSUPPORTED);
        _allowed[s][uint8(CorpShiftTypes.PolicyOp.WITHDRAW)] = true;
        _allowed[s][uint8(CorpShiftTypes.PolicyOp.PRICE_READ)] = true;
    }

    /*//////////////////////////////////////////////////////////////
                            EVALUATION
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IPolicyEngine
    function evaluate(CorpShiftTypes.AssetState state, CorpShiftTypes.PolicyOp op)
        external
        view
        returns (bool allowed, bytes32 reason)
    {
        allowed = _allowed[uint8(state)][uint8(op)];
        if (allowed) return (true, REASON_OK);
        return (false, _reasonFor(state));
    }

    /// @notice Map a state to its denial reason code.
    function _reasonFor(CorpShiftTypes.AssetState state) internal pure returns (bytes32) {
        if (state == CorpShiftTypes.AssetState.ACTION_PENDING) return REASON_ACTION_PENDING;
        if (state == CorpShiftTypes.AssetState.ADJUSTING) return REASON_ADJUSTING;
        if (state == CorpShiftTypes.AssetState.HALTED) return REASON_HALTED;
        if (state == CorpShiftTypes.AssetState.MIGRATING) return REASON_MIGRATING;
        if (state == CorpShiftTypes.AssetState.REDEEMING) return REASON_REDEEMING;
        if (state == CorpShiftTypes.AssetState.DEGRADED) return REASON_DEGRADED;
        if (state == CorpShiftTypes.AssetState.UNSUPPORTED) return REASON_UNSUPPORTED;
        return REASON_OK;
    }

    /*//////////////////////////////////////////////////////////////
                            GOVERNANCE
    //////////////////////////////////////////////////////////////*/

    /// @notice Override a single matrix cell. Emits PolicyUpdated.
    function setPolicy(CorpShiftTypes.AssetState state, CorpShiftTypes.PolicyOp op, bool allowed) external {
        if (msg.sender != owner) revert Unauthorized();
        _allowed[uint8(state)][uint8(op)] = allowed;
        emit PolicyUpdated(state, op, allowed);
    }

    /// @notice Begin two-step ownership transfer.
    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert Unauthorized();
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @notice Complete two-step ownership transfer.
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }
}
