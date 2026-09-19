// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAssetAdapter} from "../interfaces/IAssetAdapter.sol";
import {IERC8056} from "../interfaces/IERC8056.sol";
import {IERC20, IERC20Metadata} from "../interfaces/IERC20Metadata.sol";

/// @title StockTokenAdapter
/// @notice IAssetAdapter for ERC-8056 assets (Robinhood Stock Tokens).
/// @dev    Normalizes via `uiMultiplier()`:
///           economicUnits = rawAmount × uiMultiplier / 1e18.
///         Stock Tokens do not implement ERC-165, so support is detected by
///         probing `uiMultiplier()` — a call that either returns a sensible
///         value or reverts. A reverted read is NEVER converted into a 1e18
///         default: reads fail loudly via `AdapterUnavailable` so consumers
///         fail closed instead of silently mis-valuing positions.
///
///         All probes use raw `staticcall` rather than try/catch: decode
///         failures on return data (e.g. calling an EOA, or a contract that
///         returns a malformed value) are NOT caught by Solidity try/catch —
///         staticcall makes "weird return" a first-class handled outcome.
contract StockTokenAdapter is IAssetAdapter {
    uint256 private constant ONE = 1e18;
    uint256 private constant MAX_FACTOR = 1e27; // 1e9 — sanity bound for corrupt reads

    /*//////////////////////////////////////////////////////////////
                                PROBE
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IAssetAdapter
    /// @dev    Non-throwing. True only when `uiMultiplier()` returns a
    ///         non-zero, sanely-bounded value — i.e. the contract really
    ///         behaves like an ERC-8056 Stock Token.
    function supportsAsset(address asset) public view returns (bool) {
        (bool ok, uint256 m) = _staticUint(asset, abi.encodeCall(IERC8056.uiMultiplier, ()));
        return ok && m > 0 && m <= MAX_FACTOR;
    }

    /*//////////////////////////////////////////////////////////////
                            NORMALIZATION
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IAssetAdapter
    function economicUnitsOf(address asset, address account) external view returns (uint256) {
        (bool ok, uint256 raw) = _staticUint(asset, abi.encodeCall(IERC20.balanceOf, (account)));
        if (!ok) revert AdapterUnavailable(asset, "balanceOf");
        return _scale(asset, raw);
    }

    /// @inheritdoc IAssetAdapter
    function economicUnitsOfAmount(address asset, uint256 amount) external view returns (uint256) {
        return _scale(asset, amount);
    }

    /// @dev    raw × multiplier / 1e18 with overflow checked explicitly:
    ///         a normalization that wraps around is worse than a revert.
    function _scale(address asset, uint256 raw) internal view returns (uint256) {
        uint256 m = _multiplier(asset);
        if (raw == 0 || m == ONE) return raw;
        if (raw > type(uint256).max / m) revert AdapterUnavailable(asset, "mul overflow");
        return (raw * m) / ONE;
    }

    /// @inheritdoc IAssetAdapter
    function normalizationFactor(address asset) external view returns (uint256) {
        return _multiplier(asset);
    }

    /// @inheritdoc IAssetAdapter
    /// @dev    Reads `newUIMultiplier()` + `effectiveAt()`. When either probe
    ///         fails the asset is treated as exposing no pending change —
    ///         a pre-extension token is still a valid Stock Token.
    function pendingNormalization(address asset) external view returns (uint256 newFactor, uint64 effectiveAt) {
        (bool okM, uint256 m) = _staticUint(asset, abi.encodeCall(IERC8056.newUIMultiplier, ()));
        newFactor = okM ? m : _multiplier(asset);
        (bool okT, uint256 t) = _staticUint(asset, abi.encodeCall(IERC8056.effectiveAt, ()));
        effectiveAt = okT ? uint64(t) : 0;
    }

    /// @inheritdoc IAssetAdapter
    function isOraclePaused(address asset) external view returns (bool) {
        (bool ok, uint256 p) = _staticUint(asset, abi.encodeCall(IERC8056.oraclePaused, ()));
        return ok && p != 0;
    }

    /// @inheritdoc IAssetAdapter
    function assetUid(address asset) external view returns (bytes32) {
        (bool success, bytes memory data) = asset.staticcall(abi.encodeCall(IERC8056.uid, ()));
        if (!success || data.length != 32) return bytes32(0);
        return abi.decode(data, (bytes32));
    }

    /// @inheritdoc IAssetAdapter
    function decimals(address asset) external view returns (uint8) {
        (bool ok, uint256 d) = _staticUint(asset, abi.encodeCall(IERC20Metadata.decimals, ()));
        if (!ok) return 18;
        return uint8(d);
    }

    /*//////////////////////////////////////////////////////////////
                            INTERNAL
    //////////////////////////////////////////////////////////////*/

    /// @dev    Read the live multiplier. Reverts loudly on failure or on a
    ///         zero/corrupt value — never silently returns 1e18.
    function _multiplier(address asset) internal view returns (uint256) {
        (bool ok, uint256 m) = _staticUint(asset, abi.encodeCall(IERC8056.uiMultiplier, ()));
        if (!ok) revert UnsupportedAsset(asset);
        if (m == 0 || m > MAX_FACTOR) {
            revert AdapterUnavailable(asset, "uiMultiplier out of bounds");
        }
        return m;
    }

    /// @dev    staticcall expecting exactly one uint256 word.
    function _staticUint(address target, bytes memory callData) internal view returns (bool ok, uint256 value) {
        (bool success, bytes memory data) = target.staticcall(callData);
        if (!success || data.length != 32) return (false, 0);
        return (true, abi.decode(data, (uint256)));
    }
}
