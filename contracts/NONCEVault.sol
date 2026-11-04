// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title NONCEVault
 * @notice Reference implementation of the NONCE vault model. This contract is
 *         intentionally small and explicit: a vault signer, three guardians, a
 *         withdrawal policy and a narrowly scoped monitor role that can freeze
 *         but never move funds.
 *
 *         It is NOT audited and has NOT been deployed. Do not use it to secure
 *         real value without an independent review, invariant testing and a
 *         deployment procedure you have practised.
 *
 *         Deliberate design choices:
 *         - ETH only in this reference; ERC-20 handling is left to production.
 *         - The monitor can freeze, never unfreeze. Recovery is the only path
 *           back to normal operation, including after a false positive.
 *         - Recovery increments `epoch`, invalidating every withdrawal queued
 *           before the compromise was contained.
 *         - The owner can queue and cancel withdrawals but can never bypass the
 *           delay, the allowlist or guardian approvals while the vault is live.
 */
contract NONCEVault {
    /* ------------------------------------------------------------------ */
    /*                              ERRORS                                */
    /* ------------------------------------------------------------------ */

    error NotOwner();
    error NotMonitor();
    error NotGuardian();
    error Frozen();
    error NotFrozen();
    error InvalidAddress();
    error InvalidAmount();
    error ExceedsLimit();
    error InsufficientBalance();
    error RecipientNotAllowed();
    error UnknownWithdrawal();
    error AlreadyFinalised();
    error DelayActive();
    error ApprovalIncomplete();
    error AlreadyApproved();
    error NoRecovery();
    error RecoveryDelayActive();
    error Reentrancy();

    /* ------------------------------------------------------------------ */
    /*                              CONSTANTS                             */
    /* ------------------------------------------------------------------ */

    uint8 public constant GUARDIAN_THRESHOLD = 2;
    uint8 public constant GUARDIAN_COUNT = 3;

    /* ------------------------------------------------------------------ */
    /*                              STORAGE                               */
    /* ------------------------------------------------------------------ */

    address public owner;
    address public immutable monitor;
    address[3] public guardians;

    bool public frozen;
    uint256 public epoch;

    uint256 public perTransactionLimit;
    uint256 public largeWithdrawalThreshold;
    uint64 public withdrawalDelay;
    bool public allowlistOnly;
    mapping(address => bool) public allowlisted;

    struct Withdrawal {
        address payable recipient;
        uint256 amount;
        uint64 executeAfter;
        uint256 epoch;
        uint8 approvals;
        bool requiresGuardians;
        bool cancelled;
        bool executed;
    }

    uint256 public withdrawalCount;
    mapping(uint256 => Withdrawal) public withdrawals;
    mapping(uint256 => mapping(address => bool)) public withdrawalApprovedBy;

    uint64 public immutable recoveryDelay;

    struct Recovery {
        address proposedOwner;
        uint64 executeAfter;
        uint8 approvals;
        bool active;
    }

    Recovery public recovery;
    uint256 public recoveryNonce;
    mapping(address => uint256) public recoveryApprovalNonce;

    uint256 private _entered = 1;

    /* ------------------------------------------------------------------ */
    /*                              EVENTS                                */
    /* ------------------------------------------------------------------ */

    event Deposited(address indexed from, uint256 amount);
    event WithdrawalQueued(
        uint256 indexed id,
        address indexed recipient,
        uint256 amount,
        uint64 executeAfter,
        bool requiresGuardians
    );
    event WithdrawalApproved(uint256 indexed id, address indexed guardian, uint8 approvals);
    event WithdrawalCancelled(uint256 indexed id);
    event WithdrawalExecuted(uint256 indexed id, address indexed recipient, uint256 amount);
    event PolicyUpdated(
        uint256 perTransactionLimit,
        uint256 largeThreshold,
        uint64 delay,
        bool allowlistOnly
    );
    event AllowlistUpdated(address indexed account, bool allowed);
    event FreezeChanged(bool frozen, address indexed by);
    event RecoveryProposed(address indexed proposedOwner, uint64 executeAfter, uint256 nonce);
    event RecoveryApproved(address indexed guardian, uint8 approvals);
    event RecoveryCancelled();
    event RecoveryExecuted(
        address indexed previousOwner,
        address indexed newOwner,
        uint256 indexed newEpoch
    );

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
        uint64 withdrawalDelay_,
        uint64 recoveryDelay_
    ) {
        if (initialOwner == address(0) || monitor_ == address(0)) revert InvalidAddress();
        if (perTransactionLimit_ == 0) revert InvalidAmount();
        if (largeWithdrawalThreshold_ > perTransactionLimit_) revert ExceedsLimit();
        if (withdrawalDelay_ > 7 days || recoveryDelay_ > 30 days) revert InvalidAmount();

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
        perTransactionLimit = perTransactionLimit_;
        largeWithdrawalThreshold = largeWithdrawalThreshold_;
        withdrawalDelay = withdrawalDelay_;
        recoveryDelay = recoveryDelay_;
        epoch = 1;
    }

    /* ------------------------------------------------------------------ */
    /*                              RECEIVE                               */
    /* ------------------------------------------------------------------ */

    receive() external payable {
        if (frozen) revert Frozen();
        if (msg.value == 0) revert InvalidAmount();
        emit Deposited(msg.sender, msg.value);
    }

    /* ------------------------------------------------------------------ */
    /*                            WITHDRAWALS                             */
    /* ------------------------------------------------------------------ */

    /**
     * @notice Queue a withdrawal. Large requests require two guardian
     *         approvals in addition to the delay.
     */
    function requestWithdrawal(
        uint256 amount,
        address payable recipient
    ) external onlyOwner returns (uint256 id) {
        if (frozen) revert Frozen();
        if (recipient == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (amount > perTransactionLimit) revert ExceedsLimit();
        if (amount > address(this).balance) revert InsufficientBalance();
        if (allowlistOnly && !allowlisted[recipient]) revert RecipientNotAllowed();

        bool requiresGuardians = amount >= largeWithdrawalThreshold;
        uint64 delay = requiresGuardians ? withdrawalDelay : 0;
        uint64 executeAfter = uint64(block.timestamp) + delay;

        id = ++withdrawalCount;
        withdrawals[id] = Withdrawal({
            recipient: recipient,
            amount: amount,
            executeAfter: executeAfter,
            epoch: epoch,
            approvals: 0,
            requiresGuardians: requiresGuardians,
            cancelled: false,
            executed: false
        });

        emit WithdrawalQueued(id, recipient, amount, executeAfter, requiresGuardians);
    }

    function approveWithdrawal(uint256 id) external {
        if (!_isGuardian(msg.sender)) revert NotGuardian();
        Withdrawal storage request = withdrawals[id];
        if (request.recipient == address(0)) revert UnknownWithdrawal();
        if (request.executed || request.cancelled) revert AlreadyFinalised();
        if (request.epoch != epoch) revert AlreadyFinalised();
        if (!request.requiresGuardians) revert ApprovalIncomplete();
        if (withdrawalApprovedBy[id][msg.sender]) revert AlreadyApproved();

        withdrawalApprovedBy[id][msg.sender] = true;
        request.approvals += 1;
        emit WithdrawalApproved(id, msg.sender, request.approvals);
    }

    function cancelWithdrawal(uint256 id) external onlyOwner {
        Withdrawal storage request = withdrawals[id];
        if (request.recipient == address(0)) revert UnknownWithdrawal();
        if (request.executed || request.cancelled) revert AlreadyFinalised();
        request.cancelled = true;
        emit WithdrawalCancelled(id);
    }

    function executeWithdrawal(uint256 id) external nonReentrant {
        Withdrawal storage request = withdrawals[id];
        if (request.recipient == address(0)) revert UnknownWithdrawal();
        if (request.executed || request.cancelled) revert AlreadyFinalised();
        if (frozen) revert Frozen();
        if (request.epoch != epoch) revert AlreadyFinalised();
        if (block.timestamp < request.executeAfter) revert DelayActive();
        if (request.requiresGuardians && request.approvals < GUARDIAN_THRESHOLD) {
            revert ApprovalIncomplete();
        }
        if (request.amount > address(this).balance) revert InsufficientBalance();

        request.executed = true;
        (bool sent, ) = request.recipient.call{value: request.amount}("");
        if (!sent) revert InsufficientBalance();

        emit WithdrawalExecuted(id, request.recipient, request.amount);
    }

    /* ------------------------------------------------------------------ */
    /*                              POLICY                                */
    /* ------------------------------------------------------------------ */

    function setPolicy(
        uint256 perTransactionLimit_,
        uint256 largeWithdrawalThreshold_,
        uint64 withdrawalDelay_,
        bool allowlistOnly_
    ) external onlyOwner {
        if (frozen) revert Frozen();
        if (perTransactionLimit_ == 0) revert InvalidAmount();
        if (largeWithdrawalThreshold_ > perTransactionLimit_) revert ExceedsLimit();
        if (withdrawalDelay_ > 7 days) revert InvalidAmount();

        perTransactionLimit = perTransactionLimit_;
        largeWithdrawalThreshold = largeWithdrawalThreshold_;
        withdrawalDelay = withdrawalDelay_;
        allowlistOnly = allowlistOnly_;

        emit PolicyUpdated(perTransactionLimit_, largeWithdrawalThreshold_, withdrawalDelay_, allowlistOnly_);
    }

    function setAllowlisted(address account, bool allowed) external onlyOwner {
        if (frozen) revert Frozen();
        if (account == address(0)) revert InvalidAddress();
        allowlisted[account] = allowed;
        emit AllowlistUpdated(account, allowed);
    }

    /* ------------------------------------------------------------------ */
    /*                              FREEZE                                */
    /* ------------------------------------------------------------------ */

    /**
     * @notice Narrow automation role: freeze the vault. The monitor can never
     *         withdraw, unfreeze, change policy or recover ownership.
     */
    function freeze() external {
        if (msg.sender != monitor && msg.sender != owner) revert NotMonitor();
        if (frozen) revert Frozen();
        frozen = true;
        emit FreezeChanged(true, msg.sender);
    }

    /* ------------------------------------------------------------------ */
    /*                             RECOVERY                               */
    /* ------------------------------------------------------------------ */

    function proposeRecovery(address newOwner) external onlyOwner {
        if (!frozen) revert NotFrozen();
        if (newOwner == address(0) || newOwner == owner) revert InvalidAddress();
        if (recovery.active) revert AlreadyApproved();

        recoveryNonce += 1;
        recovery = Recovery({
            proposedOwner: newOwner,
            executeAfter: uint64(block.timestamp) + recoveryDelay,
            approvals: 0,
            active: true
        });

        emit RecoveryProposed(newOwner, recovery.executeAfter, recoveryNonce);
    }

    function approveRecovery() external {
        if (!_isGuardian(msg.sender)) revert NotGuardian();
        if (!recovery.active) revert NoRecovery();
        if (recoveryApprovalNonce[msg.sender] == recoveryNonce) revert AlreadyApproved();

        recoveryApprovalNonce[msg.sender] = recoveryNonce;
        recovery.approvals += 1;
        emit RecoveryApproved(msg.sender, recovery.approvals);
    }

    function cancelRecovery() external onlyOwner {
        if (!recovery.active) revert NoRecovery();
        delete recovery;
        emit RecoveryCancelled();
    }

    /**
     * @notice Replace the compromised signer after two guardian approvals and
     *         the recovery delay. The epoch changes so withdrawals authorised
     *         by the old signer can never execute.
     */
    function executeRecovery() external {
        if (!recovery.active) revert NoRecovery();
        if (block.timestamp < recovery.executeAfter) revert RecoveryDelayActive();
        if (recovery.approvals < GUARDIAN_THRESHOLD) revert ApprovalIncomplete();

        address previous = owner;
        address next = recovery.proposedOwner;

        delete recovery;
        owner = next;
        frozen = false;
        epoch += 1;

        emit RecoveryExecuted(previous, next, epoch);
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

    function previewExecuteAfter(
        uint256 amount
    ) external view returns (uint64 executeAfter, bool requiresGuardians) {
        requiresGuardians = amount >= largeWithdrawalThreshold;
        executeAfter = uint64(block.timestamp) + (requiresGuardians ? withdrawalDelay : 0);
    }
}
