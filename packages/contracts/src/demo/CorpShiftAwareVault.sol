// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CorpShiftTypes} from "../libraries/CorpShiftTypes.sol";
import {ICorpShift} from "../interfaces/ICorpShift.sol";
import {IERC20, IERC20Metadata, SafeTransfer} from "../interfaces/IERC20Metadata.sol";
import {MockPriceOracle} from "../mocks/MockPriceOracle.sol";

/// @title CorpShiftAwareVault
/// @notice DEMO CONTRACT — the same collateral vault as NaiveVault, but
///         integrated with CorpShift in the handful of lines a real
///         integration takes:
///
///           • collateral units come from `corpshift.economicBalanceOf`
///             (share-equivalents), never raw `balanceOf`
///           • every risk-bearing operation consults `corpshift.checkPolicy`
///             so a pending/active corporate action blocks unsafe behavior
///
///         The result: the same 4:1 split that makes NaiveVault wrongfully
///         liquidate a healthy user is handled correctly here — operations
///         pause while the action is pending, resume when normalized, and
///         the health factor stays right at every step.
contract CorpShiftAwareVault {
    using SafeTransfer for IERC20;

    ICorpShift public immutable corpshift;
    IERC20 public immutable collateral;
    IERC20 public immutable debt;
    MockPriceOracle public immutable oracle;

    uint256 public constant LT = 0.8e18;

    /// @notice Debt atomic → 18dp USD scale (same convention as NaiveVault).
    uint256 public immutable DEBT_SCALE;

    mapping(address => uint256) public collateralRaw;
    mapping(address => uint256) public debtOf;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event Liquidated(address indexed user, address indexed liquidator, uint256 collateralSeized, uint256 debtCleared);
    event OperationBlocked(address indexed user, CorpShiftTypes.PolicyOp op, bytes32 reason);

    error InsufficientCollateral();
    error NotLiquidatable();
    error UnsafeAssetState(CorpShiftTypes.PolicyOp op, bytes32 reason);
    error ZeroAmount();

    constructor(ICorpShift corpshift_, IERC20 collateral_, IERC20 debt_, MockPriceOracle oracle_) {
        corpshift = corpshift_;
        collateral = collateral_;
        debt = debt_;
        oracle = oracle_;
        DEBT_SCALE = 10 ** (18 - IERC20Metadata(address(debt_)).decimals());
    }

    /// @dev Gate an operation on CorpShift's policy decision for the asset.
    ///      This is the entire integration surface — one call.
    function _requireSafe(CorpShiftTypes.PolicyOp op) internal {
        (bool allowed, bytes32 reason) = corpshift.checkPolicy(address(collateral), op);
        if (!allowed) revert UnsafeAssetState(op, reason);
    }

    /// @notice Deposit stock tokens as collateral. Policy-gated: deposits
    ///         stay open during ACTION_PENDING (per default policy) but halt
    ///         during ADJUSTING/MIGRATING/etc.
    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        _requireSafe(CorpShiftTypes.PolicyOp.DEPOSIT);
        collateral.safeTransferFrom(msg.sender, address(this), amount);
        collateralRaw[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    /// @notice Withdraw collateral if the position stays healthy.
    function withdraw(uint256 amount) external {
        if (amount == 0 || amount > collateralRaw[msg.sender]) revert InsufficientCollateral();
        _requireSafe(CorpShiftTypes.PolicyOp.WITHDRAW);
        collateralRaw[msg.sender] -= amount;
        if (debtOf[msg.sender] > 0 && healthFactor(msg.sender) < 1e18) {
            collateralRaw[msg.sender] += amount;
            revert InsufficientCollateral();
        }
        collateral.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Borrow against collateral. Policy-gated: a scheduled split
    ///         blocks new borrows until normalization is verified — the
    ///         protocol can never lend against a basis it can't verify.
    function borrow(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        _requireSafe(CorpShiftTypes.PolicyOp.BORROW);
        debtOf[msg.sender] += amount;
        if (healthFactor(msg.sender) < 1e18) {
            debtOf[msg.sender] -= amount;
            revert InsufficientCollateral();
        }
        debt.safeTransfer(msg.sender, amount);
        emit Borrowed(msg.sender, amount);
    }

    /// @notice Repay debt — always allowed (repayment is risk-reducing).
    function repay(uint256 amount) external {
        uint256 d = debtOf[msg.sender];
        uint256 pay = amount > d ? d : amount;
        if (pay == 0) revert ZeroAmount();
        debt.safeTransferFrom(msg.sender, address(this), pay);
        debtOf[msg.sender] -= pay;
        emit Repaid(msg.sender, pay);
    }

    /// @notice CORRECT valuation: deposited collateral converted to
    ///         share-equivalent units × share price.
    /// @dev    `economicUnitsOfAmount` applies the live ERC-8056 multiplier
    ///         to the deposited raw amount, so a 4:1 split reads 40 units
    ///         at $25, not 10 — value stays exact through the transition.
    function collateralValue(address user) public view returns (uint256) {
        int256 price = oracle.latestAnswer(address(collateral));
        if (price <= 0) return 0;
        uint256 units = corpshift.economicUnitsOfAmount(address(collateral), collateralRaw[user]);
        return (units * uint256(price)) / 1e8;
    }

    /// @notice healthFactor = collateralValue × LT / debt (DEBT_SCALE-normalized).
    function healthFactor(address user) public view returns (uint256) {
        uint256 d = debtOf[user];
        if (d == 0) return type(uint256).max;
        return (collateralValue(user) * LT) / (d * DEBT_SCALE);
    }

    /// @notice Seize an unhealthy position. Policy-gated: liquidations pause
    ///         while an action is pending/adjusting (positions can't be
    ///         fairly priced mid-transition), and the post-split health check
    ///         uses normalized units — a healthy user can never be seized.
    function liquidate(address user) external {
        (bool allowed, bytes32 reason) = corpshift.checkPolicy(address(collateral), CorpShiftTypes.PolicyOp.LIQUIDATE);
        if (!allowed) {
            emit OperationBlocked(user, CorpShiftTypes.PolicyOp.LIQUIDATE, reason);
            revert UnsafeAssetState(CorpShiftTypes.PolicyOp.LIQUIDATE, reason);
        }
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
