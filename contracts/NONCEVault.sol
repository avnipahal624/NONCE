// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title NONCEVault
 * @notice Self-custodial ETH vault with timelocked, guardian-gated policy
 *         changes, reservation-based rolling withdrawal limits, monitor freeze
 *         and guardian-initiated recovery.
 *
 *         SECURITY STATUS: unaudited reference implementation. It has not been
 *         deployed from this repository and must not hold real value without an
 *         independent audit, invariant testing and a rehearsed deployment.
 *
 *         Enforced properties:
 *         - No withdrawal can execute while frozen.
 *         - Every withdrawal has a non-zero delay.
 *         - Requests reserve both balance and rolling-window allowance.
 *         - A compromised owner cannot weaken limits, delays, allowlisting,
 *           guardian quorum or guardian membership without 2-of-3 guardian
 *           approvals and an immutable minimum timelock.
 *         - Guardians can initiate recovery without the owner.
 *         - Recovery changes the epoch, invalidating old withdrawals,
 *           approvals, policy proposals and rotation proposals.
 *         - The monitor can freeze only. It can never move funds, unfreeze,
 *           change policy, rotate guardians or approve recovery.
 */
contract NONCEVault {
    /* ------------------------------------------------------------------ */
    /*                              ERRORS                                */
    /* ------------------------------------------------------------------ */

    error NotOwner();
    error NotMonitor();
    error NotGuardian();
    error NotAuthorised();
    error Frozen();
    error NotFrozen();
    error RecoveryActive();
    error ProposalActive();
    error NoProposal();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidPolicy();
    error ExceedsLimit();
    error RollingLimitExceeded();
    error RollingWindowFull();
    error InsufficientBalance();
    error InsufficientReservation();
    error RecipientNotAllowed();
    error UnknownWithdrawal();
    error AlreadyFinalised();
    error DelayActive();
    error WithdrawalExpired();
    error ApprovalIncomplete();
    error AlreadyApproved();
    error NoRecovery();
    error RecoveryDelayActive();
    error ProposalExpired();
    error Reentrancy();
    error TransferFailed();

    /* ------------------------------------------------------------------ */
    /*                             CONSTANTS                              */
    /* ------------------------------------------------------------------ */

    uint8 public constant GUARDIAN_COUNT = 3;
    uint8 public constant GUARDIAN_THRESHOLD = 2;

    /// @notice Immutable lower bounds. No policy update can reduce these.
    uint64 public constant MIN_POLICY_DELAY = 1 days;
    uint64 public constant MIN_RECOVERY_DELAY = 2 days;
    uint64 public constant MIN_WITHDRAWAL_DELAY = 10 minutes;
    uint64 public constant SMALL_WITHDRAWAL_DELAY = 10 minutes;
    uint64 public constant MAX_WITHDRAWAL_DELAY = 30 days;
    uint64 public constant MAX_RECOVERY_DELAY = 90 days;
    uint64 public constant MAX_POLICY_DELAY = 30 days;

    /// @notice Rolling spend window and the gas-bounded reservation ring.
    uint64 public constant ROLLING_WINDOW = 24 hours;
    uint16 public constant MAX_CHARGES = 64;

    /// @notice A queued withdrawal that is not executed in time expires.
    uint64 public constant WITHDRAWAL_EXPIRY = 7 days;

    /// @notice Policy proposals can be executed for this long after their ETA.
    uint64 public constant PROPOSAL_EXECUTION_WINDOW = 7 days;

    /* ------------------------------------------------------------------ */
    /*                              STORAGE                               */
    /* ------------------------------------------------------------------ */

    address public owner;
    address public immutable monitor;
    address[3] public guardians;

    /// @dev Two independent freeze sources so cancelling recovery does not
    ///      silently clear a monitor freeze (and vice versa).
    bool public monitorFrozen;
    bool public recoveryFrozen;

    uint256 public epoch;

    struct Policy {
        uint256 perTransactionLimit;
        uint256 largeWithdrawalThreshold;
        uint256 rollingLimit;
        uint64 withdrawalDelay;
        bool allowlistOnly;
    }

    Policy private _policy;
    uint64 public immutable policyDelay;
    uint64 public immutable recoveryDelay;

    mapping(address => bool) public allowlisted;
    uint256 public allowlistCount;

    /* ------------------------------ withdrawals ----------------------- */

    struct Withdrawal {
        address payable recipient;
        uint256 amount;
        uint64 executeAfter;
        uint64 expiresAt;
        uint256 epoch;
        uint8 approvals;
        bool requiresGuardians;
        bool cancelled;
        bool executed;
    }

    uint256 public withdrawalCount;
    mapping(uint256 => Withdrawal) public withdrawals;
    mapping(uint256 => mapping(address => bool)) public withdrawalApprovedBy;

    struct Charge {
        uint64 timestamp;
        uint96 amount;
        uint256 withdrawalId;
    }

    Charge[64] private _charges;
    uint16 private _chargeCursor;
    /// @dev withdrawal id => charge slot + 1. Zero means no live reservation.
    mapping(uint256 => uint16) private _withdrawalCharge;
    uint256 public reservedBalance;

    /* --------------------------- policy proposals --------------------- */

    struct PolicyProposal {
        Policy proposed;
        uint64 createdAt;
        uint64 executeAfter;
        uint8 approvals;
        bool weakening;
        bool active;
        uint256 nonce;
        address proposer;
    }

    PolicyProposal private _policyProposal;
    uint256 public policyNonce;
    mapping(uint256 => mapping(address => bool)) private _policyApprovals;

    /* ------------------------- allowlist proposals -------------------- */

    struct AllowlistProposal {
        address account;
        uint64 executeAfter;
        uint8 approvals;
        bool active;
        uint256 nonce;
    }

    AllowlistProposal private _allowlistProposal;
    uint256 public allowlistNonce;
    mapping(uint256 => mapping(address => bool)) private _allowlistApprovals;

    /* ------------------------- guardian rotation ---------------------- */

    struct GuardianProposal {
        uint8 index;
        address newGuardian;
        uint64 executeAfter;
        uint8 approvals;
        bool active;
        uint256 nonce;
    }

    GuardianProposal private _guardianProposal;
    uint256 public guardianNonce;
    mapping(uint256 => mapping(address => bool)) private _guardianApprovals;

    /* ------------------------------ recovery -------------------------- */

    struct Recovery {
        address proposedOwner;
        address proposer;
        uint64 executeAfter;
        uint8 approvals;
        uint8 cancelApprovals;
        bool active;
        bool ownerInitiated;
        uint256 nonce;
    }

    Recovery private _recovery;
    uint256 public recoveryNonce;
    mapping(uint256 => mapping(address => bool)) private _recoveryApprovals;
    mapping(uint256 => mapping(address => bool)) private _recoveryCancelApprovals;

    /* ---------------------------- restoration ------------------------- */

    struct Restoration {
        address proposer;
        uint64 executeAfter;
        uint8 approvals;
        uint8 cancelApprovals;
        bool active;
        bool ownerInitiated;
        uint256 nonce;
    }

    Restoration private _restoration;
    uint256 public restorationNonce;
    mapping(uint256 => mapping(address => bool)) private _restorationApprovals;
    mapping(uint256 => mapping(address => bool)) private _restorationCancelApprovals;

    uint256 private _entered = 1;

    /* ------------------------------------------------------------------ */
    /*                               EVENTS                               */
    /* ------------------------------------------------------------------ */

    event Deposited(address indexed from, uint256 amount);
    event WithdrawalQueued(
        uint256 indexed id,
        address indexed recipient,
        uint256 amount,
        uint64 executeAfter,
        bool requiresGuardians,
        uint256 rollingSpent
    );
    event WithdrawalApproved(uint256 indexed id, address indexed guardian, uint8 approvals);
    event WithdrawalCancelled(uint256 indexed id, address indexed by);
    event WithdrawalExpiredCleanup(uint256 indexed id, address indexed by);
    event WithdrawalExecuted(uint256 indexed id, address indexed recipient, uint256 amount);

    event PolicyProposed(
        uint256 indexed nonce,
        address indexed proposer,
        uint256 perTransactionLimit,
        uint256 largeThreshold,
        uint256 rollingLimit,
        uint64 withdrawalDelay,
        bool allowlistOnly,
        bool weakening,
        uint64 executeAfter
    );
    event PolicyApproved(uint256 indexed nonce, address indexed guardian, uint8 approvals);
    event PolicyCancelled(uint256 indexed nonce);
    event PolicyExecuted(
        uint256 indexed nonce,
        uint256 perTransactionLimit,
        uint256 largeThreshold,
        uint256 rollingLimit,
        uint64 withdrawalDelay,
        bool allowlistOnly
    );

    event Allowlisted(address indexed account, bool allowed);
    event AllowlistRemovalProposed(uint256 indexed nonce, address indexed account, uint64 executeAfter);
    event AllowlistRemovalApproved(uint256 indexed nonce, address indexed guardian, uint8 approvals);
    event AllowlistRemovalCancelled(uint256 indexed nonce);
    event AllowlistRemovalExecuted(uint256 indexed nonce, address indexed account);

    event GuardianRotationProposed(
        uint256 indexed nonce,
        uint8 indexed index,
        address indexed newGuardian,
        uint64 executeAfter
    );
    event GuardianRotationApproved(uint256 indexed nonce, address indexed guardian, uint8 approvals);
    event GuardianRotationCancelled(uint256 indexed nonce);
    event GuardianRotationExecuted(uint256 indexed nonce, uint8 index, address oldGuardian, address newGuardian);

    event MonitorFreeze(address indexed by);
    event RecoveryProposed(
        uint256 indexed nonce,
        address indexed proposer,
        address indexed proposedOwner,
        bool ownerInitiated,
        uint64 executeAfter
    );
    event RecoveryApproved(uint256 indexed nonce, address indexed guardian, uint8 approvals);
    event RecoveryCancelApproved(uint256 indexed nonce, address indexed guardian, uint8 approvals);
    event RecoveryCancelled(uint256 indexed nonce, address indexed by);
    event RecoveryExecuted(address indexed previousOwner, address indexed newOwner, uint256 indexed newEpoch);

    event RestorationProposed(uint256 indexed nonce, address indexed proposer, uint64 executeAfter);
    event RestorationApproved(uint256 indexed nonce, address indexed guardian, uint8 approvals);
    event RestorationCancelled(uint256 indexed nonce, address indexed by);
    event RestorationExecuted(uint256 indexed nonce);

    /* ------------------------------------------------------------------ */
    /*                             MODIFIERS                              */
    /* ------------------------------------------------------------------ */

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_entered != 1) revert Reentrancy();
        _entered = 2;
        _;
        _entered = 1;
    }

    /* ------------------------------------------------------------------ */
    /*                            CONSTRUCTION                            */
    /* ------------------------------------------------------------------ */

    constructor(
        address initialOwner,
        address monitor_,
        address[3] memory guardians_,
        uint256 perTransactionLimit_,
        uint256 largeWithdrawalThreshold_,
        uint256 rollingLimit_,
        uint64 withdrawalDelay_,
        uint64 recoveryDelay_,
        uint64 policyDelay_
    ) {
        if (initialOwner == address(0) || monitor_ == address(0)) revert InvalidAddress();
        if (perTransactionLimit_ == 0 || largeWithdrawalThreshold_ == 0) revert InvalidPolicy();
        if (largeWithdrawalThreshold_ > perTransactionLimit_) revert InvalidPolicy();
        if (rollingLimit_ < perTransactionLimit_) revert InvalidPolicy();
        if (rollingLimit_ > type(uint96).max) revert InvalidPolicy();
        if (withdrawalDelay_ < MIN_WITHDRAWAL_DELAY || withdrawalDelay_ > MAX_WITHDRAWAL_DELAY) {
            revert InvalidPolicy();
        }
        if (recoveryDelay_ < MIN_RECOVERY_DELAY || recoveryDelay_ > MAX_RECOVERY_DELAY) {
            revert InvalidPolicy();
        }
        if (policyDelay_ < MIN_POLICY_DELAY || policyDelay_ > MAX_POLICY_DELAY) {
            revert InvalidPolicy();
        }

        for (uint8 i = 0; i < GUARDIAN_COUNT; i++) {
            address guardian = guardians_[i];
            if (guardian == address(0) || guardian == initialOwner || guardian == monitor_) {
                revert InvalidAddress();
            }
            for (uint8 j = 0; j < i; j++) {
                if (guardians_[j] == guardian) revert InvalidAddress();
            }
        }

        owner = initialOwner;
        monitor = monitor_;
        guardians = guardians_;
        _policy = Policy({
            perTransactionLimit: perTransactionLimit_,
            largeWithdrawalThreshold: largeWithdrawalThreshold_,
            rollingLimit: rollingLimit_,
            withdrawalDelay: withdrawalDelay_,
            allowlistOnly: false
        });
        recoveryDelay = recoveryDelay_;
        policyDelay = policyDelay_;
        epoch = 1;
    }

    /* ------------------------------------------------------------------ */
    /*                              RECEIVE                               */
    /* ------------------------------------------------------------------ */

    /// @notice Deposits are allowed while frozen: a freeze blocks exits, not
    ///         the owner's ability to add collateral or pay recovery costs.
    receive() external payable {
        if (msg.value == 0) revert InvalidAmount();
        emit Deposited(msg.sender, msg.value);
    }

    /* ------------------------------------------------------------------ */
    /*                           WITHDRAWALS                              */
    /* ------------------------------------------------------------------ */

    /**
     * @notice Queue a withdrawal and reserve its balance and rolling-window
     *         allowance immediately. No withdrawal is immediate.
     *
     *         Guardian approval is required when the request is at or above
     *         the large threshold, or when cumulative spending in the rolling
     *         window plus this request reaches that threshold. This prevents a
     *         stolen key from splitting one large transfer into dust.
     */
    function requestWithdrawal(
        uint256 amount,
        address payable recipient
    ) external onlyOwner nonReentrant returns (uint256 id) {
        if (frozen()) revert Frozen();
        if (recipient == address(0)) revert InvalidAddress();
        if (amount == 0 || amount > type(uint96).max) revert InvalidAmount();
        if (amount > _policy.perTransactionLimit) revert ExceedsLimit();
        if (_policy.allowlistOnly && !allowlisted[recipient]) revert RecipientNotAllowed();

        uint256 spent = _rollingSpent();
        bool requiresGuardians = amount >= _policy.largeWithdrawalThreshold ||
            spent + amount >= _policy.largeWithdrawalThreshold;

        uint64 delay = requiresGuardians ? _policy.withdrawalDelay : SMALL_WITHDRAWAL_DELAY;
        uint64 executeAfter = uint64(block.timestamp) + delay;
        uint64 expiresAt = executeAfter + WITHDRAWAL_EXPIRY;

        id = ++withdrawalCount;
        withdrawals[id] = Withdrawal({
            recipient: recipient,
            amount: amount,
            executeAfter: executeAfter,
            expiresAt: expiresAt,
            epoch: epoch,
            approvals: 0,
            requiresGuardians: requiresGuardians,
            cancelled: false,
            executed: false
        });

        _reserve(id, amount);

        emit WithdrawalQueued(id, recipient, amount, executeAfter, requiresGuardians, spent + amount);
    }

    function approveWithdrawal(uint256 id) external {
        if (!_isGuardian(msg.sender)) revert NotGuardian();
        Withdrawal storage request = withdrawals[id];
        if (request.recipient == address(0)) revert UnknownWithdrawal();
        if (request.executed || request.cancelled) revert AlreadyFinalised();
        if (request.epoch != epoch) revert AlreadyFinalised();
        if (block.timestamp > request.expiresAt) revert WithdrawalExpired();
        if (!request.requiresGuardians) revert ApprovalIncomplete();
        if (withdrawalApprovedBy[id][msg.sender]) revert AlreadyApproved();

        withdrawalApprovedBy[id][msg.sender] = true;
        request.approvals += 1;
        emit WithdrawalApproved(id, msg.sender, request.approvals);
    }

    /// @notice Cancelling releases both the reserved balance and the rolling
    ///         allowance immediately. Allowed while frozen.
    function cancelWithdrawal(uint256 id) external onlyOwner {
        Withdrawal storage request = withdrawals[id];
        if (request.recipient == address(0)) revert UnknownWithdrawal();
        if (request.executed || request.cancelled) revert AlreadyFinalised();

        request.cancelled = true;
        _releaseReservation(id, request.amount, true);
        emit WithdrawalCancelled(id, msg.sender);
    }

    /// @notice Permissionless cleanup after expiry. Releases the reservation
    ///         so abandoned requests cannot lock the vault forever.
    function cancelExpired(uint256 id) external {
        Withdrawal storage request = withdrawals[id];
        if (request.recipient == address(0)) revert UnknownWithdrawal();
        if (request.executed || request.cancelled) revert AlreadyFinalised();
        if (block.timestamp <= request.expiresAt) revert DelayActive();

        request.cancelled = true;
        _releaseReservation(id, request.amount, true);
        emit WithdrawalExpiredCleanup(id, msg.sender);
    }

    function executeWithdrawal(uint256 id) external nonReentrant {
        Withdrawal storage request = withdrawals[id];
        if (request.recipient == address(0)) revert UnknownWithdrawal();
        if (request.executed || request.cancelled) revert AlreadyFinalised();
        if (frozen()) revert Frozen();
        if (request.epoch != epoch) revert AlreadyFinalised();
        if (block.timestamp < request.executeAfter) revert DelayActive();
        if (block.timestamp > request.expiresAt) revert WithdrawalExpired();
        if (request.requiresGuardians && request.approvals < GUARDIAN_THRESHOLD) {
            revert ApprovalIncomplete();
        }
        if (address(this).balance < request.amount) revert InsufficientBalance();

        // Consume the balance reservation but keep the rolling charge. Timestamp
        // it at execution so the 24-hour window measures actual spend, not how
        // long the request sat in the queue.
        request.executed = true;
        uint16 chargeSlotPlusOne = _withdrawalCharge[id];
        if (chargeSlotPlusOne != 0) {
            Charge storage executedCharge = _charges[chargeSlotPlusOne - 1];
            if (executedCharge.withdrawalId == id) {
                executedCharge.timestamp = uint64(block.timestamp);
            }
        }
        _releaseReservation(id, request.amount, false);

        (bool sent, ) = request.recipient.call{value: request.amount}("");
        if (!sent) revert TransferFailed();

        emit WithdrawalExecuted(id, request.recipient, request.amount);
    }

    function _reserve(uint256 id, uint256 amount) internal {
        if (_rollingSpent() + amount > _policy.rollingLimit) revert RollingLimitExceeded();
        if (reservedBalance + amount > address(this).balance) revert InsufficientBalance();

        uint16 slot = _freeChargeSlot();
        _charges[slot] = Charge({
            timestamp: uint64(block.timestamp),
            amount: uint96(amount),
            withdrawalId: id
        });
        _withdrawalCharge[id] = slot + 1;
        reservedBalance += amount;
        _chargeCursor = slot + 1 >= MAX_CHARGES ? 0 : slot + 1;
    }

    /// @dev Linear scan over a maximum of 64 slots: gas-bounded by design.
    ///      A pending reservation's slot is never reused, even after its
    ///      request-time charge would have aged out, because the request is
    ///      still executable. Only zeroed (cancelled/expired) or executed
    ///      charges older than the window are free.
    function _freeChargeSlot() internal view returns (uint16) {
        for (uint16 offset = 0; offset < MAX_CHARGES; offset++) {
            uint16 index = uint16((_chargeCursor + offset) % MAX_CHARGES);
            Charge storage charge = _charges[index];
            if (charge.amount == 0) return index;
            if (
                withdrawals[charge.withdrawalId].executed &&
                uint256(charge.timestamp) + ROLLING_WINDOW <= block.timestamp
            ) {
                return index;
            }
        }
        revert RollingWindowFull();
    }

    function _releaseReservation(uint256 id, uint256 amount, bool clearRollingCharge) internal {
        uint16 slotPlusOne = _withdrawalCharge[id];
        if (slotPlusOne == 0) return;
        delete _withdrawalCharge[id];

        if (reservedBalance >= amount) {
            reservedBalance -= amount;
        } else {
            reservedBalance = 0;
        }

        Charge storage charge = _charges[slotPlusOne - 1];
        if (charge.withdrawalId == id && clearRollingCharge) {
            charge.amount = 0;
        }
    }

    /// @dev Pending requests reserve budget for as long as they remain
    ///      executable. Executed spend counts for 24 hours from execution.
    ///      Counting only request-time age would let an old pending request
    ///      execute after its charge expired while new requests reused the
    ///      same allowance.
    function _rollingSpent() internal view returns (uint256 spent) {
        for (uint16 i = 0; i < MAX_CHARGES; i++) {
            Charge storage charge = _charges[i];
            if (charge.amount == 0) continue;
            if (!withdrawals[charge.withdrawalId].executed) {
                spent += charge.amount;
            } else if (
                uint256(charge.timestamp) + ROLLING_WINDOW > block.timestamp
            ) {
                spent += charge.amount;
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /*                              POLICY                                */
    /* ------------------------------------------------------------------ */

    /**
     * @notice Every policy change is proposed and timelocked. Weakening
     *         changes additionally require two guardian approvals. There is
     *         no owner-only path to change limits, delays or allowlisting.
     */
    function proposePolicy(Policy calldata next) external onlyOwner returns (uint256 nonce) {
        if (frozen()) revert Frozen();
        if (_policyProposal.active) revert ProposalActive();
        _validatePolicy(next);

        bool weakening = _isWeakening(next);
        nonce = ++policyNonce;
        _policyProposal = PolicyProposal({
            proposed: next,
            createdAt: uint64(block.timestamp),
            executeAfter: uint64(block.timestamp) + policyDelay,
            approvals: 0,
            weakening: weakening,
            active: true,
            nonce: nonce,
            proposer: msg.sender
        });

        emit PolicyProposed(
            nonce,
            msg.sender,
            next.perTransactionLimit,
            next.largeWithdrawalThreshold,
            next.rollingLimit,
            next.withdrawalDelay,
            next.allowlistOnly,
            weakening,
            _policyProposal.executeAfter
        );
    }

    function approvePolicy() external {
        if (!_isGuardian(msg.sender)) revert NotGuardian();
        PolicyProposal storage proposal = _policyProposal;
        if (!proposal.active) revert NoProposal();
        if (_policyApprovals[proposal.nonce][msg.sender]) revert AlreadyApproved();

        _policyApprovals[proposal.nonce][msg.sender] = true;
        proposal.approvals += 1;
        emit PolicyApproved(proposal.nonce, msg.sender, proposal.approvals);
    }

    function cancelPolicy() external onlyOwner {
        if (!_policyProposal.active) revert NoProposal();
        _policyProposal.active = false;
        emit PolicyCancelled(_policyProposal.nonce);
    }

    function executePolicy() external onlyOwner {
        if (frozen()) revert Frozen();
        PolicyProposal storage proposal = _policyProposal;
        if (!proposal.active) revert NoProposal();
        if (block.timestamp < proposal.executeAfter) revert DelayActive();
        if (block.timestamp > uint256(proposal.executeAfter) + PROPOSAL_EXECUTION_WINDOW) {
            revert ProposalExpired();
        }
        if (proposal.weakening && proposal.approvals < GUARDIAN_THRESHOLD) {
            revert ApprovalIncomplete();
        }

        _validatePolicy(proposal.proposed);
        _policy = proposal.proposed;
        proposal.active = false;

        emit PolicyExecuted(
            proposal.nonce,
            _policy.perTransactionLimit,
            _policy.largeWithdrawalThreshold,
            _policy.rollingLimit,
            _policy.withdrawalDelay,
            _policy.allowlistOnly
        );
    }

    function _validatePolicy(Policy memory next) internal view {
        if (
            next.perTransactionLimit == 0 ||
            next.largeWithdrawalThreshold == 0 ||
            next.largeWithdrawalThreshold > next.perTransactionLimit ||
            next.rollingLimit < next.perTransactionLimit ||
            next.rollingLimit > type(uint96).max ||
            next.withdrawalDelay < MIN_WITHDRAWAL_DELAY ||
            next.withdrawalDelay > MAX_WITHDRAWAL_DELAY
        ) {
            revert InvalidPolicy();
        }
        if (next.allowlistOnly && allowlistCount == 0) revert InvalidPolicy();
    }

    /**
     * @dev Conservative field-by-field classification. Mixing a strengthening
     *      change with one weakening field still requires guardian approval.
     */
    function _isWeakening(Policy calldata next) internal view returns (bool) {
        Policy storage current = _policy;
        return
            next.perTransactionLimit > current.perTransactionLimit ||
            next.largeWithdrawalThreshold > current.largeWithdrawalThreshold ||
            next.rollingLimit > current.rollingLimit ||
            next.withdrawalDelay < current.withdrawalDelay ||
            (current.allowlistOnly && !next.allowlistOnly);
    }

    /**
     * @notice Adding a recipient is strengthening and immediate. Removing one
     *         is weakening and must use proposeAllowlistRemoval.
     */
    function setAllowlisted(address account, bool allowed) external onlyOwner {
        if (frozen()) revert Frozen();
        if (account == address(0)) revert InvalidAddress();
        if (!allowed) revert InvalidPolicy();
        if (!allowlisted[account]) {
            allowlisted[account] = true;
            allowlistCount += 1;
            emit Allowlisted(account, true);
        }
    }

    function proposeAllowlistRemoval(address account) external onlyOwner returns (uint256 nonce) {
        if (frozen()) revert Frozen();
        if (_allowlistProposal.active) revert ProposalActive();
        if (!allowlisted[account]) revert InvalidAddress();

        nonce = ++allowlistNonce;
        _allowlistProposal = AllowlistProposal({
            account: account,
            executeAfter: uint64(block.timestamp) + policyDelay,
            approvals: 0,
            active: true,
            nonce: nonce
        });
        emit AllowlistRemovalProposed(nonce, account, _allowlistProposal.executeAfter);
    }

    function approveAllowlistRemoval() external {
        if (!_isGuardian(msg.sender)) revert NotGuardian();
        AllowlistProposal storage proposal = _allowlistProposal;
        if (!proposal.active) revert NoProposal();
        if (_allowlistApprovals[proposal.nonce][msg.sender]) revert AlreadyApproved();

        _allowlistApprovals[proposal.nonce][msg.sender] = true;
        proposal.approvals += 1;
        emit AllowlistRemovalApproved(proposal.nonce, msg.sender, proposal.approvals);
    }

    function cancelAllowlistRemoval() external onlyOwner {
        if (!_allowlistProposal.active) revert NoProposal();
        _allowlistProposal.active = false;
        emit AllowlistRemovalCancelled(_allowlistProposal.nonce);
    }

    function executeAllowlistRemoval() external onlyOwner {
        if (frozen()) revert Frozen();
        AllowlistProposal storage proposal = _allowlistProposal;
        if (!proposal.active) revert NoProposal();
        if (block.timestamp < proposal.executeAfter) revert DelayActive();
        if (block.timestamp > uint256(proposal.executeAfter) + PROPOSAL_EXECUTION_WINDOW) {
            revert ProposalExpired();
        }
        if (proposal.approvals < GUARDIAN_THRESHOLD) revert ApprovalIncomplete();
        if (_policy.allowlistOnly && allowlistCount <= 1) revert InvalidPolicy();

        allowlisted[proposal.account] = false;
        allowlistCount -= 1;
        proposal.active = false;
        emit AllowlistRemovalExecuted(proposal.nonce, proposal.account);
    }

    /* ------------------------------------------------------------------ */
    /*                          GUARDIAN ROTATION                         */
    /* ------------------------------------------------------------------ */

    function proposeGuardianRotation(
        uint8 index,
        address newGuardian
    ) external onlyOwner returns (uint256 nonce) {
        if (frozen()) revert Frozen();
        if (_guardianProposal.active) revert ProposalActive();
        if (index >= GUARDIAN_COUNT) revert InvalidAddress();
        _validateNewGuardian(newGuardian);

        nonce = ++guardianNonce;
        _guardianProposal = GuardianProposal({
            index: index,
            newGuardian: newGuardian,
            executeAfter: uint64(block.timestamp) + policyDelay,
            approvals: 0,
            active: true,
            nonce: nonce
        });
        emit GuardianRotationProposed(nonce, index, newGuardian, _guardianProposal.executeAfter);
    }

    function approveGuardianRotation() external {
        if (!_isGuardian(msg.sender)) revert NotGuardian();
        GuardianProposal storage proposal = _guardianProposal;
        if (!proposal.active) revert NoProposal();
        if (_guardianApprovals[proposal.nonce][msg.sender]) revert AlreadyApproved();

        _guardianApprovals[proposal.nonce][msg.sender] = true;
        proposal.approvals += 1;
        emit GuardianRotationApproved(proposal.nonce, msg.sender, proposal.approvals);
    }

    function cancelGuardianRotation() external onlyOwner {
        if (!_guardianProposal.active) revert NoProposal();
        _guardianProposal.active = false;
        emit GuardianRotationCancelled(_guardianProposal.nonce);
    }

    function executeGuardianRotation() external onlyOwner {
        if (frozen()) revert Frozen();
        GuardianProposal storage proposal = _guardianProposal;
        if (!proposal.active) revert NoProposal();
        if (block.timestamp < proposal.executeAfter) revert DelayActive();
        if (block.timestamp > uint256(proposal.executeAfter) + PROPOSAL_EXECUTION_WINDOW) {
            revert ProposalExpired();
        }
        if (proposal.approvals < GUARDIAN_THRESHOLD) revert ApprovalIncomplete();
        _validateNewGuardian(proposal.newGuardian);

        address previous = guardians[proposal.index];
        guardians[proposal.index] = proposal.newGuardian;
        proposal.active = false;
        emit GuardianRotationExecuted(proposal.nonce, proposal.index, previous, proposal.newGuardian);
    }

    function _validateNewGuardian(address candidate) internal view {
        if (
            candidate == address(0) ||
            candidate == owner ||
            candidate == monitor ||
            _isGuardian(candidate)
        ) {
            revert InvalidAddress();
        }
    }

    /* ------------------------------------------------------------------ */
    /*                              FREEZE                                */
    /* ------------------------------------------------------------------ */

    /// @notice Monitor (or the owner as a panic button) can freeze. Repeated
    ///         calls are safe no-ops, so a retry after an ambiguous receipt
    ///         cannot revert the pipeline.
    function freeze() external {
        if (msg.sender != monitor && msg.sender != owner) revert NotMonitor();
        if (monitorFrozen) return;
        monitorFrozen = true;
        emit MonitorFreeze(msg.sender);
    }

    function frozen() public view returns (bool) {
        return monitorFrozen || recoveryFrozen;
    }

    /* ------------------------------------------------------------------ */
    /*                             RECOVERY                               */
    /* ------------------------------------------------------------------ */

    /**
     * @notice Guardian-initiated recovery. The owner may also propose while
     *         still in control. A proposal freezes exits immediately.
     *
     *         Owner cancellation is only possible for owner-initiated
     *         proposals. A compromised owner therefore cannot veto recovery
     *         initiated by the guardians; two guardians can cancel a bad
     *         guardian proposal.
     */
    function proposeRecovery(address newOwner) external returns (uint256 nonce) {
        bool ownerInitiated = msg.sender == owner;
        if (!ownerInitiated && !_isGuardian(msg.sender)) revert NotAuthorised();
        if (_recovery.active) revert RecoveryActive();
        if (
            newOwner == address(0) ||
            newOwner == owner ||
            newOwner == monitor ||
            _isGuardian(newOwner) ||
            newOwner == msg.sender
        ) {
            revert InvalidAddress();
        }

        nonce = ++recoveryNonce;
        uint8 approvals = 0;
        if (!ownerInitiated) {
            approvals = 1;
            _recoveryApprovals[nonce][msg.sender] = true;
        }

        _recovery = Recovery({
            proposedOwner: newOwner,
            proposer: msg.sender,
            executeAfter: uint64(block.timestamp) + recoveryDelay,
            approvals: approvals,
            cancelApprovals: 0,
            active: true,
            ownerInitiated: ownerInitiated,
            nonce: nonce
        });
        recoveryFrozen = true;

        emit RecoveryProposed(nonce, msg.sender, newOwner, ownerInitiated, _recovery.executeAfter);
    }

    function approveRecovery() external {
        if (!_isGuardian(msg.sender)) revert NotGuardian();
        Recovery storage proposal = _recovery;
        if (!proposal.active) revert NoRecovery();
        if (_recoveryApprovals[proposal.nonce][msg.sender]) revert AlreadyApproved();

        _recoveryApprovals[proposal.nonce][msg.sender] = true;
        proposal.approvals += 1;
        emit RecoveryApproved(proposal.nonce, msg.sender, proposal.approvals);
    }

    /// @notice Owner can cancel only a proposal it created; guardians can
    ///         cancel any proposal with two distinct cancel approvals.
    function cancelRecovery() external {
        Recovery storage proposal = _recovery;
        if (!proposal.active) revert NoRecovery();

        if (msg.sender == owner && proposal.ownerInitiated) {
            proposal.active = false;
            recoveryFrozen = false;
            emit RecoveryCancelled(proposal.nonce, msg.sender);
            return;
        }
        if (!_isGuardian(msg.sender)) revert NotAuthorised();
        if (_recoveryCancelApprovals[proposal.nonce][msg.sender]) revert AlreadyApproved();

        _recoveryCancelApprovals[proposal.nonce][msg.sender] = true;
        proposal.cancelApprovals += 1;
        emit RecoveryCancelApproved(proposal.nonce, msg.sender, proposal.cancelApprovals);

        if (proposal.cancelApprovals >= GUARDIAN_THRESHOLD) {
            proposal.active = false;
            recoveryFrozen = false;
            emit RecoveryCancelled(proposal.nonce, msg.sender);
        }
    }

    function executeRecovery() external {
        Recovery storage proposal = _recovery;
        if (!proposal.active) revert NoRecovery();
        if (block.timestamp < proposal.executeAfter) revert RecoveryDelayActive();
        if (proposal.approvals < GUARDIAN_THRESHOLD) revert ApprovalIncomplete();
        if (
            proposal.proposedOwner == address(0) ||
            proposal.proposedOwner == owner ||
            proposal.proposedOwner == monitor ||
            _isGuardian(proposal.proposedOwner)
        ) {
            revert InvalidAddress();
        }

        address previous = owner;
        address next = proposal.proposedOwner;

        proposal.active = false;
        owner = next;
        epoch += 1;
        monitorFrozen = false;
        recoveryFrozen = false;

        // Everything authorised by the old epoch is now worthless.
        _invalidatePendingSecurityActions();
        _resetWithdrawalAccounting();

        emit RecoveryExecuted(previous, next, epoch);
    }

    /* ------------------------------------------------------------------ */
    /*                     FALSE-POSITIVE RESTORATION                     */
    /* ------------------------------------------------------------------ */

    /**
     * @notice Guardian-controlled release of a monitor freeze. This is the
     *         false-positive path: it never replaces the owner and never
     *         touches funds. The monitor cannot initiate, approve or execute
     *         it. A compromised monitor can freeze again after restoration;
     *         that is a denial-of-service trade-off, documented in the threat
     *         model, not a path to theft.
     */
    function proposeRestoration() external returns (uint256 nonce) {
        bool ownerInitiated = msg.sender == owner;
        if (!ownerInitiated && !_isGuardian(msg.sender)) revert NotAuthorised();
        if (!monitorFrozen) revert NotFrozen();
        if (_recovery.active) revert RecoveryActive();
        if (_restoration.active) revert ProposalActive();

        nonce = ++restorationNonce;
        uint8 approvals = 0;
        if (!ownerInitiated) {
            approvals = 1;
            _restorationApprovals[nonce][msg.sender] = true;
        }
        _restoration = Restoration({
            proposer: msg.sender,
            executeAfter: uint64(block.timestamp) + policyDelay,
            approvals: approvals,
            cancelApprovals: 0,
            active: true,
            ownerInitiated: ownerInitiated,
            nonce: nonce
        });
        emit RestorationProposed(nonce, msg.sender, _restoration.executeAfter);
    }

    function approveRestoration() external {
        if (!_isGuardian(msg.sender)) revert NotGuardian();
        Restoration storage proposal = _restoration;
        if (!proposal.active) revert NoProposal();
        if (_restorationApprovals[proposal.nonce][msg.sender]) revert AlreadyApproved();

        _restorationApprovals[proposal.nonce][msg.sender] = true;
        proposal.approvals += 1;
        emit RestorationApproved(proposal.nonce, msg.sender, proposal.approvals);
    }

    function cancelRestoration() external {
        Restoration storage proposal = _restoration;
        if (!proposal.active) revert NoProposal();

        if (msg.sender == owner && proposal.ownerInitiated) {
            proposal.active = false;
            emit RestorationCancelled(proposal.nonce, msg.sender);
            return;
        }
        if (!_isGuardian(msg.sender)) revert NotAuthorised();
        if (_restorationCancelApprovals[proposal.nonce][msg.sender]) revert AlreadyApproved();

        _restorationCancelApprovals[proposal.nonce][msg.sender] = true;
        proposal.cancelApprovals += 1;
        if (proposal.cancelApprovals >= GUARDIAN_THRESHOLD) {
            proposal.active = false;
            emit RestorationCancelled(proposal.nonce, msg.sender);
        }
    }

    function executeRestoration() external {
        Restoration storage proposal = _restoration;
        if (!proposal.active) revert NoProposal();
        if (!monitorFrozen) revert NotFrozen();
        if (block.timestamp < proposal.executeAfter) revert RecoveryDelayActive();
        if (block.timestamp > uint256(proposal.executeAfter) + PROPOSAL_EXECUTION_WINDOW) {
            revert ProposalExpired();
        }
        if (proposal.approvals < GUARDIAN_THRESHOLD) revert ApprovalIncomplete();

        proposal.active = false;
        monitorFrozen = false;
        emit RestorationExecuted(proposal.nonce);
    }

    /* ------------------------------------------------------------------ */
    /*                          INTERNAL CLEANUP                          */
    /* ------------------------------------------------------------------ */

    function _invalidatePendingSecurityActions() internal {
        if (_policyProposal.active) {
            _policyProposal.active = false;
        }
        if (_allowlistProposal.active) {
            _allowlistProposal.active = false;
        }
        if (_guardianProposal.active) {
            _guardianProposal.active = false;
        }
        if (_restoration.active) {
            _restoration.active = false;
        }
    }

    function _resetWithdrawalAccounting() internal {
        reservedBalance = 0;
        // 64 fixed slots: bounded gas, and every pre-recovery request is
        // invalidated by the epoch check regardless of accounting.
        for (uint16 i = 0; i < MAX_CHARGES; i++) {
            delete _charges[i];
        }
        _chargeCursor = 0;
    }

    /* ------------------------------------------------------------------ */
    /*                               VIEWS                                */
    /* ------------------------------------------------------------------ */

    function isGuardian(address account) external view returns (bool) {
        return _isGuardian(account);
    }

    function _isGuardian(address account) internal view returns (bool) {
        for (uint8 i = 0; i < GUARDIAN_COUNT; i++) {
            if (guardians[i] == account) return true;
        }
        return false;
    }

    function getPolicy()
        external
        view
        returns (
            uint256 perTransactionLimit,
            uint256 largeWithdrawalThreshold,
            uint256 rollingLimit,
            uint64 withdrawalDelay,
            bool allowlistOnly
        )
    {
        Policy storage current = _policy;
        return (
            current.perTransactionLimit,
            current.largeWithdrawalThreshold,
            current.rollingLimit,
            current.withdrawalDelay,
            current.allowlistOnly
        );
    }

    function getPolicyProposal()
        external
        view
        returns (
            uint256 perTransactionLimit,
            uint256 largeWithdrawalThreshold,
            uint256 rollingLimit,
            uint64 withdrawalDelay,
            bool allowlistOnly,
            uint64 createdAt,
            uint64 executeAfter,
            uint8 approvals,
            bool weakening,
            bool active,
            uint256 nonce,
            address proposer
        )
    {
        PolicyProposal storage proposal = _policyProposal;
        return (
            proposal.proposed.perTransactionLimit,
            proposal.proposed.largeWithdrawalThreshold,
            proposal.proposed.rollingLimit,
            proposal.proposed.withdrawalDelay,
            proposal.proposed.allowlistOnly,
            proposal.createdAt,
            proposal.executeAfter,
            proposal.approvals,
            proposal.weakening,
            proposal.active,
            proposal.nonce,
            proposal.proposer
        );
    }

    function getAllowlistProposal()
        external
        view
        returns (address account, uint64 executeAfter, uint8 approvals, bool active, uint256 nonce)
    {
        AllowlistProposal storage proposal = _allowlistProposal;
        return (
            proposal.account,
            proposal.executeAfter,
            proposal.approvals,
            proposal.active,
            proposal.nonce
        );
    }

    function getGuardianProposal()
        external
        view
        returns (
            uint8 index,
            address newGuardian,
            uint64 executeAfter,
            uint8 approvals,
            bool active,
            uint256 nonce
        )
    {
        GuardianProposal storage proposal = _guardianProposal;
        return (
            proposal.index,
            proposal.newGuardian,
            proposal.executeAfter,
            proposal.approvals,
            proposal.active,
            proposal.nonce
        );
    }

    function getRecoveryProposal()
        external
        view
        returns (
            address proposedOwner,
            address proposer,
            uint64 executeAfter,
            uint8 approvals,
            uint8 cancelApprovals,
            bool active,
            bool ownerInitiated,
            uint256 nonce
        )
    {
        Recovery storage proposal = _recovery;
        return (
            proposal.proposedOwner,
            proposal.proposer,
            proposal.executeAfter,
            proposal.approvals,
            proposal.cancelApprovals,
            proposal.active,
            proposal.ownerInitiated,
            proposal.nonce
        );
    }

    function getRestorationProposal()
        external
        view
        returns (
            address proposer,
            uint64 executeAfter,
            uint8 approvals,
            uint8 cancelApprovals,
            bool active,
            bool ownerInitiated,
            uint256 nonce
        )
    {
        Restoration storage proposal = _restoration;
        return (
            proposal.proposer,
            proposal.executeAfter,
            proposal.approvals,
            proposal.cancelApprovals,
            proposal.active,
            proposal.ownerInitiated,
            proposal.nonce
        );
    }

    function getRollingSpent() external view returns (uint256) {
        return _rollingSpent();
    }

    function getRollingRemaining() external view returns (uint256 remaining) {
        uint256 spent = _rollingSpent();
        uint256 limit = _policy.rollingLimit;
        return spent >= limit ? 0 : limit - spent;
    }

    function previewExecuteAfter(
        uint256 amount
    ) external view returns (uint64 executeAfter, bool requiresGuardians) {
        uint256 spent = _rollingSpent();
        requiresGuardians = amount >= _policy.largeWithdrawalThreshold ||
            spent + amount >= _policy.largeWithdrawalThreshold;
        executeAfter = uint64(block.timestamp) +
            (requiresGuardians ? _policy.withdrawalDelay : SMALL_WITHDRAWAL_DELAY);
    }
}
