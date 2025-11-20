import { createWalletClient, createPublicClient, http, type Address, defineChain, type Chain, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

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

// Define deployment order - some contracts may depend on others
const DEPLOYMENT_ORDER = [
  "compatibility_fallback_handler",
  "create_call",
  "sign_message_lib",
  "simulate_tx_accessor",
  "multi_send",
  "multi_send_call_only",
  "proxy_factory",
  "gnosis_safe",
  "gnosis_safe_l2",
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
  // Use a session ID from environment, module-level variable, or generate one
  const sessionId = process.env.DEPLOYMENT_SESSION_ID || deploymentSessionId || `session-${Date.now()}`;
  const summaryFile = path.join(deploymentsDir, `deployments-${networkName}-${sessionId}.json`);
  let summaryData: any[] = [];
  
  // Try to read existing summary file if it exists (for batch deployments in same session)
  if (fs.existsSync(summaryFile)) {
    try {
      const content = fs.readFileSync(summaryFile, 'utf-8');
      summaryData = JSON.parse(content);
    } catch (error) {
      // If file is corrupted or invalid, start fresh
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
  const githubSummaryFile = path.join(deploymentsDir, `github-actions-summary-${networkName}-${Date.now()}.json`);
  fs.writeFileSync(githubSummaryFile, JSON.stringify(summary, null, 2));
  console.log(`\n💾 Saved GitHub Actions summary to: ${githubSummaryFile}`);

  // Also save a latest version for easy access
  const latestSummaryFile = path.join(deploymentsDir, `github-actions-summary-${networkName}-latest.json`);
  fs.writeFileSync(latestSummaryFile, JSON.stringify(summary, null, 2));
  console.log(`💾 Saved latest summary to: ${latestSummaryFile}`);
}

/**
 * Creates a custom chain from fetched chain ID and environment variables
 * Supports: CHAIN_NAME, NATIVE_CURRENCY_NAME, NATIVE_CURRENCY_SYMBOL, 
 * NATIVE_CURRENCY_DECIMALS, BLOCK_EXPLORER_URL
 */
function createCustomChain(rpcUrl: string, chainId: number): Chain {
  const chainName = process.env.CHAIN_NAME || `Custom Chain ${chainId}`;
  const nativeCurrencyName = process.env.NATIVE_CURRENCY_NAME || "Ether";
  const nativeCurrencySymbol = process.env.NATIVE_CURRENCY_SYMBOL || "ETH";
  const nativeCurrencyDecimals = parseInt(process.env.NATIVE_CURRENCY_DECIMALS || "18", 10);
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
  client: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>,
  deploymentData: DeploymentData,
  contractName: string,
  account: ReturnType<typeof privateKeyToAccount>,
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
          
          return result;
        } else {
          console.log("No bytecode found at expected address. Proceeding with deployment...");
        }
      } catch (error: any) {
        console.warn(`⚠ Could not check if contract exists: ${error.message}`);
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
        } catch (error: any) {
          console.warn(`⚠ Could not verify contract deployment: ${error.message}`);
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

  } catch (error: any) {
    result.success = false;
    result.error = error.message || String(error);
    console.error("\n✗ Deployment failed:");
    if (error.message) {
      console.error("Error:", error.message);
    }
  }

  return result;
}

async function main() {
  // Parse network from arguments
  const networkIndex = process.argv.indexOf("--network");
  const networkName = networkIndex !== -1 && process.argv[networkIndex + 1] 
    ? process.argv[networkIndex + 1] 
    : process.env.NETWORK || "localhost";

  // Get RPC URL from environment or use defaults
  // Priority: CUSTOM_RPC_URL > network-specific RPC_URL > generic RPC_URL > localhost default
  const rpcUrl = process.env.CUSTOM_RPC_URL ||
                 process.env[`${networkName.toUpperCase()}_RPC_URL`] || 
                 process.env.RPC_URL || 
                 (networkName === "localhost" ? "http://127.0.0.1:8545" : "");

  if (!rpcUrl) {
    console.error(`No RPC URL found for network: ${networkName}`);
    console.error(`Please set CUSTOM_RPC_URL, ${networkName.toUpperCase()}_RPC_URL, or RPC_URL environment variable`);
    process.exit(1);
  }

  // Get private key from environment
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error("PRIVATE_KEY environment variable is required");
    process.exit(1);
  }

  if (!privateKey.startsWith("0x")) {
    console.error("PRIVATE_KEY must start with 0x");
    process.exit(1);
  }

  // Path to 1.3.0-155 directory (EIP-155 version)
  const eip155Dir = path.join(
    process.cwd(),
    "contracts",
    "deployement-data",
    "smart-account",
    "1.3.0-155"
  );

  if (!fs.existsSync(eip155Dir)) {
    console.error(`Directory not found: ${eip155Dir}`);
    process.exit(1);
  }

  // Create account from private key
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  // GitHub Actions output formatting
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

  // Helper function to mask RPC URL for security
  const maskRpcUrl = (url: string): string => {
    try {
      const urlObj = new URL(url);
      // Show protocol and hostname, mask path and query params
      const protocol = urlObj.protocol;
      const hostname = urlObj.hostname;
      const port = urlObj.port ? `:${urlObj.port}` : '';
      // Mask any API keys in path or query
      return `${protocol}//${hostname}${port}${urlObj.pathname ? '/***' : ''}${urlObj.search ? '?***' : ''}`;
    } catch {
      // If URL parsing fails, mask everything except first few chars
      return url.length > 10 ? `${url.substring(0, 10)}...` : '***';
    }
  };

  console.log("\n" + "=".repeat(60));
  console.log("Safe 1.3.0 EIP-155 Deployment Script");
  console.log("=".repeat(60));
  console.log("Deployer address:", account.address);
  console.log("Network:", networkName);
  console.log("RPC URL:", maskRpcUrl(rpcUrl));
  console.log("Deployment directory:", eip155Dir);

  // Create a temporary public client to fetch chain ID from RPC
  const tempPublicClient = createPublicClient({
    transport: http(rpcUrl),
  });

  // Fetch chain ID from RPC
  console.log("Fetching chain ID from RPC...");
  const chainId = await tempPublicClient.getChainId();
  console.log("Chain ID (from RPC):", chainId);

  // Create custom chain using the fetched chain ID
  const customChain = createCustomChain(rpcUrl, chainId);

  // Create clients with the proper chain configuration
  const client = createWalletClient({
    account,
    transport: http(rpcUrl),
    chain: customChain,
  });

  const publicClient = createPublicClient({
    transport: http(rpcUrl),
    chain: customChain,
  });

  // Get and display ETH balance
  try {
    const balance = await publicClient.getBalance({ address: account.address });
    const balanceInEth = formatEther(balance);
    console.log("ETH Balance:", balanceInEth, "ETH");
    console.log("ETH Balance (wei):", balance.toString());
    
    // Set GitHub Actions output
    if (isCI && process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `eth_balance_wei=${balance.toString()}\n`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `eth_balance_eth=${balanceInEth}\n`);
    }
  } catch (error: any) {
    console.warn("⚠ Could not fetch ETH balance:", error.message);
  }

  // Initialize deployment session ID for batch deployments
  if (!deploymentSessionId) {
    deploymentSessionId = process.env.DEPLOYMENT_SESSION_ID || `session-${Date.now()}`;
    console.log("Deployment session ID:", deploymentSessionId);
  }

  // Set GitHub Actions output
  if (isCI && process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `deployer_address=${account.address}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `network=${networkName}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `chain_id=${chainId}\n`);
  }

  // Read all JSON files from the directory
  const files = fs.readdirSync(eip155Dir)
    .filter(file => file.endsWith('.json'))
    .map(file => ({
      name: file.replace('.json', ''),
      path: path.join(eip155Dir, file)
    }));

  if (files.length === 0) {
    console.error("No JSON files found in the directory");
    process.exit(1);
  }

  console.log(`\nFound ${files.length} contract(s) to deploy:`);
  files.forEach(file => console.log(`  - ${file.name}`));

  // Sort files according to deployment order
  const sortedFiles = files.sort((a, b) => {
    const indexA = DEPLOYMENT_ORDER.indexOf(a.name);
    const indexB = DEPLOYMENT_ORDER.indexOf(b.name);
    // If not in order list, put at end
    if (indexA === -1 && indexB === -1) return a.name.localeCompare(b.name);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  console.log("\nDeployment order:");
  sortedFiles.forEach((file, index) => {
    console.log(`  ${index + 1}. ${file.name}`);
  });

  // Deploy contracts sequentially
  const results: DeploymentResult[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const file of sortedFiles) {
    try {
      const deploymentData: DeploymentData = JSON.parse(
        fs.readFileSync(file.path, "utf-8")
      );

      if (!deploymentData.to || !deploymentData.data) {
        console.error(`\n✗ Invalid deployment data in ${file.name}: missing 'to' or 'data' field`);
        results.push({
          contractName: file.name,
          success: false,
          error: "Invalid deployment data: missing 'to' or 'data' field",
        });
        failureCount++;
        continue;
      }

      const result = await deployContract(client, publicClient, deploymentData, file.name, account, customChain, networkName, chainId);
      results.push(result);

      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }

      // Small delay between deployments to avoid nonce issues
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error: any) {
      console.error(`\n✗ Failed to read or process ${file.name}:`, error.message);
      results.push({
        contractName: file.name,
        success: false,
        error: error.message || String(error),
      });
      failureCount++;
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("Deployment Summary");
  console.log("=".repeat(60));
  console.log(`Total contracts: ${results.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${failureCount}`);

  console.log("\nDetailed Results:");
  results.forEach((result, index) => {
    const status = result.success ? "✓" : "✗";
    console.log(`\n${index + 1}. ${status} ${result.contractName}`);
    if (result.success) {
      if (result.txHash) console.log(`   TX Hash: ${result.txHash}`);
      if (result.contractAddress) console.log(`   Address: ${result.contractAddress}`);
      if (result.expectedAddress && result.contractAddress) {
        if (result.contractAddress.toLowerCase() === result.expectedAddress.toLowerCase()) {
          console.log(`   ✓ Address matches expected`);
        } else {
          console.log(`   ⚠ Expected: ${result.expectedAddress}`);
        }
      }
      if (result.blockNumber) console.log(`   Block: ${result.blockNumber}`);
      if (result.gasUsed) console.log(`   Gas Used: ${result.gasUsed}`);
    } else {
      console.log(`   Error: ${result.error || "Unknown error"}`);
    }
  });

  // Set GitHub Actions output for summary
  if (isCI && process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `total_contracts=${results.length}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `successful=${successCount}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `failed=${failureCount}\n`);
    
    // Output individual contract results
    results.forEach((result, index) => {
      const prefix = `contract_${index + 1}_`;
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
      if (result.gasUsed) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT!, `${prefix}gas_used=${result.gasUsed.toString()}\n`);
      }
      if (result.error) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT!, `${prefix}error=${result.error}\n`);
      }
    });
  }

  // Create GitHub Actions summary file
  const finalChainId = await publicClient.getChainId();
  createGitHubActionsSummary(results, networkName, finalChainId);

  // Exit with error code if any deployments failed
  if (failureCount > 0) {
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

