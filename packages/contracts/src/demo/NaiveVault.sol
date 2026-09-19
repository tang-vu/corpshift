// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20, IERC20Metadata, SafeTransfer} from "../interfaces/IERC20Metadata.sol";
import {MockPriceOracle} from "../mocks/MockPriceOracle.sol";

/// @title NaiveVault
/// @notice DEMO CONTRACT — a deliberately naive collateral vault that values
///         positions as `rawBalance × sharePrice`, ignoring the corporate-
///         action multiplier entirely. It exists to demonstrate the failure
///         mode CorpShift prevents: after a split, it mixes stale share-units
///         with the post-split price and computes a wrong health factor —
///         wrongfully liquidating healthy users (forward split) or
///         over-lending into insolvency (reverse split).
/// @dev    This is what a protocol looks like when it only reads `balanceOf`.
contract NaiveVault {
    using SafeTransfer for IERC20;

    IERC20 public immutable collateral;
    IERC20 public immutable debt; //        payment asset (e.g. mUSDG)
    MockPriceOracle public immutable oracle;

    /// @notice Liquidation threshold, 1e18-fixed (0.8 = 80%).
    uint256 public constant LT = 0.8e18;

    /// @notice Converts debt-token atomic units to 18dp USD terms
    ///         (debt token is assumed ~$1, e.g. mUSDG with 6 decimals).
    uint256 public immutable DEBT_SCALE;

    mapping(address => uint256) public collateralRaw;
    mapping(address => uint256) public debtOf;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event Liquidated(address indexed user, address indexed liquidator, uint256 collateralSeized, uint256 debtCleared);

    error InsufficientCollateral();
    error NotLiquidatable();
    error NothingDeposited();
    error ZeroAmount();

    constructor(IERC20 collateral_, IERC20 debt_, MockPriceOracle oracle_) {
        collateral = collateral_;
        debt = debt_;
        oracle = oracle_;
        DEBT_SCALE = 10 ** (18 - IERC20Metadata(address(debt_)).decimals());
    }

    /// @notice Deposit stock tokens as collateral.
    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        collateral.safeTransferFrom(msg.sender, address(this), amount);
        collateralRaw[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    /// @notice Withdraw collateral if the position stays healthy.
    function withdraw(uint256 amount) external {
        if (amount == 0 || amount > collateralRaw[msg.sender]) revert InsufficientCollateral();
        collateralRaw[msg.sender] -= amount;
        if (debtOf[msg.sender] > 0 && healthFactor(msg.sender) < 1e18) {
            collateralRaw[msg.sender] += amount;
            revert InsufficientCollateral();
        }
        collateral.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Borrow debt tokens against collateral. THE BUG: collateral
    ///         value is computed from the raw token balance as if 1 token
    ///         were always 1 share — stale after any corporate action.
    function borrow(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        debtOf[msg.sender] += amount;
        if (healthFactor(msg.sender) < 1e18) {
            debtOf[msg.sender] -= amount;
            revert InsufficientCollateral();
        }
        debt.safeTransfer(msg.sender, amount);
        emit Borrowed(msg.sender, amount);
    }

    /// @notice Repay debt.
    function repay(uint256 amount) external {
        uint256 d = debtOf[msg.sender];
        uint256 pay = amount > d ? d : amount;
        if (pay == 0) revert ZeroAmount();
        debt.safeTransferFrom(msg.sender, address(this), pay);
        debtOf[msg.sender] -= pay;
        emit Repaid(msg.sender, pay);
    }

    /// @notice NAIVE valuation: rawBalance treated as share count.
    /// @dev    After a 4:1 split the account still reads "10" while the true
    ///         share-equivalent is 40 — value comes out 4× too low. After a
    ///         1:10 reverse split it comes out 10× too high.
    function collateralValue(address user) public view returns (uint256) {
        int256 price = oracle.latestAnswer(address(collateral));
        if (price <= 0) return 0;
        // units(18dp) × price(8dp) / 1e8 → 18dp value
        return (collateralRaw[user] * uint256(price)) / 1e8;
    }

    /// @notice healthFactor = collateralValue × LT / debt (debt normalized
    ///         from atomic units to 18dp USD terms via DEBT_SCALE).
    function healthFactor(address user) public view returns (uint256) {
        uint256 d = debtOf[user];
        if (d == 0) return type(uint256).max;
        return (collateralValue(user) * LT) / (d * DEBT_SCALE);
    }

    /// @notice Seize an unhealthy position: liquidator repays the debt and
    ///         takes the collateral. Executes whenever healthFactor < 1 —
    ///         including WRONGFULLY, on a healthy position the naive math
    ///         merely believes is unhealthy.
    function liquidate(address user) external {
        if (healthFactor(user) >= 1e18) revert NotLiquidatable();
        uint256 seized = collateralRaw[user];
        uint256 cleared = debtOf[user];
        collateralRaw[user] = 0;
        debtOf[user] = 0;
        debt.safeTransferFrom(msg.sender, address(this), cleared);
        if (seized > 0) collateral.safeTransfer(msg.sender, seized);
        emit Liquidated(user, msg.sender, seized, cleared);
    }
}
