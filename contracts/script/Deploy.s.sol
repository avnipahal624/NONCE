// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {NONCEVault} from "../NONCEVault.sol";

/**
 * Testnet deployment script. Read contracts/README.md before running it.
 * Private keys are read from the environment and never committed.
 */
contract DeployNONCEVault is Script {
    function run() external returns (NONCEVault vault) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address vaultOwner = vm.envAddress("VAULT_OWNER");
        address monitor = vm.envAddress("NONCE_MONITOR");

        address[3] memory guardians = [
            vm.envAddress("GUARDIAN_ONE"),
            vm.envAddress("GUARDIAN_TWO"),
            vm.envAddress("GUARDIAN_THREE")
        ];

        uint256 perTransactionLimit = vm.envUint("PER_TX_LIMIT_WEI");
        uint256 largeThreshold = vm.envUint("LARGE_THRESHOLD_WEI");
        uint64 withdrawalDelay = uint64(vm.envUint("WITHDRAWAL_DELAY_SECONDS"));
        uint64 recoveryDelay = uint64(vm.envUint("RECOVERY_DELAY_SECONDS"));

        console2.log("Deploying NONCEVault to chain", block.chainid);
        console2.log("Vault owner", vaultOwner);
        console2.log("Monitor (freeze only)", monitor);

        vm.startBroadcast(deployerKey);
        vault = new NONCEVault(
            vaultOwner,
            monitor,
            guardians,
            perTransactionLimit,
            largeThreshold,
            withdrawalDelay,
            recoveryDelay
        );
        vm.stopBroadcast();

        console2.log("NONCEVault deployed at", address(vault));
    }
}
