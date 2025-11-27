import { type Address, defineChain, type Chain, formatEther } from "viem";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Import shared utilities
import { validateEnvironment, validateRpcUrl } from "./utils/validation";
import {
  createDeploymentWalletClient,
  createDeploymentPublicClient,
  getDeploymentAccount,
  getChainId,
  wait,
  maskUrl,
  getNetworkName,
  isCI,
} from "./utils/deployment";
import { DEPLOYMENT_CONFIG, ENV_DEFAULTS } from "./utils/config";
import { ConfigurationError, ValidationError, TransactionError, formatError } from "./utils/errors";

dotenv.config();

interface DeploymentData {
  to: Address;
  data: `0x${string}`;
  expectedAddress?: Address;
  codeHash?: `0x${string}`;
}

interface DeploymentResult {
  contractName: string;
  success: boolean;
  txHash?: `0x${string}`;
  contractAddress?: Address;
  expectedAddress?: Address;
  blockNumber?: bigint;
  gasUsed?: bigint;
  error?: string;
}

// Module deployment order
const MODULE_DEPLOYMENT_ORDER = [
  "social-recovery",
  "allowance",
];

// Store deployment session ID for batch deployments
let deploymentSessionId: string | undefined;

/**
 * Saves deployment transaction data to a file
 */
function saveDeploymentTransaction(
  contractName: string,
  txHash: `0x${string}`,
  blockNumber: bigint,
  networkName: string,
  chainId: number | string,
  contractAddress?: Address,
  expectedAddress?: Address,
  gasUsed?: bigint
): void {
  const deploymentsDir = path.join(process.cwd(), "deployments");
  
  // Create deployments directory if it doesn't exist
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const deploymentData = {
    contractName,
    txHash,
    blockNumber: blockNumber.toString(),
    contractAddress: contractAddress || null,
    expectedAddress: expectedAddress || null,
    gasUsed: gasUsed ? gasUsed.toString() : null,
    timestamp,
    network: networkName,
    chainId: chainId.toString(),
  };

  // Save individual contract deployment file
  const contractFile = path.join(deploymentsDir, `${contractName}-${Date.now()}.json`);
  fs.writeFileSync(contractFile, JSON.stringify(deploymentData, null, 2));
  console.log(`\n💾 Saved deployment data to: ${contractFile}`);

  // Also append to a summary file (one per deployment session)
  const sessionId = process.env.DEPLOYMENT_SESSION_ID || deploymentSessionId || `session-${Date.now()}`;
  const summaryFile = path.join(deploymentsDir, `modules-deployments-${networkName}-${sessionId}.json`);
  let summaryData: any[] = [];
  
  // Try to read existing summary file if it exists (for batch deployments in same session)
  if (fs.existsSync(summaryFile)) {
    try {
      const content = fs.readFileSync(summaryFile, 'utf-8');
      summaryData = JSON.parse(content);
    } catch (error) {
      console.warn(`Warning: Could not read existing summary file, starting fresh.`);
      summaryData = [];
    }
  }

  summaryData.push(deploymentData);
  fs.writeFileSync(summaryFile, JSON.stringify(summaryData, null, 2));
  console.log(`💾 Updated summary file: ${summaryFile}`);
}

/**
 * Creates a GitHub Actions compatible deployment summary file
 */
function createGitHubActionsSummary(
  results: DeploymentResult[],
  networkName: string,
  chainId: string | number
): void {
  const deploymentsDir = path.join(process.cwd(), "deployments");
  
  // Create deployments directory if it doesn't exist
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const summary = {
    network: networkName,
    chainId: chainId.toString(),
    timestamp: new Date().toISOString(),
    totalContracts: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    deployments: results.map(result => ({
      contractName: result.contractName,
      success: result.success,
      txHash: result.txHash || null,
      blockNumber: result.blockNumber ? result.blockNumber.toString() : null,
      contractAddress: result.contractAddress || null,
      expectedAddress: result.expectedAddress || null,
      gasUsed: result.gasUsed ? result.gasUsed.toString() : null,
      error: result.error || null,
    })),
  };

  // Save GitHub Actions summary file
  const githubSummaryFile = path.join(deploymentsDir, `github-actions-modules-summary-${networkName}-${Date.now()}.json`);
  fs.writeFileSync(githubSummaryFile, JSON.stringify(summary, null, 2));
  console.log(`\n💾 Saved GitHub Actions summary to: ${githubSummaryFile}`);

  // Also save a latest version for easy access
  const latestSummaryFile = path.join(deploymentsDir, `github-actions-modules-summary-${networkName}-latest.json`);
  fs.writeFileSync(latestSummaryFile, JSON.stringify(summary, null, 2));
  console.log(`💾 Saved latest summary to: ${latestSummaryFile}`);
}

/**
 * Creates a custom chain from fetched chain ID and environment variables
 */
function createCustomChain(rpcUrl: string, chainId: number): Chain {
  const chainName = process.env.CHAIN_NAME || `Custom Chain ${chainId}`;
  const nativeCurrencyName = process.env.NATIVE_CURRENCY_NAME || ENV_DEFAULTS.NATIVE_CURRENCY_NAME;
  const nativeCurrencySymbol = process.env.NATIVE_CURRENCY_SYMBOL || ENV_DEFAULTS.NATIVE_CURRENCY_SYMBOL;
  const nativeCurrencyDecimals = parseInt(
    process.env.NATIVE_CURRENCY_DECIMALS || ENV_DEFAULTS.NATIVE_CURRENCY_DECIMALS,
    10
  );
  const blockExplorerUrl = process.env.BLOCK_EXPLORER_URL;

  const chain = defineChain({
    id: chainId,
    name: chainName,
    nativeCurrency: {
      name: nativeCurrencyName,
      symbol: nativeCurrencySymbol,
      decimals: nativeCurrencyDecimals,
    },
    rpcUrls: {
      default: {
        http: [rpcUrl],
      },
    },
    ...(blockExplorerUrl && {
      blockExplorers: {
        default: {
          name: `${chainName} Explorer`,
          url: blockExplorerUrl,
        },
      },
    }),
  });

  console.log(`Created custom chain: ${chainName} (ID: ${chainId})`);
  return chain;
}

async function deployContract(
  client: ReturnType<typeof createDeploymentWalletClient>,
  publicClient: ReturnType<typeof createDeploymentPublicClient>,
  deploymentData: DeploymentData,
  contractName: string,
  account: ReturnType<typeof getDeploymentAccount>,
  chain: Chain | undefined,
  networkName: string,
  chainId: number
): Promise<DeploymentResult> {
  const result: DeploymentResult = {
    contractName,
    success: false,
    expectedAddress: deploymentData.expectedAddress,
  };

  try {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Deploying: ${contractName}`);
    console.log(`${"=".repeat(60)}`);
    console.log("Factory address:", deploymentData.to);
    console.log("Data length:", deploymentData.data.length, "characters");
    if (deploymentData.expectedAddress) {
      console.log("Expected address:", deploymentData.expectedAddress);
    }

    // Check if contract is already deployed at expected address
    if (deploymentData.expectedAddress) {
      console.log("\nChecking if contract already exists at expected address...");
      
      try {
        const existingBytecode = await publicClient.getBytecode({
          address: deploymentData.expectedAddress,
        });

        if (existingBytecode && existingBytecode !== "0x") {
          console.log("✓ Contract already deployed at expected address:", deploymentData.expectedAddress);
          console.log("Bytecode length:", existingBytecode.length, "characters");
          console.log("Skipping deployment.");
          
          result.success = true;
          result.contractAddress = deploymentData.expectedAddress;
          result.expectedAddress = deploymentData.expectedAddress;
          
          // Try to get block number from the chain (contract creation block)
          try {
            // Get the first transaction to this address to find creation block
            // For deterministic deployments, we can't easily get this, so we'll skip it
            // The contract exists, which is what matters
          } catch (error) {
            // Ignore errors getting block number
          }
          
          return result;
        } else {
          console.log("No bytecode found at expected address. Proceeding with deployment...");
        }
      } catch (error: unknown) {
        console.warn(`⚠ Could not check if contract exists: ${formatError(error)}`);
        console.log("Proceeding with deployment...");
      }
    } else {
      console.log("\n⚠ No expected address provided - cannot verify if contract is already deployed");
      console.log("Proceeding with deployment...");
    }

    // Send transaction
    console.log("\nSending transaction...");
    const hash = await client.sendTransaction({
      account,
      to: deploymentData.to,
      data: deploymentData.data,
      chain: chain,
    });

    result.txHash = hash;
    console.log("Transaction hash:", hash);
    console.log("Waiting for confirmation...");

    // Wait for transaction receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    result.blockNumber = receipt.blockNumber;
    result.gasUsed = receipt.gasUsed;

    console.log("\n✓ Transaction confirmed!");
    console.log("Block number:", receipt.blockNumber.toString());
    console.log("Gas used:", receipt.gasUsed.toString());
    console.log("Status:", receipt.status === "success" ? "Success" : "Failed");

    if (receipt.status === "success") {
      result.success = true;

      // For Safe Singleton Factory deployments, the receipt doesn't include contractAddress
      // because the factory creates contracts deterministically. Use expectedAddress if available.
      if (deploymentData.expectedAddress) {
        // Verify the contract was actually deployed (or already existed)
        try {
          const deployedBytecode = await publicClient.getBytecode({
            address: deploymentData.expectedAddress,
          });

          if (deployedBytecode && deployedBytecode !== "0x") {
            // Contract exists at expected address
            result.contractAddress = deploymentData.expectedAddress;
            console.log("Deployed contract address:", deploymentData.expectedAddress);
            console.log("✓ Contract verified at expected address");
            
            // If receipt has contractAddress, verify it matches (shouldn't happen with factory, but check anyway)
            if (receipt.contractAddress) {
              if (receipt.contractAddress.toLowerCase() !== deploymentData.expectedAddress.toLowerCase()) {
                const warning = `⚠ Warning: Expected address ${deploymentData.expectedAddress} but got ${receipt.contractAddress}`;
                console.warn(warning);
              } else {
                console.log("✓ Address matches expected address!");
              }
            } else {
              console.log("✓ Using expected address (deterministic deployment via factory)");
            }
          } else {
            // Transaction succeeded but contract doesn't exist - this shouldn't happen with factory
            console.warn(`⚠ Warning: Transaction succeeded but no bytecode found at ${deploymentData.expectedAddress}`);
            console.warn("This might indicate the contract was already deployed and the transaction was a no-op");
            result.contractAddress = deploymentData.expectedAddress;
            result.success = true; // Still consider it success since contract exists (or should exist)
          }
        } catch (error: unknown) {
          console.warn(`⚠ Could not verify contract deployment: ${formatError(error)}`);
          // Still use expected address as contract address
          result.contractAddress = deploymentData.expectedAddress;
          console.log("Deployed contract address:", deploymentData.expectedAddress);
        }
      } else if (receipt.contractAddress) {
        // Fallback: use receipt address if no expected address is provided
        result.contractAddress = receipt.contractAddress;
        console.log("Deployed contract address:", receipt.contractAddress);
      } else {
        console.warn("⚠ No contract address available (neither expectedAddress nor receipt.contractAddress)");
      }

      // Save transaction data to file
      saveDeploymentTransaction(
        contractName,
        hash,
        receipt.blockNumber,
        networkName,
        chainId,
        result.contractAddress || deploymentData.expectedAddress,
        deploymentData.expectedAddress,
        receipt.gasUsed
      );
    } else {
      result.error = "Transaction failed";
    }

    if (receipt.logs && receipt.logs.length > 0) {
      console.log("\nTransaction logs:", receipt.logs.length);
    }

  } catch (error: unknown) {
    result.success = false;
    result.error = formatError(error);
    console.error("\n✗ Deployment failed:");
    console.error("Error:", result.error);
    
    // Provide more context for specific error types
    if (error instanceof TransactionError) {
      console.error(`Transaction hash: ${error.txHash || "N/A"}`);
    } else if (error instanceof ValidationError) {
      console.error(`Field: ${error.field || "N/A"}`);
    }
  }

  return result;
}

async function main() {
  try {
    // Validate environment variables early
    validateEnvironment();

    // Parse network from arguments
    const networkIndex = process.argv.indexOf("--network");
    const networkName =
      networkIndex !== -1 && process.argv[networkIndex + 1]
        ? process.argv[networkIndex + 1]
        : getNetworkName();

    // Get RPC URL from environment
    const rpcUrl =
      process.env.CUSTOM_RPC_URL ||
      process.env[`${networkName.toUpperCase()}_RPC_URL`] ||
      process.env.RPC_URL ||
      (networkName === "localhost" ? "http://127.0.0.1:8545" : "");

    if (!rpcUrl) {
      throw new ConfigurationError(
        `No RPC URL found for network: ${networkName}\n` +
        `Please set CUSTOM_RPC_URL, ${networkName.toUpperCase()}_RPC_URL, or RPC_URL environment variable`
      );
    }

    // Validate RPC URL format
    validateRpcUrl(rpcUrl);

    // Path to modules directory
    const modulesDir = path.join(
      process.cwd(),
      "contracts",
      "deployement-data",
      "module"
    );

    if (!fs.existsSync(modulesDir)) {
      console.error(`Directory not found: ${modulesDir}`);
      process.exit(1);
    }

    // Get deployment account (validates private key)
    const account = getDeploymentAccount();

    console.log("\n" + "=".repeat(60));
    console.log("Safe Modules Deployment Script");
    console.log("=".repeat(60));
    console.log("Deployer address:", account.address);
    console.log("Network:", networkName);
    console.log("RPC URL:", maskUrl(rpcUrl));
    console.log("Modules directory:", modulesDir);

    // Fetch chain ID from RPC using utility function
    console.log("Fetching chain ID from RPC...");
    const chainId = await getChainId(rpcUrl);
    console.log("Chain ID (from RPC):", chainId);

    // Create custom chain using the fetched chain ID
    const customChain = createCustomChain(rpcUrl, chainId);

    // Create clients using utility functions
    const client = createDeploymentWalletClient(rpcUrl, customChain);
    const publicClient = createDeploymentPublicClient(rpcUrl, customChain);

    // Get and display ETH balance
    try {
      const balance = await publicClient.getBalance({ address: account.address });
      const balanceInEth = formatEther(balance);
      console.log("ETH Balance:", balanceInEth, "ETH");
      console.log("ETH Balance (wei):", balance.toString());
      
      // Set GitHub Actions output
      if (isCI() && process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `eth_balance_wei=${balance.toString()}\n`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `eth_balance_eth=${balanceInEth}\n`);
      }
    } catch (error: unknown) {
      console.warn("⚠ Could not fetch ETH balance:", formatError(error));
    }

    // Load module deployment data
    const moduleDeployments: { [key: string]: DeploymentData } = {};

    for (const moduleName of MODULE_DEPLOYMENT_ORDER) {
      const modulePath = path.join(modulesDir, moduleName);
      
      if (!fs.existsSync(modulePath)) {
        console.warn(`⚠ Module directory not found: ${modulePath}`);
        continue;
      }

      // Find JSON files in the module directory
      const files = fs.readdirSync(modulePath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      if (jsonFiles.length === 0) {
        console.warn(`⚠ No JSON files found in ${modulePath}`);
        continue;
      }

      // Use the first JSON file found (assuming one version per module)
      const jsonFile = path.join(modulePath, jsonFiles[0]);
      const moduleData = JSON.parse(fs.readFileSync(jsonFile, 'utf-8')) as DeploymentData;
      
      // Use module name and version as contract name
      const version = jsonFiles[0].replace('.json', '');
      const contractName = `${moduleName}-${version}`;
      
      moduleDeployments[contractName] = moduleData;
      console.log(`\n✓ Loaded ${contractName}:`);
      console.log(`  Factory: ${moduleData.to}`);
      if (moduleData.expectedAddress) {
        console.log(`  Expected address: ${moduleData.expectedAddress}`);
      }
    }

    if (Object.keys(moduleDeployments).length === 0) {
      console.error("No module deployment data found!");
      process.exit(1);
    }

    console.log(`\n📦 Found ${Object.keys(moduleDeployments).length} module(s) to deploy`);

    // Deploy modules in order
    const results: DeploymentResult[] = [];
    
    for (const contractName of Object.keys(moduleDeployments)) {
      const deploymentData = moduleDeployments[contractName];
      const result = await deployContract(
        client,
        publicClient,
        deploymentData,
        contractName,
        account,
        customChain,
        networkName,
        chainId
      );
      results.push(result);

      // Small delay between deployments
      if (result.success) {
        await wait(DEPLOYMENT_CONFIG.delays.betweenDeployments);
      }
    }

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("Deployment Summary");
    console.log("=".repeat(60));
    console.log(`Total modules: ${results.length}`);
    console.log(`Successful: ${results.filter(r => r.success).length}`);
    console.log(`Failed: ${results.filter(r => !r.success).length}`);

    results.forEach(result => {
      if (result.success) {
        console.log(`\n✓ ${result.contractName}:`);
        console.log(`  Address: ${result.contractAddress || result.expectedAddress || 'N/A'}`);
        console.log(`  TX Hash: ${result.txHash}`);
        console.log(`  Block: ${result.blockNumber?.toString() || 'N/A'}`);
      } else {
        console.log(`\n✗ ${result.contractName}:`);
        console.log(`  Error: ${result.error || 'Unknown error'}`);
      }
    });

    // Create GitHub Actions summary
    createGitHubActionsSummary(results, networkName, chainId);

    // Set GitHub Actions outputs
    if (isCI() && process.env.GITHUB_OUTPUT) {
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `deployment_successful=${successful === results.length}\n`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `deployment_successful_count=${successful}\n`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `deployment_failed_count=${failed}\n`);
      
      // Add individual module results
      results.forEach((result, index) => {
        const prefix = `module_${index + 1}_`;
        fs.appendFileSync(process.env.GITHUB_OUTPUT!, `${prefix}name=${result.contractName}\n`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT!, `${prefix}success=${result.success}\n`);
        if (result.txHash) {
          fs.appendFileSync(process.env.GITHUB_OUTPUT!, `${prefix}tx_hash=${result.txHash}\n`);
        }
        if (result.blockNumber) {
          fs.appendFileSync(process.env.GITHUB_OUTPUT!, `${prefix}block_number=${result.blockNumber.toString()}\n`);
        }
        if (result.contractAddress) {
          fs.appendFileSync(process.env.GITHUB_OUTPUT!, `${prefix}address=${result.contractAddress}\n`);
        }
        if (result.error) {
          fs.appendFileSync(process.env.GITHUB_OUTPUT!, `${prefix}error=${result.error.replace(/\n/g, ' ')}\n`);
        }
      });
    }

    // Exit with error code if any deployment failed
    if (results.some(r => !r.success)) {
      process.exit(1);
    }
  } catch (error: unknown) {
    console.error("\n✗ Fatal error:");
    console.error(formatError(error));

    if (error instanceof ConfigurationError || error instanceof ValidationError) {
      console.error("\nPlease check your environment variables and configuration.");
    }

    if (isCI() && process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `fatal_error=true\n`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `error=${formatError(error).replace(/\n/g, ' ')}\n`);
    }

    process.exit(1);
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Unhandled error:", formatError(error));
      process.exit(1);
    });
}

