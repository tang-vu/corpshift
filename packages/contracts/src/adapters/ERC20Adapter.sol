// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAssetAdapter} from "../interfaces/IAssetAdapter.sol";
import {IERC20, IERC20Metadata} from "../interfaces/IERC20Metadata.sol";

/// @title ERC20Adapter
/// @notice IAssetAdapter for plain ERC-20 tokens: normalization factor is
///         always exactly 1e18 and economic units equal raw units.
/// @dev    Registered assets still benefit from CorpShift's runtime state and
///         policy layer — e.g. an attested trading halt on a plain token
///         blocks the same downstream operations.
contract ERC20Adapter is IAssetAdapter {
    uint256 private constant ONE = 1e18;

    /// @inheritdoc IAssetAdapter
    /// @dev    True when `balanceOf(0)` reads — i.e. it looks like an ERC-20.
    ///         Raw staticcall so a malformed return (EOA, short data) is a
    ///         clean `false`, not an uncaught decode revert.
    function supportsAsset(address asset) public view returns (bool) {
        (bool success, bytes memory data) = asset.staticcall(abi.encodeCall(IERC20.balanceOf, (address(0))));
        return success && data.length == 32;
    }

    /// @inheritdoc IAssetAdapter
    function economicUnitsOf(address asset, address account) external view returns (uint256) {
        (bool success, bytes memory data) = asset.staticcall(abi.encodeCall(IERC20.balanceOf, (account)));
        if (!success || data.length != 32) revert AdapterUnavailable(asset, "balanceOf");
        return abi.decode(data, (uint256));
    }

    /// @inheritdoc IAssetAdapter
    function economicUnitsOfAmount(address, uint256 amount) external pure returns (uint256) {
        return amount;
    }

    /// @inheritdoc IAssetAdapter
    function normalizationFactor(address) external pure returns (uint256) {
        return ONE;
    }

    /// @inheritdoc IAssetAdapter
    function pendingNormalization(address) external pure returns (uint256, uint64) {
        return (ONE, 0);
    }

    /// @inheritdoc IAssetAdapter
    function isOraclePaused(address) external pure returns (bool) {
        return false;
    }

    /// @inheritdoc IAssetAdapter
    function assetUid(address) external pure returns (bytes32) {
        return bytes32(0);
    }

    /// @inheritdoc IAssetAdapter
    function decimals(address asset) external view returns (uint8) {
        try IERC20Metadata(asset).decimals() returns (uint8 d) {
            return d;
        } catch {
            return 18;
        }
    }
}
