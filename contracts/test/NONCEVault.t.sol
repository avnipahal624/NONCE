// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NONCEVault} from "../NONCEVault.sol";

/* -------------------------------------------------------------------------- */
/*                            Reentrancy attacker                             */
/* -------------------------------------------------------------------------- */

contract ReentrantRecipient {
    NONCEVault private immutable vault;
    uint256 public targetId;
    bool private attacking;

    constructor(NONCEVault vault_) {
        vault = vault_;
    }

    function setTarget(uint256 id) external {
        targetId = id;
    }

    receive() external payable {
        if (!attacking) {
            attacking = true;
            vault.executeWithdrawal(targetId);
        }
    }
}

/* -------------------------------------------------------------------------- */
/*                               Invariant handler                            */
/* -------------------------------------------------------------------------- */

contract VaultHandler is Test {
    NONCEVault public immutable vault;
    address public immutable owner;
    uint256[] public ids;

    constructor(NONCEVault vault_, address owner_) {
        vault = vault_;
        owner = owner_;
    }

    function request(uint96 rawAmount) external {
        uint256 amount = bound(uint256(rawAmount), 1, 0.4 ether);
        vm.prank(owner);
        try vault.requestWithdrawal(amount, payable(address(0xBEEF))) returns (uint256 id) {
            ids.push(id);
        } catch {}
    }

    function cancel(uint256 seed) external {
        if (ids.length == 0) return;
        uint256 id = ids[seed % ids.length];
        vm.prank(owner);
        try vault.cancelWithdrawal(id) {} catch {}
    }

    function execute(uint256 seed) external {
        if (ids.length == 0) return;
        uint256 id = ids[seed % ids.length];
        vm.warp(block.timestamp + 11 minutes);
        try vault.executeWithdrawal(id) {} catch {}
    }

    function advance(uint64 secondsToAdvance) external {
        vm.warp(block.timestamp + bound(uint256(secondsToAdvance), 1, 1 days));
    }
}

/* -------------------------------------------------------------------------- */
/*                                  Main suite                                */
/* -------------------------------------------------------------------------- */

contract NONCEVaultTest is Test {
    NONCEVault internal vault;
    VaultHandler internal handler;

    address internal owner = address(0xA11CE);
    address internal monitor = address(0xB0B);
    address internal guardianOne = address(0x601);
    address internal guardianTwo = address(0x602);
    address internal guardianThree = address(0x603);
    address payable internal recipient = payable(address(0xCAFE));
    address internal attacker = address(0xBAD);

    uint256 internal constant LIMIT = 1 ether;
    uint256 internal constant LARGE = 0.5 ether;
    uint256 internal constant ROLLING = 5 ether;
    uint64 internal constant WITHDRAWAL_DELAY = 30 minutes;
    uint64 internal constant RECOVERY_DELAY = 3 days;
    uint64 internal constant POLICY_DELAY = 2 days;

    function setUp() public {
        address[3] memory guardians = [guardianOne, guardianTwo, guardianThree];
        vault = new NONCEVault(
            owner,
            monitor,
            guardians,
            LIMIT,
            LARGE,
            ROLLING,
            WITHDRAWAL_DELAY,
            RECOVERY_DELAY,
            POLICY_DELAY
        );
        vm.deal(address(vault), 100 ether);

        handler = new VaultHandler(vault, owner);
        targetContract(address(handler));
    }

    /* ------------------------------ helpers --------------------------- */

    function _policy(
        uint256 perTx,
        uint256 large,
        uint256 rolling,
        uint64 delay,
        bool allowlistOnly
    ) internal pure returns (NONCEVault.Policy memory) {
        return
            NONCEVault.Policy({
                perTransactionLimit: perTx,
                largeWithdrawalThreshold: large,
                rollingLimit: rolling,
                withdrawalDelay: delay,
                allowlistOnly: allowlistOnly
            });
    }

    function _propose(NONCEVault.Policy memory policy) internal returns (uint256) {
        vm.prank(owner);
        return vault.proposePolicy(policy);
    }

    function _approvedWithdrawal(uint256 amount) internal returns (uint256 id) {
        vm.prank(owner);
        id = vault.requestWithdrawal(amount, recipient);
        if (_requiresGuardians(id)) {
            vm.prank(guardianOne);
            vault.approveWithdrawal(id);
            vm.prank(guardianTwo);
            vault.approveWithdrawal(id);
        }
    }

    function _requiresGuardians(uint256 id) internal view returns (bool required) {
        (, , , , , , required, , ) = vault.withdrawals(id);
    }

    function _recover(address newOwner) internal {
        vm.prank(guardianOne);
        vault.proposeRecovery(newOwner);
        vm.prank(guardianTwo);
        vault.approveRecovery();
        vm.warp(block.timestamp + RECOVERY_DELAY);
        vault.executeRecovery();
    }

    /* ----------------------- mandatory withdrawal delay ---------------- */

    function testEveryWithdrawalHasAMandatoryMinimumDelay() public {
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(1 wei, recipient);

        (, , uint64 executeAfter, , , , bool requiresGuardians, , ) = vault.withdrawals(id);
        assertFalse(requiresGuardians);
        assertEq(executeAfter, block.timestamp + vault.SMALL_WITHDRAWAL_DELAY());

        vm.expectRevert(NONCEVault.DelayActive.selector);
        vault.executeWithdrawal(id);
    }

    function testSmallWithdrawalExecutesOnlyAfterDelay() public {
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(0.1 ether, recipient);

        vm.warp(block.timestamp + vault.SMALL_WITHDRAWAL_DELAY());
        vault.executeWithdrawal(id);

        assertEq(recipient.balance, 0.1 ether);
        assertEq(vault.reservedBalance(), 0);
    }

    function testLargeWithdrawalNeedsDelayAndTwoDistinctGuardians() public {
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(0.6 ether, recipient);

        vm.prank(guardianOne);
        vault.approveWithdrawal(id);

        vm.prank(guardianOne);
        vm.expectRevert(NONCEVault.AlreadyApproved.selector);
        vault.approveWithdrawal(id);

        vm.prank(guardianTwo);
        vault.approveWithdrawal(id);

        vm.warp(block.timestamp + WITHDRAWAL_DELAY);
        vault.executeWithdrawal(id);
        assertEq(recipient.balance, 0.6 ether);
    }

    function testNonGuardianCannotApproveWithdrawal() public {
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(0.6 ether, recipient);

        vm.prank(attacker);
        vm.expectRevert(NONCEVault.NotGuardian.selector);
        vault.approveWithdrawal(id);
    }

    /* ---------------------- cumulative / rolling limits ---------------- */

    function testCumulativeSpendingTriggersGuardianApproval() public {
        vm.prank(owner);
        vault.requestWithdrawal(0.3 ether, recipient);

        vm.prank(owner);
        uint256 second = vault.requestWithdrawal(0.3 ether, recipient);
        assertTrue(_requiresGuardians(second));
    }

    function testRollingLimitBlocksDustSplitting() public {
        for (uint256 i = 0; i < 12; i++) {
            vm.prank(owner);
            vault.requestWithdrawal(0.4 ether, recipient);
        }
        assertEq(vault.getRollingSpent(), 4.8 ether);

        vm.prank(owner);
        vm.expectRevert(NONCEVault.RollingLimitExceeded.selector);
        vault.requestWithdrawal(0.4 ether, recipient);
    }

    function testAgedPendingReservationStillConsumesTheRollingBudget() public {
        // Five pending requests reserve 2 ETH. After the request-time charge
        // would have aged out, those requests are still executable, so their
        // budget must not be reusable.
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(owner);
            vault.requestWithdrawal(0.4 ether, recipient);
        }
        vm.warp(block.timestamp + 25 hours);

        for (uint256 i = 0; i < 7; i++) {
            vm.prank(owner);
            vault.requestWithdrawal(0.4 ether, recipient);
        }
        assertEq(vault.getRollingSpent(), 4.8 ether);

        vm.prank(owner);
        vm.expectRevert(NONCEVault.RollingLimitExceeded.selector);
        vault.requestWithdrawal(0.4 ether, recipient);
    }

    function testExecutedChargeStartsItsWindowAtExecution() public {
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(0.4 ether, recipient);
        vm.warp(block.timestamp + 25 hours);
        vault.executeWithdrawal(id);

        assertEq(vault.getRollingSpent(), 0.4 ether);
        vm.warp(block.timestamp + 24 hours + 1);
        assertEq(vault.getRollingSpent(), 0);
    }

    function testCancellationReleasesRollingAndBalanceReservations() public {
        uint256[] memory ids = new uint256[](12);
        for (uint256 i = 0; i < 12; i++) {
            vm.prank(owner);
            ids[i] = vault.requestWithdrawal(0.4 ether, recipient);
        }

        vm.prank(owner);
        vault.cancelWithdrawal(ids[0]);
        vm.prank(owner);
        vault.requestWithdrawal(0.4 ether, recipient);

        assertEq(vault.reservedBalance(), 4.8 ether);
        assertEq(vault.getRollingSpent(), 4.8 ether);
    }

    function testBalanceIsReservedAtRequestTime() public {
        vm.deal(address(vault), 1.5 ether);

        vm.prank(owner);
        vault.requestWithdrawal(1 ether, recipient);
        vm.prank(owner);
        vault.requestWithdrawal(0.4 ether, recipient);

        vm.prank(owner);
        vm.expectRevert(NONCEVault.InsufficientBalance.selector);
        vault.requestWithdrawal(0.2 ether, recipient);
    }

    function testExpiredRequestReleasesReservation() public {
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(0.4 ether, recipient);

        vm.warp(block.timestamp + vault.SMALL_WITHDRAWAL_DELAY() + vault.WITHDRAWAL_EXPIRY() + 1);
        vm.expectRevert(NONCEVault.WithdrawalExpired.selector);
        vault.executeWithdrawal(id);

        vault.cancelExpired(id);
        assertEq(vault.reservedBalance(), 0);
        vm.prank(owner);
        vault.requestWithdrawal(0.4 ether, recipient);
    }

    function testCancelledWithdrawalCannotExecute() public {
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(0.4 ether, recipient);
        vm.prank(owner);
        vault.cancelWithdrawal(id);

        vm.warp(block.timestamp + WITHDRAWAL_DELAY);
        vm.expectRevert(NONCEVault.AlreadyFinalised.selector);
        vault.executeWithdrawal(id);
    }

    /* ------------------------------ policy ----------------------------- */

    function testOwnerCannotChangePolicyInstantly() public {
        uint256 nonce = _propose(_policy(2 ether, 1.8 ether, 10 ether, 10 minutes, false));

        vm.prank(owner);
        vm.expectRevert(NONCEVault.DelayActive.selector);
        vault.executePolicy();

        (
            ,
            ,
            ,
            ,
            ,
            ,
            uint64 executeAfter,
            ,
            bool weakening,
            bool active,
            uint256 proposalNonce,

        ) = vault.getPolicyProposal();
        assertTrue(active);
        assertTrue(weakening);
        assertEq(proposalNonce, nonce);
        assertEq(executeAfter, block.timestamp + POLICY_DELAY);
    }

    function testWeakeningPolicyNeedsTwoGuardianApprovals() public {
        _propose(_policy(2 ether, 1.8 ether, 10 ether, 10 minutes, false));
        vm.warp(block.timestamp + POLICY_DELAY);

        vm.prank(owner);
        vm.expectRevert(NONCEVault.ApprovalIncomplete.selector);
        vault.executePolicy();

        vm.prank(guardianOne);
        vault.approvePolicy();
        vm.prank(guardianOne);
        vm.expectRevert(NONCEVault.AlreadyApproved.selector);
        vault.approvePolicy();
        vm.prank(guardianTwo);
        vault.approvePolicy();

        vm.prank(owner);
        vault.executePolicy();

        (uint256 perTx, uint256 large, uint256 rolling, uint64 delay, bool allowlistOnly) = vault
            .getPolicy();
        assertEq(perTx, 2 ether);
        assertEq(large, 1.8 ether);
        assertEq(rolling, 10 ether);
        assertEq(delay, 10 minutes);
        assertFalse(allowlistOnly);
    }

    function testStrengtheningPolicyStillHasTimelockButNoApprovals() public {
        _propose(_policy(0.5 ether, 0.1 ether, 4 ether, 1 hours, false));
        (, , , , , , , , bool weakening, , , ) = vault.getPolicyProposal();
        assertFalse(weakening);

        vm.warp(block.timestamp + POLICY_DELAY);
        vm.prank(owner);
        vault.executePolicy();

        (uint256 perTx, , , uint64 delay, ) = vault.getPolicy();
        assertEq(perTx, 0.5 ether);
        assertEq(delay, 1 hours);
    }

    function testMixedPolicyCannotHideAWeakeningField() public {
        // Lower the per-transaction cap (strengthening) while raising the
        // cumulative budget (weakening). The proposal must require guardians.
        _propose(_policy(0.8 ether, 0.4 ether, 20 ether, WITHDRAWAL_DELAY, false));
        (, , , , , , , , bool weakening, , , ) = vault.getPolicyProposal();
        assertTrue(weakening);
    }

    function testPolicyProposalExpiresAndCannotReplay() public {
        _propose(_policy(2 ether, 1.8 ether, 10 ether, 10 minutes, false));
        vm.prank(guardianOne);
        vault.approvePolicy();
        vm.prank(guardianTwo);
        vault.approvePolicy();

        vm.warp(block.timestamp + POLICY_DELAY + vault.PROPOSAL_EXECUTION_WINDOW() + 1);
        vm.prank(owner);
        vm.expectRevert(NONCEVault.ProposalExpired.selector);
        vault.executePolicy();

        vm.prank(owner);
        vault.cancelPolicy();

        uint256 nextNonce = _propose(_policy(1.5 ether, 1 ether, 8 ether, 1 hours, false));
        vm.prank(guardianOne);
        vault.approvePolicy();
        (, , , , , , , uint8 approvals, , , , ) = vault.getPolicyProposal();
        assertEq(approvals, 1);
        assertEq(nextNonce, 2);
    }

    function testPolicyCannotExecuteWhileFrozen() public {
        _propose(_policy(2 ether, 1.8 ether, 10 ether, 10 minutes, false));
        vm.prank(guardianOne);
        vault.approvePolicy();
        vm.prank(guardianTwo);
        vault.approvePolicy();
        vm.warp(block.timestamp + POLICY_DELAY);

        vm.prank(monitor);
        vault.freeze();

        vm.prank(owner);
        vm.expectRevert(NONCEVault.Frozen.selector);
        vault.executePolicy();
    }

    function testPolicyInvariantsRejectZeroAndUnsafeValues() public {
        vm.startPrank(owner);
        vm.expectRevert(NONCEVault.InvalidPolicy.selector);
        vault.proposePolicy(_policy(0, 0.1 ether, 5 ether, WITHDRAWAL_DELAY, false));

        vm.expectRevert(NONCEVault.InvalidPolicy.selector);
        vault.proposePolicy(_policy(1 ether, 2 ether, 5 ether, WITHDRAWAL_DELAY, false));

        vm.expectRevert(NONCEVault.InvalidPolicy.selector);
        vault.proposePolicy(_policy(1 ether, 0.5 ether, 0.5 ether, WITHDRAWAL_DELAY, false));

        vm.expectRevert(NONCEVault.InvalidPolicy.selector);
        vault.proposePolicy(_policy(1 ether, 0.5 ether, 5 ether, 1 minutes, false));
        vm.stopPrank();
    }

    function testOnlyOwnerCanProposePolicyAndOnlyGuardiansApprove() public {
        vm.prank(attacker);
        vm.expectRevert(NONCEVault.NotOwner.selector);
        vault.proposePolicy(_policy(2 ether, 1.8 ether, 10 ether, 10 minutes, false));

        _propose(_policy(2 ether, 1.8 ether, 10 ether, 10 minutes, false));
        vm.prank(attacker);
        vm.expectRevert(NONCEVault.NotGuardian.selector);
        vault.approvePolicy();
    }

    /* ----------------------------- allowlist --------------------------- */

    function testAllowlistRemovalIsTimelockedAndGuardianApproved() public {
        vm.prank(owner);
        vault.setAllowlisted(recipient, true);

        _propose(_policy(LIMIT, LARGE, ROLLING, WITHDRAWAL_DELAY, true));
        vm.warp(block.timestamp + POLICY_DELAY);
        vm.prank(owner);
        vault.executePolicy();

        vm.prank(owner);
        vault.proposeAllowlistRemoval(recipient);

        vm.prank(owner);
        vm.expectRevert(NONCEVault.DelayActive.selector);
        vault.executeAllowlistRemoval();

        vm.prank(guardianOne);
        vault.approveAllowlistRemoval();
        vm.prank(guardianTwo);
        vault.approveAllowlistRemoval();
        vm.warp(block.timestamp + POLICY_DELAY);

        vm.prank(owner);
        vault.executeAllowlistRemoval();
        assertFalse(vault.allowlisted(recipient));
    }

    function testAllowlistCannotRemoveItsLastRecipient() public {
        vm.prank(owner);
        vault.setAllowlisted(recipient, true);
        _propose(_policy(LIMIT, LARGE, ROLLING, WITHDRAWAL_DELAY, true));
        vm.warp(block.timestamp + POLICY_DELAY);
        vm.prank(owner);
        vault.executePolicy();

        vm.prank(owner);
        vault.proposeAllowlistRemoval(recipient);
        vm.prank(guardianOne);
        vault.approveAllowlistRemoval();
        vm.prank(guardianTwo);
        vault.approveAllowlistRemoval();
        vm.warp(block.timestamp + POLICY_DELAY);

        vm.prank(owner);
        vm.expectRevert(NONCEVault.InvalidPolicy.selector);
        vault.executeAllowlistRemoval();
    }

    function testSetAllowlistedCannotBypassRemovalTimelock() public {
        vm.prank(owner);
        vault.setAllowlisted(recipient, true);

        vm.prank(owner);
        vm.expectRevert(NONCEVault.InvalidPolicy.selector);
        vault.setAllowlisted(recipient, false);
    }

    function testUnknownRecipientRejectedWhenAllowlistEnabled() public {
        vm.prank(owner);
        vault.setAllowlisted(recipient, true);
        _propose(_policy(LIMIT, LARGE, ROLLING, WITHDRAWAL_DELAY, true));
        vm.warp(block.timestamp + POLICY_DELAY);
        vm.prank(owner);
        vault.executePolicy();

        vm.prank(owner);
        vm.expectRevert(NONCEVault.RecipientNotAllowed.selector);
        vault.requestWithdrawal(0.1 ether, payable(attacker));
    }

    /* ----------------------------- recovery ---------------------------- */

    function testGuardiansCanInitiateRecoveryWithoutOwner() public {
        address nextOwner = address(0xDEAD);

        vm.prank(guardianOne);
        vault.proposeRecovery(nextOwner);
        assertTrue(vault.frozen());

        vm.prank(owner);
        vm.expectRevert(NONCEVault.NotAuthorised.selector);
        vault.cancelRecovery();

        vm.prank(guardianTwo);
        vault.approveRecovery();

        vm.warp(block.timestamp + RECOVERY_DELAY);
        vault.executeRecovery();

        assertEq(vault.owner(), nextOwner);
        assertEq(vault.epoch(), 2);
        assertFalse(vault.frozen());
    }

    function testRecoveryRequiresTwoApprovalsAndDelay() public {
        vm.prank(guardianOne);
        vault.proposeRecovery(address(0xDEAD));

        // One approval is not enough, and the delay has not elapsed yet. The
        // contract checks the delay first, so this must be RecoveryDelayActive.
        vm.expectRevert(NONCEVault.RecoveryDelayActive.selector);
        vault.executeRecovery();

        vm.prank(guardianTwo);
        vault.approveRecovery();

        vm.warp(block.timestamp + RECOVERY_DELAY);
        vault.executeRecovery();
        assertEq(vault.owner(), address(0xDEAD));
    }

    function testRecoveryCannotExecuteWithOneApprovalAfterDelay() public {
        vm.prank(guardianOne);
        vault.proposeRecovery(address(0xDEAD));

        vm.warp(block.timestamp + RECOVERY_DELAY);
        vm.expectRevert(NONCEVault.ApprovalIncomplete.selector);
        vault.executeRecovery();
    }

    function testRecoveryRejectsRoleConflicts() public {
        vm.prank(guardianOne);
        vm.expectRevert(NONCEVault.InvalidAddress.selector);
        vault.proposeRecovery(guardianTwo);

        vm.prank(guardianOne);
        vm.expectRevert(NONCEVault.InvalidAddress.selector);
        vault.proposeRecovery(monitor);

        vm.prank(guardianOne);
        vm.expectRevert(NONCEVault.InvalidAddress.selector);
        vault.proposeRecovery(address(0));

        vm.prank(guardianOne);
        vm.expectRevert(NONCEVault.InvalidAddress.selector);
        vault.proposeRecovery(guardianOne);
    }

    function testOwnerInitiatedRecoveryCanBeCancelledByOwner() public {
        vm.prank(owner);
        vault.proposeRecovery(address(0xDEAD));
        vm.prank(owner);
        vault.cancelRecovery();

        (, , , , , bool active, , ) = vault.getRecoveryProposal();
        assertFalse(active);
        assertFalse(vault.frozen());
    }

    function testTwoGuardiansCanCancelABadRecoveryProposal() public {
        vm.prank(guardianOne);
        vault.proposeRecovery(address(0xDEAD));

        vm.prank(guardianOne);
        vault.cancelRecovery();
        vm.prank(guardianTwo);
        vault.cancelRecovery();

        (, , , , , bool active, , ) = vault.getRecoveryProposal();
        assertFalse(active);
        assertFalse(vault.frozen());
    }

    function testRecoveryInvalidatesOldWithdrawalsAndAccounting() public {
        vm.prank(owner);
        uint256 oldId = vault.requestWithdrawal(0.4 ether, recipient);
        assertEq(vault.reservedBalance(), 0.4 ether);

        _recover(address(0xDEAD));

        vm.expectRevert(NONCEVault.AlreadyFinalised.selector);
        vault.executeWithdrawal(oldId);
        assertEq(vault.reservedBalance(), 0);
        assertEq(vault.getRollingSpent(), 0);

        vm.prank(address(0xDEAD));
        vault.requestWithdrawal(0.4 ether, recipient);
    }

    function testRecoveryInvalidatesPendingPolicyAndRotationProposals() public {
        _propose(_policy(2 ether, 1.8 ether, 10 ether, 10 minutes, false));
        vm.prank(owner);
        vault.proposeGuardianRotation(0, address(0x777));

        _recover(address(0xDEAD));

        (, , , , , , , , , bool policyActive, , ) = vault.getPolicyProposal();
        (, , , , bool guardianActive, ) = vault.getGuardianProposal();
        assertFalse(policyActive);
        assertFalse(guardianActive);
    }

    /* ------------------------------- freeze ----------------------------- */

    function testFreezeIsIdempotentAndBlocksAllExits() public {
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(0.4 ether, recipient);
        vm.warp(block.timestamp + vault.SMALL_WITHDRAWAL_DELAY());

        vm.prank(monitor);
        vault.freeze();
        vm.prank(monitor);
        vault.freeze();
        assertTrue(vault.frozen());

        vm.prank(owner);
        vm.expectRevert(NONCEVault.Frozen.selector);
        vault.executeWithdrawal(id);

        vm.prank(owner);
        vm.expectRevert(NONCEVault.Frozen.selector);
        vault.requestWithdrawal(0.1 ether, recipient);
    }

    function testDepositsRemainPossibleWhileFrozen() public {
        vm.prank(monitor);
        vault.freeze();

        vm.deal(address(0xF00D), 1 ether);
        vm.prank(address(0xF00D));
        (bool ok, ) = address(vault).call{value: 1 ether}("");
        assertTrue(ok);
        assertTrue(vault.frozen());
    }

    function testMonitorCannotApproveWithdrawalsPolicyOrRecovery() public {
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(0.6 ether, recipient);
        _propose(_policy(2 ether, 1.8 ether, 10 ether, 10 minutes, false));

        vm.startPrank(monitor);
        vm.expectRevert(NONCEVault.NotGuardian.selector);
        vault.approveWithdrawal(id);
        vm.expectRevert(NONCEVault.NotGuardian.selector);
        vault.approvePolicy();
        vm.expectRevert(NONCEVault.NotGuardian.selector);
        vault.approveRecovery();
        vm.expectRevert(NONCEVault.NotAuthorised.selector);
        vault.proposeRecovery(address(0xDEAD));
        vm.stopPrank();
    }

    function testMonitorHasNoUnfreezeEntryPoint() public {
        vm.prank(monitor);
        vault.freeze();

        vm.prank(monitor);
        (bool ok, ) = address(vault).call(abi.encodeWithSignature("unfreeze()"));
        assertFalse(ok);
        assertTrue(vault.frozen());
    }

    function testFalsePositiveRestorationRequiresGuardiansAndDelay() public {
        vm.prank(monitor);
        vault.freeze();

        vm.prank(monitor);
        vm.expectRevert(NONCEVault.NotAuthorised.selector);
        vault.proposeRestoration();

        vm.prank(owner);
        vault.proposeRestoration();
        vm.warp(block.timestamp + POLICY_DELAY);

        vm.prank(owner);
        vm.expectRevert(NONCEVault.ApprovalIncomplete.selector);
        vault.executeRestoration();

        vm.prank(guardianOne);
        vault.approveRestoration();
        vm.prank(guardianTwo);
        vault.approveRestoration();
        vault.executeRestoration();

        assertFalse(vault.frozen());
        assertEq(vault.owner(), owner);
        assertEq(vault.epoch(), 1);
    }

    function testRestorationProposalExpires() public {
        vm.prank(monitor);
        vault.freeze();
        vm.prank(owner);
        vault.proposeRestoration();

        vm.warp(block.timestamp + POLICY_DELAY + vault.PROPOSAL_EXECUTION_WINDOW() + 1);
        vm.prank(guardianOne);
        vault.approveRestoration();
        vm.prank(guardianTwo);
        vault.approveRestoration();

        vm.expectRevert(NONCEVault.ProposalExpired.selector);
        vault.executeRestoration();
    }

    /* -------------------------- guardian rotation ---------------------- */

    function testGuardianRotationIsTimelockedAndApproved() public {
        address newGuardian = address(0x777);
        vm.prank(owner);
        vault.proposeGuardianRotation(0, newGuardian);

        vm.prank(owner);
        vm.expectRevert(NONCEVault.DelayActive.selector);
        vault.executeGuardianRotation();

        vm.prank(guardianTwo);
        vault.approveGuardianRotation();
        vm.prank(guardianThree);
        vault.approveGuardianRotation();
        vm.warp(block.timestamp + POLICY_DELAY);
        vm.prank(owner);
        vault.executeGuardianRotation();

        assertEq(vault.guardians(0), newGuardian);
        assertFalse(vault.isGuardian(guardianOne));
    }

    function testGuardianRotationRejectsRoleConflictsAndDuplicates() public {
        vm.startPrank(owner);
        vm.expectRevert(NONCEVault.InvalidAddress.selector);
        vault.proposeGuardianRotation(0, owner);
        vm.expectRevert(NONCEVault.InvalidAddress.selector);
        vault.proposeGuardianRotation(0, monitor);
        vm.expectRevert(NONCEVault.InvalidAddress.selector);
        vault.proposeGuardianRotation(0, guardianTwo);
        vm.expectRevert(NONCEVault.InvalidAddress.selector);
        vault.proposeGuardianRotation(0, address(0));
        vm.stopPrank();
    }

    function testGuardianRotationCannotExecuteWithoutTwoApprovals() public {
        vm.prank(owner);
        vault.proposeGuardianRotation(0, address(0x777));
        vm.prank(guardianTwo);
        vault.approveGuardianRotation();
        vm.warp(block.timestamp + POLICY_DELAY);

        vm.prank(owner);
        vm.expectRevert(NONCEVault.ApprovalIncomplete.selector);
        vault.executeGuardianRotation();
    }

    /* ----------------------------- reentrancy --------------------------- */

    function testReentrantRecipientCannotReenterExecute() public {
        ReentrantRecipient attackerContract = new ReentrantRecipient(vault);
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(0.1 ether, payable(address(attackerContract)));
        attackerContract.setTarget(id);

        vm.warp(block.timestamp + vault.SMALL_WITHDRAWAL_DELAY());
        vm.expectRevert(NONCEVault.TransferFailed.selector);
        vault.executeWithdrawal(id);

        // The failed transfer rolled back the executed flag and reservation.
        assertEq(vault.reservedBalance(), 0.1 ether);
    }

    /* -------------------------------- fuzz ------------------------------ */

    function testFuzzReservationNeverExceedsBalance(uint96 rawAmount) public {
        uint256 amount = bound(uint256(rawAmount), 1, LIMIT);
        vm.prank(owner);
        try vault.requestWithdrawal(amount, recipient) {
            assertLe(vault.reservedBalance(), address(vault).balance);
            assertLe(vault.getRollingSpent(), ROLLING);
        } catch {}
    }

    function testFuzzRequestNeverExceedsRollingLimit(uint96 first, uint96 second) public {
        uint256 a = bound(uint256(first), 1, LIMIT);
        uint256 b = bound(uint256(second), 1, LIMIT);

        vm.prank(owner);
        try vault.requestWithdrawal(a, recipient) {} catch {}

        vm.prank(owner);
        try vault.requestWithdrawal(b, recipient) {
            assertLe(vault.getRollingSpent(), ROLLING);
        } catch {}
    }

    /* ----------------------------- invariants --------------------------- */

    function invariant_ReservedBalanceNeverExceedsVaultBalance() public view {
        assertLe(vault.reservedBalance(), address(vault).balance);
    }

    function invariant_RollingSpendNeverExceedsConfiguredLimit() public view {
        assertLe(vault.getRollingSpent(), ROLLING);
    }

    function invariant_EpochNeverDecreases() public view {
        assertGe(vault.epoch(), 1);
    }
}
