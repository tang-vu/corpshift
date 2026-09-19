// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CorpShiftTypes
/// @notice Canonical domain model for CorpShift — corporate-action types,
///         lifecycle statuses, asset runtime states, and policy operations.
/// @dev    The onchain model is deliberately explicit: a consumer must never
///         have to guess what a numeric status means. Names match the
///         canonical offchain schema `corpshift.action.v1`.
library CorpShiftTypes {
    /*//////////////////////////////////////////////////////////////
                            ACTION TYPES
    //////////////////////////////////////////////////////////////*/

    /// @notice Canonical corporate-action categories.
    /// @dev    Mapped from source-specific taxonomies (e.g. the Robinhood
    ///         `/corporate-actions` `CorporateActionType` enum) by the
    ///         ingestion layer. UNKNOWN must never be silently interpreted —
    ///         actions with unmodelled semantics are rejected as UNSUPPORTED.
    enum ActionType {
        FORWARD_SPLIT, //      0 — e.g. 4-for-1: shares-per-token increases
        REVERSE_SPLIT, //      1 — e.g. 1-for-10: shares-per-token decreases
        CASH_DIVIDEND, //      2 — cash entitlement per share-equivalent unit
        STOCK_DIVIDEND, //     3 — additional shares per share held
        MERGER, //             4 — asset is acquired / merged (cash, stock, or mixed)
        SPIN_OFF, //           5 — distribution of a new asset to holders
        REDEMPTION, //         6 — issuer redeems the asset
        SYMBOL_CHANGE, //      7 — symbol/name change, no economic effect
        TRADING_HALT, //       8 — trading in the underlying is halted
        TRADING_RESUME, //     9 — trading resumes after a halt
        MULTIPLIER_CHANGE, // 10 — generic ERC-8056 uiMultiplier transition
        UNKNOWN //             11 — unmodelled semantics (never interpreted)
    }

    /*//////////////////////////////////////////////////////////////
                           ACTION LIFECYCLE
    //////////////////////////////////////////////////////////////*/

    /// @notice Onchain lifecycle of a corporate action.
    /// @dev    Terminal states: RESOLVED, INVALIDATED, UNSUPPORTED.
    ///         Pre-chain states (OBSERVED at source, ATTESTED by signer) are
    ///         represented by events, not stored statuses — a stored action
    ///         is always already attested.
    enum ActionStatus {
        SCHEDULED, //  0 — verified, effectiveAt in the future
        ACTIVE, //    1 — in effect, awaiting onchain reconciliation
        RESOLVED, //  2 — reconciled and complete (terminal)
        INVALIDATED, //3 — revoked by governance (terminal)
        UNSUPPORTED // 4 — type cannot be processed (terminal)
    }

    /*//////////////////////////////////////////////////////////////
                          ASSET RUNTIME STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice Runtime state of a registered asset.
    /// @dev    Legal transitions are enforced by CorpShiftRegistry's
    ///         transition table — see `_assertLegalTransition`.
    enum AssetState {
        ACTIVE, //         0 — normal operation
        ACTION_PENDING, // 1 — verified action scheduled, not yet effective
        ADJUSTING, //      2 — action effective, being reconciled onchain
        HALTED, //         3 — trading halt in force
        MIGRATING, //      4 — merger/spin-off migration in progress
        REDEEMING, //      5 — asset being redeemed / wound down
        DEGRADED, //       6 — reconciliation failed; correctness not guaranteed
        UNSUPPORTED //     7 — adapter cannot normalize this asset
    }

    /*//////////////////////////////////////////////////////////////
                            POLICY OPERATIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Operations a downstream protocol can gate on asset state.
    enum PolicyOp {
        DEPOSIT, //            0 — accept asset as collateral / into a vault
        WITHDRAW, //           1 — release asset from a position
        BORROW, //             2 — open new debt against the asset
        LIQUIDATE, //          3 — liquidate a position backed by the asset
        CREATE_ORDER, //       4 — open a new trading position
        SETTLE, //             5 — settle obligations denominated in the asset
        TRANSFER, //           6 — move the asset between accounts
        USE_AS_COLLATERAL, //  7 — count the asset toward collateral value
        PRICE_READ //          8 — treat last-seen price as authoritative
    }

    /*//////////////////////////////////////////////////////////////
                              STRUCTS
    //////////////////////////////////////////////////////////////*/

    /// @notice The attested corporate-action payload (EIP-712 signed).
    /// @param  schemaHash    keccak256 of the canonical schema id ("corpshift.action.v1").
    /// @param  sourceHash    keccak256 of the source identifier (e.g. "robinhood-rhj").
    /// @param  sourceEventId Unique event id assigned by the source.
    /// @param  asset         Token contract the action applies to.
    /// @param  actionType    Canonical ActionType.
    /// @param  announcedAt   Source-declared announcement time (unix seconds).
    /// @param  effectiveAt   Time the action takes economic effect.
    /// @param  observedAt    Time the ingestion layer observed the event.
    /// @param  paramsHash    keccak256 of the ABI-encoded action parameters.
    /// @param  evidenceHash  keccak256 of the canonical source evidence payload.
    struct ActionPayload {
        bytes32 schemaHash;
        bytes32 sourceHash;
        bytes32 sourceEventId;
        address asset;
        uint8 actionType;
        uint64 announcedAt;
        uint64 effectiveAt;
        uint64 observedAt;
        bytes32 paramsHash;
        bytes32 evidenceHash;
    }

    /// @notice Stored corporate action.
    struct ActionRecord {
        bytes32 actionId;
        bytes32 sourceHash;
        bytes32 sourceEventId;
        address asset;
        ActionType actionType;
        ActionStatus status;
        uint64 announcedAt;
        uint64 effectiveAt;
        uint64 observedAt;
        uint64 submittedAt;
        bytes params;
        bytes32 paramsHash;
        bytes32 evidenceHash;
        address attestedBy;
    }

    /// @notice Stored per-asset runtime entry.
    struct AssetRecord {
        address adapter;
        bytes32 uid;
        AssetState state;
        bytes32 pendingActionId;
        uint256 lastVerifiedFactor;
        uint64 registeredAt;
        bool exists;
    }

    /// @notice Economic exposure of a position, in share-equivalent units.
    /// @param  units               Position size in economic units (18dp).
    /// @param  normalizationFactor Live normalization factor applied (1e18-fixed).
    /// @param  verifiedFactor      Last factor verified against an attested action.
    /// @param  state               Current asset runtime state.
    /// @param  pendingActionId     Action pending against the asset (0 if none).
    struct EconomicExposure {
        uint256 units;
        uint256 normalizationFactor;
        uint256 verifiedFactor;
        AssetState state;
        bytes32 pendingActionId;
    }
}
