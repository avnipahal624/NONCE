// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NONCEVault} from "../NONCEVault.sol";

/**
 * Read-only chain-state validation. The contract is deployed inside the fork,
 * not broadcast. Set BASE_SEPOLIA_RPC_URL to use a private provider; the public
 * endpoint is only a fallback for local validation.
 */
contract NONCEVaultForkTest is Test {
    function testForkBaseSepoliaDeployAndDeposit() public {
        string memory rpc = vm.envOr(
            "BASE_SEPOLIA_RPC_URL",
            string("https://sepolia.base.org")
        );
        vm.createSelectFork(rpc);

        assertEq(block.chainid, 84532, "not Base Sepolia");

        address owner = address(0xA11CE);
        address monitor = address(0xB0B);
        address[3] memory guardians = [
            address(0x601),
            address(0x602),
            address(0x603)
        ];

        NONCEVault vault = new NONCEVault(
            owner,
            monitor,
            guardians,
            0.1 ether,
            0.02 ether,
            0.3 ether,
            30 minutes,
            2 days,
            1 days
        );

        assertEq(vault.owner(), owner);
        assertEq(vault.monitor(), monitor);
        assertEq(vault.epoch(), 1);
        assertEq(vault.GUARDIAN_COUNT(), 3);

        vm.deal(address(this), 2 ether);
        (bool sent, ) = address(vault).call{value: 1 ether}("");
        assertTrue(sent, "deposit failed");
        assertEq(address(vault).balance, 1 ether);

        (
            uint256 perTransactionLimit,
            uint256 largeThreshold,
            uint256 rollingLimit,
            uint64 withdrawalDelay,
            bool allowlistOnly
        ) = vault.getPolicy();
        assertEq(perTransactionLimit, 0.1 ether);
        assertEq(largeThreshold, 0.02 ether);
        assertEq(rollingLimit, 0.3 ether);
        assertEq(withdrawalDelay, 30 minutes);
        assertFalse(allowlistOnly);
    }
}
