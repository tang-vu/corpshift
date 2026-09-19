// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CorpShiftTypes} from "./libraries/CorpShiftTypes.sol";
import {Owned} from "./libraries/Owned.sol";
import {ICorpShift} from "./interfaces/ICorpShift.sol";
import {IERC20, SafeTransfer} from "./interfaces/IERC20Metadata.sol";

/// @title SettlementVault
/// @notice Programmable cash-settlement primitive for corporate actions.
///         A corporate action that produces a cash entitlement (cash
///         dividend, cash-in-lieu, redemption proceeds) is funded here and
///         holders claim a rate × their economic (share-equivalent) units.
///
/// @dev    IMPORTANT — this is NOT a claim that Robinhood settles its
///         real-world corporate actions in USDG. It is a downstream
///         settlement primitive: a protocol, market-maker, or operator funds
///         the vault and CorpShift's normalization layer computes the
///         entitlement. Payment token is configurable (USDG on mainnet,
///         MockUSDG on testnet).
///
///         Entitlement model (v1, documented limitation): entitlement =
///         economicUnits(holder) evaluated at claim time × ratePerUnit. A
///         production system would checkpoint holder units at the record
///         date; v1 optimizes for demonstrating the primitive honestly.
contract SettlementVault is Owned {
    using SafeTransfer for IERC20;

    /*//////////////////////////////////////////////////////////////
                              TYPES & STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice A funded cash entitlement pool tied to a corporate action.
    struct Settlement {
        bytes32 actionId; //       the corporate action this settles
        address asset; //          the affected asset
        IERC20 paymentToken; //     the cash leg (e.g. USDG)
        uint256 ratePerUnit; //     atomic payment units per 1.0 economic unit
        uint256 snapshotFactor; //   normalization factor frozen at open
        address operator; //        funder / administrator of this settlement
        uint64 openedAt;
        uint64 closesAt; //         after this, operator may sweep remainder
        uint128 totalFunded;
        uint128 totalClaimed;
        bool open;
    }

    ICorpShift public immutable corpshift;

    /// @notice settlementId → record.
    mapping(bytes32 => Settlement) private _settlements;

    /// @notice settlementId → holder → units already claimed.
    mapping(bytes32 => mapping(address => uint256)) public claimedUnits;

    /// @notice All settlement ids, in open order.
    bytes32[] public settlementIds;

    /// @dev Reentrancy guard.
    uint256 private _lock;

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event SettlementOpened(
        bytes32 indexed settlementId,
        bytes32 indexed actionId,
        address indexed asset,
        address paymentToken,
        uint256 ratePerUnit,
        uint256 snapshotFactor,
        address operator
    );
    event SettlementFunded(bytes32 indexed settlementId, address indexed funder, uint256 amount);
    event EntitlementClaimed(bytes32 indexed settlementId, address indexed holder, uint256 units, uint256 payout);
    event SettlementClosed(bytes32 indexed settlementId, uint256 remainderSwept);

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/

    error SettlementNotFound(bytes32 id);
    error SettlementClosed_(bytes32 id);
    error SettlementStillOpen(bytes32 id);
    error NotSettlementOperator(bytes32 id);
    error NothingToClaim(bytes32 id);
    error Underfunded(bytes32 id, uint256 required, uint256 available);
    error InvalidRate();
    error Reentrancy();

    /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(ICorpShift corpshift_) {
        if (address(corpshift_) == address(0)) revert ZeroAddress();
        corpshift = corpshift_;
        _lock = 1;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    /*//////////////////////////////////////////////////////////////
                            SETTLEMENT LIFECYCLE
    //////////////////////////////////////////////////////////////*/

    /// @notice Open a cash settlement for an attested corporate action.
    /// @dev    Callable by anyone (the caller becomes the operator and is
    ///         responsible for funding). The action must exist and carry an
    ///         asset CorpShift knows about.
    /// @param actionId      The corporate action this settles.
    /// @param paymentToken  ERC-20 the entitlement pays in (e.g. USDG).
    /// @param ratePerUnit   Atomic payment-token units per 1.0 economic unit
    ///                      (e.g. a $0.28/share dividend in 6-decimal USDG is
    ///                      ratePerUnit = 280_000).
    /// @param closesAt      Timestamp after which the operator may close.
    /// @return settlementId keccak256(actionId, paymentToken, ratePerUnit, count).
    function openSettlement(bytes32 actionId, address paymentToken, uint256 ratePerUnit, uint64 closesAt)
        external
        returns (bytes32 settlementId)
    {
        if (paymentToken == address(0)) revert ZeroAddress();
        if (ratePerUnit == 0) revert InvalidRate();

        CorpShiftTypes.ActionRecord memory rec = corpshift.getAction(actionId);
        if (rec.submittedAt == 0) revert SettlementNotFound(actionId);

        settlementId = keccak256(abi.encode(actionId, paymentToken, ratePerUnit, settlementIds.length, block.chainid));

        uint256 factor = corpshift.normalizationFactor(rec.asset);

        _settlements[settlementId] = Settlement({
            actionId: actionId,
            asset: rec.asset,
            paymentToken: IERC20(paymentToken),
            ratePerUnit: ratePerUnit,
            snapshotFactor: factor,
            operator: msg.sender,
            openedAt: uint64(block.timestamp),
            closesAt: closesAt,
            totalFunded: 0,
            totalClaimed: 0,
            open: true
        });
        settlementIds.push(settlementId);

        emit SettlementOpened(settlementId, actionId, rec.asset, paymentToken, ratePerUnit, factor, msg.sender);
    }

    /// @notice Fund a settlement with payment tokens.
    function fundSettlement(bytes32 settlementId, uint256 amount) external {
        Settlement storage s = _settlements[settlementId];
        if (!s.open) revert SettlementNotFound(settlementId);
        s.paymentToken.safeTransferFrom(msg.sender, address(this), amount);
        s.totalFunded += uint128(amount);
        emit SettlementFunded(settlementId, msg.sender, amount);
    }

    /// @notice A holder's remaining entitlement in payment-token units.
    /// @dev    units = balanceOf × snapshotFactor / 1e18; payout = units × rate.
    ///         Already-claimed units are excluded so claims are incremental.
    function entitlementOf(bytes32 settlementId, address holder) public view returns (uint256 units, uint256 payout) {
        Settlement storage s = _settlements[settlementId];
        if (s.operator == address(0)) revert SettlementNotFound(settlementId);

        uint256 raw = IERC20(s.asset).balanceOf(holder);
        units = (raw * s.snapshotFactor) / 1e18;
        uint256 already = claimedUnits[settlementId][holder];
        if (units <= already) return (0, 0);
        units -= already;
        payout = (units * s.ratePerUnit) / 1e18;
    }

    /// @notice Claim the caller's entitlement. Pays incrementally: if the
    ///         holder's units grew (e.g. bought more post-record), they can
    ///         claim again for the delta — but never twice for the same units.
    /// @return payout Payment-token amount transferred.
    function claim(bytes32 settlementId) external nonReentrant returns (uint256 payout) {
        Settlement storage s = _settlements[settlementId];
        if (!s.open) revert SettlementClosed_(settlementId);

        (uint256 units, uint256 amount) = entitlementOf(settlementId, msg.sender);
        if (units == 0) revert NothingToClaim(settlementId);

        uint256 available = uint256(s.totalFunded) - uint256(s.totalClaimed);
        if (amount > available) revert Underfunded(settlementId, amount, available);

        claimedUnits[settlementId][msg.sender] += units;
        s.totalClaimed += uint128(amount);

        s.paymentToken.safeTransfer(msg.sender, amount);
        emit EntitlementClaimed(settlementId, msg.sender, units, amount);
        return amount;
    }

    /// @notice Close a settlement and sweep unclaimed remainder to operator.
    /// @dev    Only after closesAt — entitlement claims remain first-class
    ///         until then, so funds can't be pulled from under holders.
    function closeSettlement(bytes32 settlementId) external nonReentrant {
        Settlement storage s = _settlements[settlementId];
        if (s.operator == address(0)) revert SettlementNotFound(settlementId);
        if (msg.sender != s.operator) revert NotSettlementOperator(settlementId);
        if (!s.open) revert SettlementClosed_(settlementId);
        if (block.timestamp < s.closesAt) revert SettlementStillOpen(settlementId);

        s.open = false;
        uint256 remainder = uint256(s.totalFunded) - uint256(s.totalClaimed);
        if (remainder > 0) {
            s.paymentToken.safeTransfer(s.operator, remainder);
        }
        emit SettlementClosed(settlementId, remainder);
    }

    /*//////////////////////////////////////////////////////////////
                                VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Full settlement record.
    function getSettlement(bytes32 settlementId) external view returns (Settlement memory) {
        return _settlements[settlementId];
    }

    /// @notice Number of settlements ever opened.
    function settlementCount() external view returns (uint256) {
        return settlementIds.length;
    }

    /// @notice Funding sufficiency check: does the pool cover `holder`'s claim?
    function covers(bytes32 settlementId, address holder) external view returns (bool) {
        Settlement storage s = _settlements[settlementId];
        if (!s.open) return false;
        (, uint256 payout) = entitlementOf(settlementId, holder);
        return payout <= (uint256(s.totalFunded) - uint256(s.totalClaimed));
    }
}
