// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CorpShiftTypes} from "../libraries/CorpShiftTypes.sol";

/// @title IPolicyEngine
/// @notice Maps (asset state, protocol operation) → allow/deny decision.
/// @dev    CorpShift ships a conservative default engine; a protocol may wrap
///         or replace policy decisions in its own contracts, but should never
///         weaken them without understanding the economic-correctness risk.
interface IPolicyEngine {
    /// @notice Evaluate `op` for an asset in `state`.
    /// @return allowed Whether the operation is permitted.
    /// @return reason  Machine-readable reason code (bytes32(0) if allowed).
    function evaluate(CorpShiftTypes.AssetState state, CorpShiftTypes.PolicyOp op)
        external
        view
        returns (bool allowed, bytes32 reason);
}
