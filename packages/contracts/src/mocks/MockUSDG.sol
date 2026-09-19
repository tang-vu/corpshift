// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Metadata} from "../interfaces/IERC20Metadata.sol";

/// @title MockUSDG
/// @notice TEST/DEMO ONLY — a 6-decimal ERC-20 standing in for USDG
///         (Global Dollar) on chains where real USDG is not deployed
///         (Robinhood Chain testnet, Anvil). Real USDG on Robinhood Chain
///         mainnet is 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168.
///         This contract is NEVER represented as real USDG — symbol "mUSDG",
///         name "Mock USDG (testnet)".
contract MockUSDG is IERC20Metadata {
    string public constant name = "Mock USDG (testnet)";
    string public constant symbol = "mUSDG";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    error InsufficientBalance();
    error InsufficientAllowance();

    constructor(uint256 initialSupply) {
        _mint(msg.sender, initialSupply);
    }

    /// @notice Faucet for demos/tests.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

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
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}
