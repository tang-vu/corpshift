// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC8056} from "../interfaces/IERC8056.sol";
import {IERC20Metadata} from "../interfaces/IERC20Metadata.sol";

/// @title MockStockToken
/// @notice TEST/DEMO ONLY — a faithful ERC-8056 Stock Token stand-in for
///         environments where real Robinhood Stock Tokens are unavailable
///         (Anvil, Robinhood Chain testnet). Implements the exact interface
///         CorpShift's StockTokenAdapter consumes:
///           uiMultiplier / newUIMultiplier / effectiveAt /
///           balanceOfUI / totalSupplyUI / oraclePaused / uid /
///           UIMultiplierUpdated / TransferWithScaledUI.
/// @dev    Semantics mirror the documented real token: the multiplier is
///         scheduled ahead via `scheduleMultiplierUpdate` and becomes
///         effective at `effectiveAt`; `uiMultiplier()` reflects the
///         effective value lazily (exactly like reading the real token post-
///         effectiveAt). NEVER deployed as a claimed real Stock Token.
contract MockStockToken is IERC8056, IERC20Metadata {
    uint256 private constant ONE = 1e18;

    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    bytes32 private _uid;
    uint256 private _multiplier;
    uint256 private _pendingMultiplier;
    uint256 private _effectiveAt;
    bool private _oraclePaused;

    /// @notice Test issuer — schedules multiplier updates (the role the real
    ///         issuer's admin plays on Robinhood Chain).
    address public issuer;

    event IssuerUpdated(address indexed issuer);

    error NotIssuer();
    error InvalidMultiplier();
    error InsufficientBalance();
    error InsufficientAllowance();
    error ZeroAddress();

    constructor(string memory name_, string memory symbol_, bytes32 uid_, uint256 initialSupply, address issuer_) {
        if (issuer_ == address(0)) revert ZeroAddress();
        name = name_;
        symbol = symbol_;
        _uid = uid_;
        issuer = issuer_;
        _multiplier = ONE;
        _pendingMultiplier = ONE;
        _effectiveAt = 0;
        _mint(msg.sender, initialSupply);
    }

    /*//////////////////////////////////////////////////////////////
                          ERC-8056 SURFACE
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IERC8056
    /// @dev    Lazily materializes the pending multiplier once effectiveAt
    ///         has passed — reads match the real token's post-effective
    ///         state without requiring a crank transaction.
    function uiMultiplier() public view returns (uint256) {
        if (_effectiveAt != 0 && block.timestamp >= _effectiveAt) {
            return _pendingMultiplier;
        }
        return _multiplier;
    }

    /// @inheritdoc IERC8056
    function newUIMultiplier() external view returns (uint256) {
        return _pendingMultiplier;
    }

    /// @inheritdoc IERC8056
    function effectiveAt() external view returns (uint256) {
        return _effectiveAt;
    }

    /// @inheritdoc IERC8056
    function balanceOfUI(address account) external view returns (uint256) {
        return (balanceOf[account] * uiMultiplier()) / ONE;
    }

    /// @inheritdoc IERC8056
    function totalSupplyUI() external view returns (uint256) {
        return (totalSupply * uiMultiplier()) / ONE;
    }

    /// @inheritdoc IERC8056
    function oraclePaused() external view returns (bool) {
        return _oraclePaused;
    }

    /// @inheritdoc IERC8056
    function uid() external view returns (bytes32) {
        return _uid;
    }

    /*//////////////////////////////////////////////////////////////
                        TEST-ONLY CONTROLS
    //////////////////////////////////////////////////////////////*/

    /// @notice Schedule a multiplier change (the mock of a corporate action
    ///         landing on the real token). Emits UIMultiplierUpdated with the
    ///         effective timestamp when materialized by `syncMultiplier`.
    function scheduleMultiplierUpdate(uint256 newMultiplier, uint256 effectiveAt_) external {
        if (msg.sender != issuer) revert NotIssuer();
        if (newMultiplier == 0) revert InvalidMultiplier();
        _pendingMultiplier = newMultiplier;
        _effectiveAt = effectiveAt_;
    }

    /// @notice Materialize a due multiplier update (permissionless crank).
    /// @dev    `uiMultiplier()` already reflects the new value lazily; this
    ///         emits the canonical event for indexers.
    function syncMultiplier() external {
        if (_effectiveAt == 0 || block.timestamp < _effectiveAt) return;
        if (_multiplier == _pendingMultiplier) return;
        uint256 old = _multiplier;
        _multiplier = _pendingMultiplier;
        emit UIMultiplierUpdated(old, _multiplier, _effectiveAt);
    }

    /// @notice Set the advisory oracle-pause flag (corp-action processing).
    function setOraclePaused(bool paused) external {
        if (msg.sender != issuer) revert NotIssuer();
        _oraclePaused = paused;
    }

    /// @notice Rotate the test issuer.
    function setIssuer(address newIssuer) external {
        if (msg.sender != issuer) revert NotIssuer();
        if (newIssuer == address(0)) revert ZeroAddress();
        issuer = newIssuer;
        emit IssuerUpdated(newIssuer);
    }

    /// @notice Faucet for demos/tests.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /*//////////////////////////////////////////////////////////////
                            ERC-20 CORE
    //////////////////////////////////////////////////////////////*/

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed < amount) revert InsufficientAllowance();
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (balanceOf[from] < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] -= amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
        emit TransferWithScaledUI(from, to, amount, (amount * uiMultiplier()) / ONE);
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
        emit TransferWithScaledUI(address(0), to, amount, (amount * uiMultiplier()) / ONE);
    }
}
