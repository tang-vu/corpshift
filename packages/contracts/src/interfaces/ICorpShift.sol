// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CorpShiftTypes} from "../libraries/CorpShiftTypes.sol";

/// @title ICorpShift
/// @notice The consumer-facing surface of CorpShift. Protocols, vaults,
///         wallets, risk engines and agents call these functions to stay
///         economically correct when the asset under a token changes.
/// @dev    Integrating contracts should depend only on this interface (plus
///         CorpShiftTypes) — not on the concrete CorpShiftRegistry.
interface ICorpShift {
    /*//////////////////////////////////////////////////////////////
                        ECONOMIC NORMALIZATION
    //////////////////////////////////////////////////////////////*/

    /// @notice `account`'s position in `asset`, expressed in economic
    ///         (share-equivalent) units rather than raw token units.
    /// @dev    This is THE function a raw `balanceOf` cannot give you after a
    ///         corporate action. For an ERC-8056 Stock Token it equals
    ///         `balanceOf * uiMultiplier / 1e18`.
    function economicBalanceOf(address asset, address account) external view returns (uint256);

    /// @notice Full economic exposure descriptor for a position.
    function economicExposureOf(address asset, address account)
        external
        view
        returns (CorpShiftTypes.EconomicExposure memory exposure);

    /// @notice Convert a raw token `amount` of `asset` into economic units.
    function economicUnitsOfAmount(address asset, uint256 amount) external view returns (uint256);

    /// @notice Current live normalization factor for `asset` (1e18-fixed).
    function normalizationFactor(address asset) external view returns (uint256);

    /// @notice Last normalization factor verified against an attested action.
    function verifiedNormalizationFactor(address asset) external view returns (uint256);

    /*//////////////////////////////////////////////////////////////
                        RUNTIME STATE & ACTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Current runtime state of `asset`.
    function assetRuntimeState(address asset) external view returns (CorpShiftTypes.AssetState);

    /// @notice The action currently pending against `asset` (bytes32(0) if none).
    function pendingCorporateAction(address asset) external view returns (bytes32);

    /// @notice Full record for `actionId`.
    function getAction(bytes32 actionId) external view returns (CorpShiftTypes.ActionRecord memory);

    /// @notice All action ids recorded for `asset`, oldest first.
    function getActionHistory(address asset) external view returns (bytes32[] memory);

    /*//////////////////////////////////////////////////////////////
                            POLICY QUERIES
    //////////////////////////////////////////////////////////////*/

    /// @notice Whether `asset` may currently back new collateral value.
    function canUseAsCollateral(address asset) external view returns (bool);

    /// @notice Whether `asset` may currently be transferred safely.
    function canTransferSafely(address asset) external view returns (bool);

    /// @notice Whether obligations in `asset` may currently settle.
    function canSettle(address asset) external view returns (bool);

    /// @notice Evaluate a policy operation against the asset's current state.
    /// @return allowed Whether the operation is permitted.
    /// @return reason  Machine-readable reason code (bytes32(0) when allowed).
    function checkPolicy(address asset, CorpShiftTypes.PolicyOp op) external view returns (bool allowed, bytes32 reason);
}
