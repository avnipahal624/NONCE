// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NONCEVault} from "../NONCEVault.sol";

/**
 * Reference tests. They are written for Foundry and are NOT executed in this
 * build (no forge/solc available in the environment). Treat them as a starting
 * point for real invariant and adversarial testing, not as audit evidence.
 */
contract NONCEVaultTest is Test {
    NONCEVault internal vault;

    address internal owner = address(0xA11CE);
    address internal monitor = address(0xB0B);
    address internal guardianOne = address(0x601);
    address internal guardianTwo = address(0x602);
    address internal guardianThree = address(0x603);
    address internal recipient = address(0xCAFE);

    uint256 internal constant LIMIT = 5 ether;
    uint256 internal constant LARGE = 1 ether;
    uint64 internal constant WITHDRAWAL_DELAY = 30 minutes;
    uint64 internal constant RECOVERY_DELAY = 2 days;

    function setUp() public {
        address[3] memory guardians = [guardianOne, guardianTwo, guardianThree];
        vault = new NONCEVault(
            owner,
            monitor,
            guardians,
            LIMIT,
            LARGE,
            WITHDRAWAL_DELAY,
            RECOVERY_DELAY
        );
        vm.deal(address(vault), 10 ether);
    }

    function testSmallWithdrawalExecutesWithoutDelay() public {
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(0.5 ether, payable(recipient));

        vm.prank(owner);
        vault.executeWithdrawal(id);

        assertEq(recipient.balance, 0.5 ether);
        assertEq(address(vault).balance, 9.5 ether);
    }

    function testLargeWithdrawalNeedsDelayAndTwoGuardians() public {
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(2 ether, payable(recipient));

        vm.prank(owner);
        vm.expectRevert(NONCEVault.ApprovalIncomplete.selector);
        vault.executeWithdrawal(id);

        vm.prank(guardianOne);
        vault.approveWithdrawal(id);

        vm.prank(guardianOne);
        vm.expectRevert(NONCEVault.AlreadyApproved.selector);
        vault.approveWithdrawal(id);

        vm.prank(guardianTwo);
        vault.approveWithdrawal(id);

        vm.prank(owner);
        vm.expectRevert(NONCEVault.DelayActive.selector);
        vault.executeWithdrawal(id);

        vm.warp(block.timestamp + WITHDRAWAL_DELAY);
        vm.prank(owner);
        vault.executeWithdrawal(id);

        assertEq(recipient.balance, 2 ether);
    }

    function testMonitorCanFreezeButCannotMoveOrUnfreeze() public {
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(0.5 ether, payable(recipient));

        vm.prank(monitor);
        vault.freeze();
        assertTrue(vault.frozen());

        vm.prank(monitor);
        vm.expectRevert(NONCEVault.NotOwner.selector);
        vault.requestWithdrawal(0.1 ether, payable(monitor));

        vm.prank(owner);
        vm.expectRevert(NONCEVault.Frozen.selector);
        vault.executeWithdrawal(id);

        // There is deliberately no unfreeze entry point for the monitor.
        vm.prank(monitor);
        (bool ok, ) = address(vault).call(
            abi.encodeWithSignature("unfreeze()")
        );
        assertFalse(ok);
        assertTrue(vault.frozen());
    }

    function testRecoveryRequiresThresholdAndDelayThenReplacesSigner() public {
        vm.prank(owner);
        vault.freeze();

        address nextOwner = address(0xDEAD);
        vm.prank(owner);
        vault.proposeRecovery(nextOwner);

        vm.prank(guardianOne);
        vault.approveRecovery();

        vm.expectRevert(NONCEVault.ApprovalIncomplete.selector);
        vault.executeRecovery();

        vm.prank(guardianTwo);
        vault.approveRecovery();

        vm.expectRevert(NONCEVault.RecoveryDelayActive.selector);
        vault.executeRecovery();

        vm.warp(block.timestamp + RECOVERY_DELAY);
        vault.executeRecovery();

        assertEq(vault.owner(), nextOwner);
        assertFalse(vault.frozen());
        assertEq(vault.epoch(), 2);
    }

    function testRecoveryInvalidatesWithdrawalsQueuedBeforeCompromise() public {
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(0.5 ether, payable(recipient));

        vm.prank(monitor);
        vault.freeze();
        vm.prank(owner);
        vault.proposeRecovery(address(0xDEAD));

        vm.prank(guardianOne);
        vault.approveRecovery();
        vm.prank(guardianTwo);
        vault.approveRecovery();

        vm.warp(block.timestamp + RECOVERY_DELAY);
        vault.executeRecovery();

        vm.expectRevert(NONCEVault.AlreadyFinalised.selector);
        vault.executeWithdrawal(id);
    }

    function testAllowlistRejectsUnknownRecipient() public {
        vm.prank(owner);
        vault.setAllowlisted(recipient, true);
        vm.prank(owner);
        vault.setPolicy(LIMIT, LARGE, WITHDRAWAL_DELAY, true);

        vm.prank(owner);
        vm.expectRevert(NONCEVault.RecipientNotAllowed.selector);
        vault.requestWithdrawal(0.1 ether, payable(address(0xBAD)));

        vm.prank(owner);
        vault.requestWithdrawal(0.1 ether, payable(recipient));
    }

    function testInboundTransfersDoNotAlterState() public {
        vm.deal(address(0xF00D), 1 ether);
        vm.prank(address(0xF00D));
        (bool ok, ) = address(vault).call{value: 1 ether}("");
        assertTrue(ok);
        assertFalse(vault.frozen());
        assertEq(vault.epoch(), 1);
    }

    function testNonGuardianCannotApprove() public {
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(2 ether, payable(recipient));

        vm.prank(address(0xBAD));
        vm.expectRevert(NONCEVault.NotGuardian.selector);
        vault.approveWithdrawal(id);
    }
}
