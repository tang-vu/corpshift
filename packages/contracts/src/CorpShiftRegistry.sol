// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CorpShiftTypes} from "./libraries/CorpShiftTypes.sol";
import {AttestationLib, ECDSA} from "./libraries/AttestationLib.sol";
import {Owned} from "./libraries/Owned.sol";
import {ICorpShift} from "./interfaces/ICorpShift.sol";
import {IPolicyEngine} from "./interfaces/IPolicyEngine.sol";
import {IAssetAdapter} from "./interfaces/IAssetAdapter.sol";

/// @title CorpShiftRegistry
/// @notice The canonical corporate-action runtime: an attested action
///         registry, a deterministic asset state machine, an economic
///         normalization surface, and protocol policy hooks — one contract,
///         one integration address.
///
/// @dev    Trust model (explicit, not claimed to be trustless):
///         corporate-action facts arrive from an offchain source, are
///         canonicalized by the ingestion layer, and are signed by an
///         authorized EIP-712 attester. This contract verifies the signature,
///         binds it to (chainId, this contract), deduplicates by
///         (source, sourceEventId), and then drives a deterministic state
///         machine. Reconciliation compares the *attested expectation*
///         (e.g. expected new multiplier) against *onchain token state* —
///         divergence moves the asset to DEGRADED rather than being ignored.
///
///         Lifecycle per action:
///           submit → SCHEDULED (effectiveAt future) | ACTIVE (effective now)
///                  | UNSUPPORTED (unmodelled type)
///           SCHEDULED → ACTIVE   via activateAction  (crank at effectiveAt)
///           ACTIVE    → RESOLVED via applyAction     (reconciliation passes)
///           *         → INVALIDATED via invalidateAction (owner)
///
///         Asset state transitions are gated by a transition table; illegal
///         transitions revert. See docs/architecture for the full table.
contract CorpShiftRegistry is ICorpShift, Owned {
    using CorpShiftTypes for *;

    /*//////////////////////////////////////////////////////////////
                               STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice The policy engine consulted by `checkPolicy`.
    IPolicyEngine public policyEngine;

    /// @notice EIP-712 attesters authorized to vouch for actions.
    mapping(address => bool) public authorizedSigners;

    /// @notice actionId → stored action.
    mapping(bytes32 => CorpShiftTypes.ActionRecord) private _actions;

    /// @notice asset → runtime record.
    mapping(address => CorpShiftTypes.AssetRecord) private _assets;

    /// @notice asset → ordered action history.
    mapping(address => bytes32[]) private _assetActionIds;

    /// @notice asset → the halt action currently in force (0 if none).
    mapping(address => bytes32) public activeHaltAction;

    /// @notice Registered asset addresses, in registration order.
    address[] public assetList;

    /// @dev    state → bitmask of permitted destination states.
    mapping(uint8 => uint256) private _legalTransitions;

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice A corporate action was observed and attested onchain.
    /// @dev    Emitted at submission — this is the attestation receipt:
    ///         signer, evidence hash, and source are all bound here.
    event CorporateActionAttested(
        bytes32 indexed actionId,
        address indexed asset,
        CorpShiftTypes.ActionType indexed actionType,
        uint64 effectiveAt,
        bytes32 evidenceHash,
        address signer,
        bytes32 sourceHash,
        bytes32 sourceEventId
    );

    /// @notice A scheduled action became effective.
    event CorporateActionActivated(bytes32 indexed actionId, address indexed asset);

    /// @notice Reconciliation passed; the action's effect is verified onchain.
    event CorporateActionApplied(bytes32 indexed actionId, address indexed asset);

    /// @notice Action reached a terminal RESOLVED state.
    event CorporateActionResolved(bytes32 indexed actionId, address indexed asset);

    /// @notice Action was invalidated by governance.
    event CorporateActionInvalidated(bytes32 indexed actionId, address indexed asset, bytes32 reason);

    /// @notice Action could not be modelled — recorded as UNSUPPORTED.
    event CorporateActionUnsupported(bytes32 indexed actionId, address indexed asset, uint8 rawType);

    /// @notice Asset runtime state transition.
    event AssetStateChanged(
        address indexed asset,
        CorpShiftTypes.AssetState indexed from,
        CorpShiftTypes.AssetState indexed to,
        bytes32 actionId
    );

    /// @notice Normalization factor verified against an attested action.
    event NormalizationVerified(address indexed asset, uint256 factor, bytes32 indexed actionId);

    /// @notice Attested expectation diverged from onchain token state.
    event ReconciliationFailed(
        bytes32 indexed actionId, address indexed asset, uint256 expectedFactor, uint256 actualFactor
    );

    event AssetRegistered(address indexed asset, address indexed adapter, bytes32 uid, string symbol);
    event AssetAdapterUpdated(address indexed asset, address indexed adapter);
    event SignerUpdated(address indexed signer, bool allowed);
    event PolicyEngineUpdated(address indexed engine);
    event SettlementOpened(bytes32 indexed actionId, address indexed asset);

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/

    error AssetAlreadyRegistered(address asset);
    error AssetNotRegistered(address asset);
    error AdapterNotCompatible(address adapter, address asset);
    error DuplicateAction(bytes32 actionId);
    error ActionNotFound(bytes32 actionId);
    error ActionNotScheduled(bytes32 actionId);
    error ActionNotActive(bytes32 actionId);
    error ActionNotYetEffective(bytes32 actionId, uint64 effectiveAt);
    error ActionTerminal(bytes32 actionId);
    error InvalidSchema(bytes32 schemaHash);
    error InvalidSigner(address signer);
    error InvalidSignature();
    error InvalidAsset(address asset);
    error InvalidParams(string reason);
    error IllegalTransition(CorpShiftTypes.AssetState from, CorpShiftTypes.AssetState to);
    error NormalizationMismatch(uint256 expected, uint256 actual);
    error UnsupportedType(uint8 actionType);

    /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @param engine_  Policy engine address.
    /// @param signer_  Initial authorized EIP-712 attester.
    constructor(address engine_, address signer_) {
        if (engine_ == address(0) || signer_ == address(0)) revert ZeroAddress();
        policyEngine = IPolicyEngine(engine_);
        authorizedSigners[signer_] = true;
        _seedTransitions();
        emit PolicyEngineUpdated(engine_);
        emit SignerUpdated(signer_, true);
    }

    /// @dev Legal transition table. Recovery exits (DEGRADED/UNSUPPORTED)
    ///      are reachable from every non-terminal state so the system can
    ///      always be flagged safe rather than get stuck.
    function _seedTransitions() internal {
        uint8 A = uint8(CorpShiftTypes.AssetState.ACTIVE);
        uint8 P = uint8(CorpShiftTypes.AssetState.ACTION_PENDING);
        uint8 J = uint8(CorpShiftTypes.AssetState.ADJUSTING);
        uint8 H = uint8(CorpShiftTypes.AssetState.HALTED);
        uint8 M = uint8(CorpShiftTypes.AssetState.MIGRATING);
        uint8 R = uint8(CorpShiftTypes.AssetState.REDEEMING);
        uint8 D = uint8(CorpShiftTypes.AssetState.DEGRADED);
        uint8 U = uint8(CorpShiftTypes.AssetState.UNSUPPORTED);

        _allow(A, P); // economic action scheduled
        _allow(A, J); // action already effective at submission (no pending window)
        _allow(A, H); // halt
        _allow(A, M); // merger / spin-off effective
        _allow(A, R); // redemption effective

        _allow(P, J); // scheduled action became effective
        _allow(P, A); // scheduled action invalidated before effect
        _allow(P, H); // halt arrives while pending

        _allow(J, A); // reconciliation passed
        _allow(J, H); // halt during adjustment

        _allow(H, A); // resume
        _allow(H, P); // action scheduled while halted

        _allow(M, R); // migration completes into redemption
        _allow(M, A); // migration cancelled

        _allow(R, A); // redemption cancelled

        _allow(D, A); // governance reconciliation
        _allow(D, P); // new action scheduled during recovery
        _allow(D, H); // halt during recovery

        _allow(U, A); // adapter support added later
    }

    function _allow(uint8 from, uint8 to) internal {
        _legalTransitions[from] |= (uint256(1) << to);
    }

    /*//////////////////////////////////////////////////////////////
                          ASSET ADMINISTRATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Register an asset and its normalization adapter.
    /// @param asset   Token contract address.
    /// @param adapter IAssetAdapter capable of normalizing `asset`.
    /// @param symbol  Display symbol (metadata only).
    function registerAsset(address asset, address adapter, string calldata symbol) external onlyOwner {
        if (asset == address(0) || adapter == address(0)) revert ZeroAddress();
        if (_assets[asset].exists) revert AssetAlreadyRegistered(asset);
        if (!IAssetAdapter(adapter).supportsAsset(asset)) {
            revert AdapterNotCompatible(adapter, asset);
        }

        bytes32 uid = IAssetAdapter(adapter).assetUid(asset);
        uint256 factor = IAssetAdapter(adapter).normalizationFactor(asset);

        _assets[asset] = CorpShiftTypes.AssetRecord({
            adapter: adapter,
            uid: uid,
            state: CorpShiftTypes.AssetState.ACTIVE,
            pendingActionId: bytes32(0),
            lastVerifiedFactor: factor,
            registeredAt: uint64(block.timestamp),
            exists: true
        });
        assetList.push(asset);

        emit AssetRegistered(asset, adapter, uid, symbol);
    }

    /// @notice Replace the adapter for a registered asset.
    function setAssetAdapter(address asset, address adapter) external onlyOwner {
        if (!_assets[asset].exists) revert AssetNotRegistered(asset);
        if (!IAssetAdapter(adapter).supportsAsset(asset)) {
            revert AdapterNotCompatible(adapter, asset);
        }
        _assets[asset].adapter = adapter;
        emit AssetAdapterUpdated(asset, adapter);
    }

    /// @notice Authorize or revoke an EIP-712 attester.
    function setSigner(address signer, bool allowed) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();
        authorizedSigners[signer] = allowed;
        emit SignerUpdated(signer, allowed);
    }

    /// @notice Point the registry at a new policy engine.
    function setPolicyEngine(address engine) external onlyOwner {
        if (engine == address(0)) revert ZeroAddress();
        policyEngine = IPolicyEngine(engine);
        emit PolicyEngineUpdated(engine);
    }

    /*//////////////////////////////////////////////////////////////
                          ACTION SUBMISSION
    //////////////////////////////////////////////////////////////*/

    /// @notice Submit an attested corporate action.
    /// @dev    Permissionless relay: the EIP-712 signature is the only gate.
    ///         `params` is bound to the signature through `paramsHash` —
    ///         the caller cannot alter it without invalidating the signature.
    /// @param payload   The signed ActionPayload.
    /// @param params    ABI-encoded action parameters (per ActionType).
    /// @param signature Attester's EIP-712 signature over `payload`.
    /// @return actionId Canonical action id = keccak256(sourceHash, sourceEventId).
    function submitAction(
        CorpShiftTypes.ActionPayload calldata payload,
        bytes calldata params,
        bytes calldata signature
    ) external returns (bytes32 actionId) {
        if (payload.schemaHash != AttestationLib.SCHEMA_V1) {
            revert InvalidSchema(payload.schemaHash);
        }
        if (payload.asset == address(0)) revert InvalidAsset(address(0));
        if (keccak256(params) != payload.paramsHash) revert InvalidParams("params hash mismatch");

        address signer = ECDSA.recover(AttestationLib.digest(payload), signature);
        if (!authorizedSigners[signer]) revert InvalidSigner(signer);

        actionId = AttestationLib.actionIdOf(payload.sourceHash, payload.sourceEventId);
        if (_actions[actionId].submittedAt != 0) revert DuplicateAction(actionId);

        CorpShiftTypes.ActionType aType = CorpShiftTypes.ActionType(payload.actionType);
        _record(payload, params, actionId, aType, signer);

        if (aType == CorpShiftTypes.ActionType.UNKNOWN) {
            _actions[actionId].status = CorpShiftTypes.ActionStatus.UNSUPPORTED;
            emit CorporateActionUnsupported(actionId, payload.asset, payload.actionType);
            _flagDegraded(payload.asset, actionId);
            return actionId;
        }

        if (payload.effectiveAt > block.timestamp) {
            _scheduleEffect(payload.asset, aType, actionId, params);
            return actionId;
        }

        _actions[actionId].status = CorpShiftTypes.ActionStatus.ACTIVE;
        emit CorporateActionActivated(actionId, payload.asset);
        _applyStateEffect(payload.asset, aType, actionId, params);
        return actionId;
    }

    /// @dev Persist the action record, index it, and emit the attestation
    ///      receipt. Isolated to keep `submitAction` under the stack limit.
    function _record(
        CorpShiftTypes.ActionPayload calldata payload,
        bytes calldata params,
        bytes32 actionId,
        CorpShiftTypes.ActionType aType,
        address signer
    ) internal {
        _actions[actionId] = CorpShiftTypes.ActionRecord({
            actionId: actionId,
            sourceHash: payload.sourceHash,
            sourceEventId: payload.sourceEventId,
            asset: payload.asset,
            actionType: aType,
            status: CorpShiftTypes.ActionStatus.SCHEDULED,
            announcedAt: payload.announcedAt,
            effectiveAt: payload.effectiveAt,
            observedAt: payload.observedAt,
            submittedAt: uint64(block.timestamp),
            params: params,
            paramsHash: payload.paramsHash,
            evidenceHash: payload.evidenceHash,
            attestedBy: signer
        });
        _assetActionIds[payload.asset].push(actionId);

        emit CorporateActionAttested(
            actionId,
            payload.asset,
            aType,
            payload.effectiveAt,
            payload.evidenceHash,
            signer,
            payload.sourceHash,
            payload.sourceEventId
        );
    }

    /// @dev Whether `aType` produces a normalization change worth tracking.
    ///      CASH_DIVIDEND is economic only when an expected multiplier is
    ///      attached (reinvested-dividend model); a pure cash payout stays
    ///      informational and resolves via the settlement path instead.
    function _isEconomicType(CorpShiftTypes.ActionType aType, bytes memory params) internal pure returns (bool) {
        if (
            aType == CorpShiftTypes.ActionType.FORWARD_SPLIT || aType == CorpShiftTypes.ActionType.REVERSE_SPLIT
                || aType == CorpShiftTypes.ActionType.STOCK_DIVIDEND
                || aType == CorpShiftTypes.ActionType.MULTIPLIER_CHANGE
        ) return true;
        if (aType == CorpShiftTypes.ActionType.CASH_DIVIDEND) {
            return _lastWord(params) != 0;
        }
        return false;
    }

    /// @dev State effect when an action is merely SCHEDULED (future effect).
    function _scheduleEffect(address asset, CorpShiftTypes.ActionType aType, bytes32 actionId, bytes memory params)
        internal
    {
        if (!_assets[asset].exists) return; // unregistered assets: recorded, no state effect
        CorpShiftTypes.AssetState current = _assets[asset].state;
        if (_isEconomicType(aType, params)) {
            if (current == CorpShiftTypes.AssetState.ACTIVE) {
                _transition(asset, CorpShiftTypes.AssetState.ACTION_PENDING, actionId);
            }
            _assets[asset].pendingActionId = actionId;
        }
        // Informational scheduled actions (symbol change, pure-cash dividend)
        // don't churn asset state.
    }

    /// @dev State effect when an action becomes effective (submit-effective
    ///      path or activateAction crank).
    function _applyStateEffect(address asset, CorpShiftTypes.ActionType aType, bytes32 actionId, bytes memory params)
        internal
    {
        if (!_assets[asset].exists) return;

        if (aType == CorpShiftTypes.ActionType.TRADING_HALT) {
            _transition(asset, CorpShiftTypes.AssetState.HALTED, actionId);
            activeHaltAction[asset] = actionId;
            return;
        }
        if (aType == CorpShiftTypes.ActionType.TRADING_RESUME) {
            if (_assets[asset].state == CorpShiftTypes.AssetState.HALTED) {
                _transition(asset, CorpShiftTypes.AssetState.ACTIVE, actionId);
            }
            _resolveHalt(asset);
            return;
        }
        if (aType == CorpShiftTypes.ActionType.MERGER || aType == CorpShiftTypes.ActionType.SPIN_OFF) {
            _transition(asset, CorpShiftTypes.AssetState.MIGRATING, actionId);
            return;
        }
        if (aType == CorpShiftTypes.ActionType.REDEMPTION) {
            _transition(asset, CorpShiftTypes.AssetState.REDEEMING, actionId);
            return;
        }
        if (_isEconomicType(aType, params)) {
            _transition(asset, CorpShiftTypes.AssetState.ADJUSTING, actionId);
        }
    }

    /*//////////////////////////////////////////////////////////////
                          ACTION LIFECYCLE CRANKS
    //////////////////////////////////////////////////////////////*/

    /// @notice Activate a scheduled action whose effectiveAt has arrived.
    /// @dev    Permissionless crank — deterministic given (record, time).
    function activateAction(bytes32 actionId) external {
        CorpShiftTypes.ActionRecord storage rec = _actions[actionId];
        if (rec.submittedAt == 0) revert ActionNotFound(actionId);
        if (rec.status != CorpShiftTypes.ActionStatus.SCHEDULED) {
            revert ActionNotScheduled(actionId);
        }
        if (block.timestamp < rec.effectiveAt) {
            revert ActionNotYetEffective(actionId, rec.effectiveAt);
        }

        rec.status = CorpShiftTypes.ActionStatus.ACTIVE;
        emit CorporateActionActivated(actionId, rec.asset);
        _applyStateEffect(rec.asset, rec.actionType, actionId, rec.params);
    }

    /// @notice Reconcile an active action against onchain token state.
    /// @dev    For multiplier-bearing actions this verifies the token's live
    ///         `uiMultiplier()` equals the attested `expectedMultiplier`.
    ///         Mismatch → asset DEGRADED (action stays ACTIVE, retryable).
    ///         Never reverts on divergence — surfacing it is the point.
    /// @return resolved Whether the action resolved this call.
    function applyAction(bytes32 actionId) external returns (bool resolved) {
        CorpShiftTypes.ActionRecord storage rec = _actions[actionId];
        if (rec.submittedAt == 0) revert ActionNotFound(actionId);
        if (rec.status != CorpShiftTypes.ActionStatus.ACTIVE) {
            revert ActionNotActive(actionId);
        }

        address asset = rec.asset;
        CorpShiftTypes.ActionType aType = rec.actionType;

        if (aType == CorpShiftTypes.ActionType.TRADING_HALT) {
            // A halt resolves only when its matching RESUME applies.
            revert InvalidParams("halt resolves via resume");
        }

        if (_isEconomicType(aType, rec.params)) {
            uint256 expected = _expectedMultiplier(rec);
            if (expected != 0) {
                uint256 actual = IAssetAdapter(_assets[asset].adapter).normalizationFactor(asset);
                if (actual != expected) {
                    _transition(asset, CorpShiftTypes.AssetState.DEGRADED, actionId);
                    emit ReconciliationFailed(actionId, asset, expected, actual);
                    return false;
                }
                _assets[asset].lastVerifiedFactor = actual;
                emit NormalizationVerified(asset, actual, actionId);
            }
        }

        // TRADING_RESUME: the halt lift + pointer resolution already happened
        // in _applyStateEffect at activation. Resolving activeHaltAction here
        // would let a stale resume silently cancel a *newer* halt.

        if (aType == CorpShiftTypes.ActionType.MERGER) {
            // Successor mapping finalized → the legacy asset winds down.
            if (_assets[asset].state == CorpShiftTypes.AssetState.MIGRATING) {
                _transition(asset, CorpShiftTypes.AssetState.REDEEMING, actionId);
            }
        }

        rec.status = CorpShiftTypes.ActionStatus.RESOLVED;
        if (_assets[asset].pendingActionId == actionId) {
            _assets[asset].pendingActionId = bytes32(0);
        }

        CorpShiftTypes.AssetState st = _assets[asset].state;
        if (st == CorpShiftTypes.AssetState.ADJUSTING) {
            _transition(asset, CorpShiftTypes.AssetState.ACTIVE, actionId);
        }

        emit CorporateActionApplied(actionId, asset);
        emit CorporateActionResolved(actionId, asset);
        return true;
    }

    /// @notice Invalidate an action (governance escape hatch).
    /// @dev    Used when a source publishes a correction or a signer is
    ///         compromised. If the action had scheduled a state change, the
    ///         asset returns to ACTIVE unless another constraint holds.
    function invalidateAction(bytes32 actionId, bytes32 reason) external onlyOwner {
        CorpShiftTypes.ActionRecord storage rec = _actions[actionId];
        if (rec.submittedAt == 0) revert ActionNotFound(actionId);
        if (
            rec.status == CorpShiftTypes.ActionStatus.RESOLVED || rec.status == CorpShiftTypes.ActionStatus.INVALIDATED
                || rec.status == CorpShiftTypes.ActionStatus.UNSUPPORTED
        ) revert ActionTerminal(actionId);

        rec.status = CorpShiftTypes.ActionStatus.INVALIDATED;
        address asset = rec.asset;
        if (_assets[asset].pendingActionId == actionId) {
            _assets[asset].pendingActionId = bytes32(0);
        }

        // If the invalidated action was the in-force halt, the halt is lifted —
        // a HALTED asset must never reference a non-ACTIVE halt record.
        bool liftedHalt;
        if (activeHaltAction[asset] == actionId) {
            activeHaltAction[asset] = bytes32(0);
            liftedHalt = true;
        }

        CorpShiftTypes.AssetState st = _assets[asset].state;
        if (
            st == CorpShiftTypes.AssetState.ACTION_PENDING || st == CorpShiftTypes.AssetState.ADJUSTING
                || st == CorpShiftTypes.AssetState.MIGRATING || (st == CorpShiftTypes.AssetState.HALTED && liftedHalt)
        ) {
            _transition(asset, CorpShiftTypes.AssetState.ACTIVE, actionId);
        }

        emit CorporateActionInvalidated(actionId, asset, reason);
    }

    /// @notice Governance reconciliation for DEGRADED assets.
    /// @dev    Callable once the operator has established the true onchain
    ///         state — e.g. after re-running reconciliation offchain.
    function reconcileAsset(address asset) external onlyOwner {
        CorpShiftTypes.AssetRecord storage rec = _assets[asset];
        if (!rec.exists) revert AssetNotRegistered(asset);
        if (rec.state == CorpShiftTypes.AssetState.DEGRADED) {
            uint256 factor = IAssetAdapter(rec.adapter).normalizationFactor(asset);
            rec.lastVerifiedFactor = factor;
            _transition(asset, CorpShiftTypes.AssetState.ACTIVE, bytes32(0));
            emit NormalizationVerified(asset, factor, bytes32(0));
        }
    }

    /*//////////////////////////////////////////////////////////////
                          STATE MACHINE INTERNALS
    //////////////////////////////////////////////////////////////*/

    /// @dev Enforce the transition table + universal recovery transitions.
    function _transition(address asset, CorpShiftTypes.AssetState to, bytes32 actionId) internal {
        CorpShiftTypes.AssetRecord storage rec = _assets[asset];
        CorpShiftTypes.AssetState from = rec.state;
        if (from == to) return;

        bool legal = (_legalTransitions[uint8(from)] >> uint8(to)) & 1 == 1;
        // Universal recovery: any non-terminal state may be flagged DEGRADED
        // or UNSUPPORTED — being able to say "we don't know" must never be
        // blocked by the machine.
        if (!legal && (to == CorpShiftTypes.AssetState.DEGRADED || to == CorpShiftTypes.AssetState.UNSUPPORTED)) {
            legal = true;
        }
        if (!legal) revert IllegalTransition(from, to);

        rec.state = to;
        emit AssetStateChanged(asset, from, to, actionId);
    }

    function _flagDegraded(address asset, bytes32 actionId) internal {
        if (_assets[asset].exists) {
            _transition(asset, CorpShiftTypes.AssetState.DEGRADED, actionId);
        }
    }

    /// @dev Resolve the in-force halt record for an asset, if any.
    function _resolveHalt(address asset) internal {
        bytes32 haltId = activeHaltAction[asset];
        if (haltId == bytes32(0)) return;
        CorpShiftTypes.ActionRecord storage halt = _actions[haltId];
        if (halt.status == CorpShiftTypes.ActionStatus.ACTIVE) {
            halt.status = CorpShiftTypes.ActionStatus.RESOLVED;
            emit CorporateActionResolved(haltId, asset);
        }
        activeHaltAction[asset] = bytes32(0);
    }

    /// @dev Decode the expected post-action multiplier from params.
    ///      Multiplier-bearing params end with a uint256 expectedMultiplier
    ///      (0 = informational action, no reconciliation expectation).
    function _expectedMultiplier(CorpShiftTypes.ActionRecord storage rec) internal view returns (uint256) {
        return _lastWord(rec.params);
    }

    /// @dev Read the last 32-byte word of an ABI blob (0 when empty/short).
    function _lastWord(bytes memory p) internal pure returns (uint256 word) {
        if (p.length < 32) return 0;
        assembly ("memory-safe") {
            word := mload(add(p, mload(p)))
        }
    }

    /*//////////////////////////////////////////////////////////////
                        CONSUMER READ SURFACE
    //////////////////////////////////////////////////////////////*/

    /// @dev Revert on unregistered assets for adapter-backed reads —
    ///      guessing a normalization for an unknown asset is exactly the
    ///      class of silent error CorpShift exists to eliminate.
    function _requireRegistered(address asset) internal view {
        if (!_assets[asset].exists) revert AssetNotRegistered(asset);
    }

    /// @inheritdoc ICorpShift
    function economicBalanceOf(address asset, address account) external view returns (uint256) {
        _requireRegistered(asset);
        return IAssetAdapter(_assets[asset].adapter).economicUnitsOf(asset, account);
    }

    /// @inheritdoc ICorpShift
    function economicExposureOf(address asset, address account)
        external
        view
        returns (CorpShiftTypes.EconomicExposure memory exposure)
    {
        _requireRegistered(asset);
        CorpShiftTypes.AssetRecord storage rec = _assets[asset];
        exposure.units = IAssetAdapter(rec.adapter).economicUnitsOf(asset, account);
        exposure.normalizationFactor = IAssetAdapter(rec.adapter).normalizationFactor(asset);
        exposure.verifiedFactor = rec.lastVerifiedFactor;
        exposure.state = rec.state;
        exposure.pendingActionId = rec.pendingActionId;
    }

    /// @inheritdoc ICorpShift
    function economicUnitsOfAmount(address asset, uint256 amount) external view returns (uint256) {
        _requireRegistered(asset);
        return IAssetAdapter(_assets[asset].adapter).economicUnitsOfAmount(asset, amount);
    }

    /// @inheritdoc ICorpShift
    function normalizationFactor(address asset) external view returns (uint256) {
        _requireRegistered(asset);
        return IAssetAdapter(_assets[asset].adapter).normalizationFactor(asset);
    }

    /// @inheritdoc ICorpShift
    function verifiedNormalizationFactor(address asset) external view returns (uint256) {
        return _assets[asset].lastVerifiedFactor;
    }

    /// @inheritdoc ICorpShift
    function assetRuntimeState(address asset) external view returns (CorpShiftTypes.AssetState) {
        return _assets[asset].state;
    }

    /// @inheritdoc ICorpShift
    function pendingCorporateAction(address asset) external view returns (bytes32) {
        return _assets[asset].pendingActionId;
    }

    /// @inheritdoc ICorpShift
    function getAction(bytes32 actionId) external view returns (CorpShiftTypes.ActionRecord memory) {
        return _actions[actionId];
    }

    /// @inheritdoc ICorpShift
    function getActionHistory(address asset) external view returns (bytes32[] memory) {
        return _assetActionIds[asset];
    }

    /// @notice Adapter address for `asset` (zero if unregistered).
    function adapterOf(address asset) external view returns (address) {
        return _assets[asset].adapter;
    }

    /// @notice Full asset record for `asset`.
    function getAsset(address asset) external view returns (CorpShiftTypes.AssetRecord memory) {
        return _assets[asset];
    }

    /// @notice Number of registered assets.
    function assetCount() external view returns (uint256) {
        return assetList.length;
    }

    /// @notice Registered asset at `index` (enumeration).
    function assetAt(uint256 index) external view returns (address) {
        return assetList[index];
    }

    /// @notice EIP-712 domain separator (for offchain signature tooling).
    function domainSeparator() external view returns (bytes32) {
        return AttestationLib.domainSeparator();
    }

    /// @notice Compute the digest a signer must sign for `payload`.
    function attestDigest(CorpShiftTypes.ActionPayload calldata payload) external view returns (bytes32) {
        return AttestationLib.digest(payload);
    }

    /*//////////////////////////////////////////////////////////////
                            POLICY QUERIES
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc ICorpShift
    function checkPolicy(address asset, CorpShiftTypes.PolicyOp op) public view returns (bool allowed, bytes32 reason) {
        CorpShiftTypes.AssetRecord storage rec = _assets[asset];
        if (!rec.exists) return (false, bytes32("UNREGISTERED"));
        return policyEngine.evaluate(rec.state, op);
    }

    /// @inheritdoc ICorpShift
    function canUseAsCollateral(address asset) external view returns (bool) {
        (bool ok,) = checkPolicy(asset, CorpShiftTypes.PolicyOp.USE_AS_COLLATERAL);
        return ok;
    }

    /// @inheritdoc ICorpShift
    function canTransferSafely(address asset) external view returns (bool) {
        (bool ok,) = checkPolicy(asset, CorpShiftTypes.PolicyOp.TRANSFER);
        return ok;
    }

    /// @inheritdoc ICorpShift
    function canSettle(address asset) external view returns (bool) {
        (bool ok,) = checkPolicy(asset, CorpShiftTypes.PolicyOp.SETTLE);
        return ok;
    }
}
