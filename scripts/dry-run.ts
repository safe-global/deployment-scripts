/**
 * Dry-run script to validate deployment configuration and utilities
 * Tests all utilities without actually deploying contracts
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Import all utilities
import { validateEnvironment, validateRpcUrl, validatePrivateKey, validateChainId, validateDeployTargets } from "./utils/validation";
import {
  createDeploymentWalletClient,
  createDeploymentPublicClient,
  getDeploymentAccount,
  getChainId,
  wait,
  maskUrl,
  formatAddress,
  getNetworkName,
  isCI,
} from "./utils/deployment";
import { DEPLOYMENT_CONFIG, ENV_DEFAULTS, VALID_DEPLOY_TARGETS } from "./utils/config";
import { ConfigurationError, ValidationError, NetworkError, formatError } from "./utils/errors";
import { estimateDeploymentGas, formatGas, formatGasCost, logGasEstimate } from "./utils/gas";
import { retry, retryWithFixedDelay } from "./utils/retry";

dotenv.config();

interface TestResult {
  name: string;
  success: boolean;
  message: string;
  error?: string;
}

const results: TestResult[] = [];

function addResult(name: string, success: boolean, message: string, error?: string) {
  results.push({ name, success, message, error });
  const icon = success ? "✅" : "❌";
  console.log(`${icon} ${name}: ${message}`);
  if (error) {
    console.log(`   Error: ${error}`);
  }
}

async function testValidation() {
  console.log("\n" + "=".repeat(60));
  console.log("Testing Validation Utilities");
  console.log("=".repeat(60));

  // Test RPC URL validation
  try {
    validateRpcUrl("https://example.com/rpc");
    addResult("RPC URL Validation (valid)", true, "Valid RPC URL accepted");
  } catch (error) {
    addResult("RPC URL Validation (valid)", false, "Failed", formatError(error));
  }

  try {
    validateRpcUrl("invalid-url");
    addResult("RPC URL Validation (invalid)", false, "Should have rejected invalid URL");
  } catch (error) {
    addResult("RPC URL Validation (invalid)", true, "Invalid URL correctly rejected");
  }

  // Test private key validation
  const validKey = "0x" + "1".repeat(64);
  try {
    validatePrivateKey(validKey);
    addResult("Private Key Validation (valid)", true, "Valid private key accepted");
  } catch (error) {
    addResult("Private Key Validation (valid)", false, "Failed", formatError(error));
  }

  try {
    validatePrivateKey("invalid");
    addResult("Private Key Validation (invalid)", false, "Should have rejected invalid key");
  } catch (error) {
    addResult("Private Key Validation (invalid)", true, "Invalid key correctly rejected");
  }

  // Test chain ID validation
  try {
    validateChainId(1);
    addResult("Chain ID Validation (valid)", true, "Valid chain ID accepted");
  } catch (error) {
    addResult("Chain ID Validation (valid)", false, "Failed", formatError(error));
  }

  try {
    validateChainId(-1);
    addResult("Chain ID Validation (invalid)", false, "Should have rejected invalid chain ID");
  } catch (error) {
    addResult("Chain ID Validation (invalid)", true, "Invalid chain ID correctly rejected");
  }

  // Test deployment targets validation
  try {
    const targets = validateDeployTargets("1.5.0,modules,erc20", VALID_DEPLOY_TARGETS as readonly string[]);
    if (targets.length === 3) {
      addResult("Deploy Targets Validation (valid)", true, `Valid targets parsed: ${targets.join(", ")}`);
    } else {
      addResult("Deploy Targets Validation (valid)", false, `Expected 3 targets, got ${targets.length}`);
    }
  } catch (error) {
    addResult("Deploy Targets Validation (valid)", false, "Failed", formatError(error));
  }

  try {
    validateDeployTargets("invalid,1.5.0", VALID_DEPLOY_TARGETS);
    addResult("Deploy Targets Validation (invalid)", false, "Should have rejected invalid target");
  } catch (error) {
    addResult("Deploy Targets Validation (invalid)", true, "Invalid target correctly rejected");
  }
}

async function testConfiguration() {
  console.log("\n" + "=".repeat(60));
  console.log("Testing Configuration");
  console.log("=".repeat(60));

  // Test config values
  if (DEPLOYMENT_CONFIG.delays.betweenDeployments > 0) {
    addResult("Config: Delays", true, `Between deployments: ${DEPLOYMENT_CONFIG.delays.betweenDeployments}ms`);
  } else {
    addResult("Config: Delays", false, "Invalid delay configuration");
  }

  if (DEPLOYMENT_CONFIG.gas.defaultLimit > 0) {
    addResult("Config: Gas", true, `Default limit: ${DEPLOYMENT_CONFIG.gas.defaultLimit}`);
  } else {
    addResult("Config: Gas", false, "Invalid gas configuration");
  }

  if (DEPLOYMENT_CONFIG.retries.maxAttempts > 0) {
    addResult("Config: Retries", true, `Max attempts: ${DEPLOYMENT_CONFIG.retries.maxAttempts}`);
  } else {
    addResult("Config: Retries", false, "Invalid retry configuration");
  }

  if (VALID_DEPLOY_TARGETS.length > 0) {
    addResult("Config: Valid Targets", true, `Targets: ${VALID_DEPLOY_TARGETS.join(", ")}`);
  } else {
    addResult("Config: Valid Targets", false, "No valid targets defined");
  }
}

async function testDeploymentUtilities() {
  console.log("\n" + "=".repeat(60));
  console.log("Testing Deployment Utilities");
  console.log("=".repeat(60));

  // Test URL masking
  const masked = maskUrl("https://api.example.com/v1/rpc?key=secret");
  if (masked.includes("***")) {
    addResult("URL Masking", true, `Masked URL: ${masked}`);
  } else {
    addResult("URL Masking", false, "URL not properly masked");
  }

  // Test address formatting
  const address = "0x1234567890123456789012345678901234567890" as const;
  const formatted = formatAddress(address);
  if (formatted.includes("...")) {
    addResult("Address Formatting", true, `Formatted: ${formatted}`);
  } else {
    addResult("Address Formatting", false, "Address not properly formatted");
  }

  // Test network name
  const networkName = getNetworkName();
  addResult("Network Name", true, `Network: ${networkName}`);

  // Test CI detection
  const ci = isCI();
  addResult("CI Detection", true, `Running in CI: ${ci}`);

  // Test wait function
  const start = Date.now();
  await wait(100);
  const elapsed = Date.now() - start;
  if (elapsed >= 90 && elapsed <= 150) {
    addResult("Wait Function", true, `Waited ~${elapsed}ms (expected ~100ms)`);
  } else {
    addResult("Wait Function", false, `Waited ${elapsed}ms (expected ~100ms)`);
  }
}

async function testRetryLogic() {
  console.log("\n" + "=".repeat(60));
  console.log("Testing Retry Logic");
  console.log("=".repeat(60));

  // Test successful retry (should succeed on first attempt)
  try {
    let attempts = 0;
    const result = await retry(
      async () => {
        attempts++;
        return "success";
      },
      { maxAttempts: 3 }
    );
    if (result === "success" && attempts === 1) {
      addResult("Retry: Success on First Attempt", true, `Result: ${result}, Attempts: ${attempts}`);
    } else {
      addResult("Retry: Success on First Attempt", false, `Unexpected result`);
    }
  } catch (error) {
    addResult("Retry: Success on First Attempt", false, "Failed", formatError(error));
  }

  // Test retry with failure (should retry and eventually fail)
  try {
    let attempts = 0;
    await retry(
      async () => {
        attempts++;
        throw new Error("Always fails");
      },
      { maxAttempts: 2, initialDelayMs: 10 }
    );
    addResult("Retry: Failure Handling", false, "Should have thrown error");
  } catch (error) {
    addResult("Retry: Failure Handling", true, "Correctly failed after retries");
  }

  // Test retry with fixed delay
  try {
    let attempts = 0;
    const start = Date.now();
    await retryWithFixedDelay(
      async () => {
        attempts++;
        if (attempts < 2) {
          throw new NetworkError("Transient error");
        }
        return "success";
      },
      3,
      50
    );
    const elapsed = Date.now() - start;
    if (elapsed >= 40 && elapsed <= 100) {
      addResult("Retry: Fixed Delay", true, `Succeeded after ${attempts} attempts, ~${elapsed}ms`);
    } else {
      addResult("Retry: Fixed Delay", false, `Unexpected timing: ${elapsed}ms`);
    }
  } catch (error) {
    addResult("Retry: Fixed Delay", false, "Failed", formatError(error));
  }
}

async function testGasEstimation() {
  console.log("\n" + "=".repeat(60));
  console.log("Testing Gas Estimation");
  console.log("=".repeat(60));

  // Test gas formatting
  const gas = 1000000n;
  const formatted = formatGas(gas);
  if (formatted === "1000000") {
    addResult("Gas Formatting", true, `Formatted: ${formatted}`);
  } else {
    addResult("Gas Formatting", false, `Expected "1000000", got "${formatted}"`);
  }

  // Test cost formatting
  const cost = 20000000000000000n; // 0.02 ETH
  const costFormatted = formatGasCost(cost);
  if (costFormatted.includes("ETH")) {
    addResult("Cost Formatting", true, `Formatted: ${costFormatted}`);
  } else {
    addResult("Cost Formatting", false, `Unexpected format: ${costFormatted}`);
  }

  // Test gas estimation (mock)
  try {
    const estimate = await estimateDeploymentGas(
      async () => 1500000n,
      undefined // No public client for dry run
    );
    if (estimate.gas === 1500000n) {
      addResult("Gas Estimation", true, `Estimated gas: ${formatGas(estimate.gas)}`);
    } else {
      addResult("Gas Estimation", false, `Expected 1500000, got ${estimate.gas}`);
    }
  } catch (error) {
    addResult("Gas Estimation", false, "Failed", formatError(error));
  }
}

async function testErrorHandling() {
  console.log("\n" + "=".repeat(60));
  console.log("Testing Error Handling");
  console.log("=".repeat(60));

  // Test error formatting
  try {
    throw new ValidationError("Test error", "testField");
  } catch (error) {
    const formatted = formatError(error);
    if (formatted.includes("VALIDATION_ERROR") && formatted.includes("Test error")) {
      addResult("Error Formatting", true, "Error correctly formatted");
    } else {
      addResult("Error Formatting", false, `Unexpected format: ${formatted}`);
    }
  }

  // Test error types
  const configError = new ConfigurationError("Config error");
  if (configError instanceof ConfigurationError && configError.code === "CONFIGURATION_ERROR") {
    addResult("Error Types", true, "Error types work correctly");
  } else {
    addResult("Error Types", false, "Error types not working");
  }
}

async function testFileStructure() {
  console.log("\n" + "=".repeat(60));
  console.log("Testing File Structure");
  console.log("=".repeat(60));

  // Check deployment data directories
  const deploymentDataPath = path.join(process.cwd(), DEPLOYMENT_CONFIG.paths.deploymentData);
  if (fs.existsSync(deploymentDataPath)) {
    addResult("Deployment Data Directory", true, `Found: ${deploymentDataPath}`);
  } else {
    addResult("Deployment Data Directory", false, `Not found: ${deploymentDataPath}`);
  }

  // Check for specific contract files
  const erc20Path = path.join(deploymentDataPath, "tokens", "erc20.json");
  if (fs.existsSync(erc20Path)) {
    addResult("ERC20 Contract File", true, `Found: ${erc20Path}`);
  } else {
    addResult("ERC20 Contract File", false, `Not found: ${erc20Path}`);
  }

  const nftPath = path.join(deploymentDataPath, "tokens", "nft.json");
  if (fs.existsSync(nftPath)) {
    addResult("NFT Contract File", true, `Found: ${nftPath}`);
  } else {
    addResult("NFT Contract File", false, `Not found: ${nftPath}`);
  }

  // Check modules directory
  const modulesPath = path.join(deploymentDataPath, "module");
  if (fs.existsSync(modulesPath)) {
    const modules = fs.readdirSync(modulesPath);
    addResult("Modules Directory", true, `Found ${modules.length} module(s)`);
  } else {
    addResult("Modules Directory", false, `Not found: ${modulesPath}`);
  }
}

async function testEnvironmentValidation() {
  console.log("\n" + "=".repeat(60));
  console.log("Testing Environment Validation");
  console.log("=".repeat(60));

  // Save original env vars
  const originalPrivateKey = process.env.PRIVATE_KEY;
  const originalRpcUrl = process.env.CUSTOM_RPC_URL;

  // Test with missing PRIVATE_KEY
  delete process.env.PRIVATE_KEY;
  try {
    validateEnvironment();
    addResult("Environment: Missing PRIVATE_KEY", false, "Should have failed");
  } catch (error) {
    addResult("Environment: Missing PRIVATE_KEY", true, "Correctly detected missing PRIVATE_KEY");
  }

  // Test with missing CUSTOM_RPC_URL
  process.env.PRIVATE_KEY = "0x" + "1".repeat(64);
  delete process.env.CUSTOM_RPC_URL;
  try {
    validateEnvironment();
    addResult("Environment: Missing CUSTOM_RPC_URL", false, "Should have failed");
  } catch (error) {
    addResult("Environment: Missing CUSTOM_RPC_URL", true, "Correctly detected missing CUSTOM_RPC_URL");
  }

  // Restore original env vars
  if (originalPrivateKey) process.env.PRIVATE_KEY = originalPrivateKey;
  if (originalRpcUrl) process.env.CUSTOM_RPC_URL = originalRpcUrl;

  // Test with valid environment (if available)
  if (originalPrivateKey && originalRpcUrl) {
    try {
      validateEnvironment();
      addResult("Environment: Valid Configuration", true, "All required env vars present");
    } catch (error) {
      addResult("Environment: Valid Configuration", false, "Failed", formatError(error));
    }
  } else {
    addResult("Environment: Valid Configuration", true, "Skipped (env vars not set)");
  }
}

async function testAccountCreation() {
  console.log("\n" + "=".repeat(60));
  console.log("Testing Account Creation");
  console.log("=".repeat(60));

  // Save original
  const originalPrivateKey = process.env.PRIVATE_KEY;

  // Test with invalid key
  process.env.PRIVATE_KEY = "invalid";
  try {
    getDeploymentAccount();
    addResult("Account: Invalid Key", false, "Should have failed");
  } catch (error) {
    addResult("Account: Invalid Key", true, "Correctly rejected invalid key");
  }

  // Test with valid key format
  process.env.PRIVATE_KEY = "0x" + "1".repeat(64);
  try {
    const account = getDeploymentAccount();
    if (account && account.address) {
      addResult("Account: Valid Key", true, `Account created: ${formatAddress(account.address)}`);
    } else {
      addResult("Account: Valid Key", false, "Account created but missing address");
    }
  } catch (error) {
    addResult("Account: Valid Key", false, "Failed", formatError(error));
  }

  // Restore original
  if (originalPrivateKey) process.env.PRIVATE_KEY = originalPrivateKey;
}

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("DRY RUN: Testing Deployment Utilities");
  console.log("=".repeat(60));
  console.log("This script validates all utilities without deploying contracts.");
  console.log("=".repeat(60));

  try {
    await testValidation();
    await testConfiguration();
    await testDeploymentUtilities();
    await testRetryLogic();
    await testGasEstimation();
    await testErrorHandling();
    await testFileStructure();
    await testEnvironmentValidation();
    await testAccountCreation();

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("DRY RUN SUMMARY");
    console.log("=".repeat(60));

    const total = results.length;
    const passed = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

    if (failed > 0) {
      console.log("\nFailed Tests:");
      results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`  ❌ ${r.name}: ${r.message}`);
          if (r.error) {
            console.log(`     ${r.error}`);
          }
        });
    }

    console.log("\n" + "=".repeat(60));

    // Exit with error code if any tests failed
    if (failed > 0) {
      console.log("⚠️  Some tests failed. Please review the output above.");
      process.exit(1);
    } else {
      console.log("✅ All tests passed! Utilities are working correctly.");
      process.exit(0);
    }
  } catch (error: unknown) {
    console.error("\n✗ Fatal error during dry run:");
    console.error(formatError(error));
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Unhandled error:", formatError(error));
    process.exit(1);
  });

