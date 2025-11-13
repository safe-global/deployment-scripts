import { createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

interface DeploymentData {
  to: Address;
  data: `0x${string}`;
  expected?: Address;
  codeHash?: `0x${string}`;
}

async function main() {
  // Get file path from command line arguments
  const fileArg = process.argv.find((arg, index) => 
    index > 0 && arg.endsWith('.json')
  );
  
  if (!fileArg) {
    console.error("Usage: tsx scripts/send-deployment-tx.ts <path-to-deployment-data.json> [--network <network>]");
    console.error("Example: tsx scripts/send-deployment-tx.ts contracts/deployement-data/module/social-recovery/0.1.0.json --network sepolia");
    process.exit(1);
  }

  // Parse network from arguments
  const networkIndex = process.argv.indexOf("--network");
  const networkName = networkIndex !== -1 && process.argv[networkIndex + 1] 
    ? process.argv[networkIndex + 1] 
    : process.env.NETWORK || "localhost";

  // Get RPC URL from environment or use defaults
  const rpcUrl = process.env[`${networkName.toUpperCase()}_RPC_URL`] || 
                 process.env.RPC_URL || 
                 (networkName === "localhost" ? "http://127.0.0.1:8545" : "");

  if (!rpcUrl) {
    console.error(`No RPC URL found for network: ${networkName}`);
    console.error(`Please set ${networkName.toUpperCase()}_RPC_URL or RPC_URL environment variable`);
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

  // Resolve deployment data file path
  let deploymentDataPath: string;
  if (fs.existsSync(fileArg)) {
    deploymentDataPath = fileArg;
  } else {
    deploymentDataPath = path.join(process.cwd(), fileArg);
  }

  if (!fs.existsSync(deploymentDataPath)) {
    console.error(`Deployment data file not found: ${deploymentDataPath}`);
    process.exit(1);
  }

  console.log("Reading deployment data from:", deploymentDataPath);
  const deploymentData: DeploymentData = JSON.parse(
    fs.readFileSync(deploymentDataPath, "utf-8")
  );

  if (!deploymentData.to || !deploymentData.data) {
    console.error("Invalid deployment data: missing 'to' or 'data' field");
    process.exit(1);
  }

  // Create account from private key
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  // Create wallet client
  const client = createWalletClient({
    account,
    transport: http(rpcUrl),
    chain: networkName as Chain,
  });

  // GitHub Actions output formatting
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  
  console.log("\n=== Deployment Transaction Details ===");
  console.log("Deployer address:", account.address);
  console.log("Network:", networkName);
  if (isCI) {
    // Mask RPC URL in CI for security
    const maskedRpc = rpcUrl.length > 20 ? `${rpcUrl.substring(0, 20)}...` : rpcUrl;
    console.log("RPC URL:", maskedRpc);
  } else {
    console.log("RPC URL:", rpcUrl);
  }
  console.log("Factory address:", deploymentData.to);
  console.log("Data length:", deploymentData.data.length, "characters");
  if (deploymentData.expected) {
    console.log("Expected address:", deploymentData.expected);
  }
  
  // Set GitHub Actions output
  if (isCI && process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `deployer_address=${account.address}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `network=${networkName}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `factory_address=${deploymentData.to}\n`);
    if (deploymentData.expected) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `expected_address=${deploymentData.expected}\n`);
    }
  }

  try {
    // Get chain ID
    const chainId = await client.getChainId();
    console.log("Chain ID:", chainId);

    // Get current nonce
    const nonce = await client.getTransactionCount({ address: account.address });
    console.log("Current nonce:", nonce);

    // Get gas price
    const gasPrice = await client.getGasPrice();
    console.log("Gas price:", gasPrice.toString(), "wei");

    // Estimate gas (optional, may fail for some transactions)
    let gasLimit: bigint;
    try {
      gasLimit = await client.estimateGas({
        to: deploymentData.to,
        data: deploymentData.data,
        account,
      });
      console.log("Estimated gas:", gasLimit.toString());
    } catch (error) {
      console.log("Gas estimation failed, using default:", error);
      // Use a high gas limit for deployment transactions
      gasLimit = BigInt(5000000);
    }

    // Send transaction
    console.log("\nSending transaction...");
    const hash = await client.sendTransaction({
      chain: networkName,
      to: deploymentData.to,
      data: deploymentData.data,
    });

    console.log("Transaction hash:", hash);
    console.log("Waiting for confirmation...");

    // Wait for transaction receipt
    const publicClient = client.extend({ transport: http(rpcUrl) });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    console.log("\n✓ Transaction confirmed!");
    console.log("Block number:", receipt.blockNumber.toString());
    console.log("Gas used:", receipt.gasUsed.toString());
    console.log("Status:", receipt.status === "success" ? "Success" : "Failed");

    if (deploymentData.expected && receipt.contractAddress) {
      console.log("Deployed contract address:", receipt.contractAddress);
      if (receipt.contractAddress.toLowerCase() !== deploymentData.expected.toLowerCase()) {
        const warning = `⚠ Warning: Expected address ${deploymentData.expected} but got ${receipt.contractAddress}`;
        console.warn(warning);
        if (isCI) {
          console.log(`::warning::${warning}`);
        }
      } else {
        console.log("✓ Address matches expected address!");
      }
    }
    
    // Set GitHub Actions output for transaction details
    if (isCI && process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `tx_hash=${hash}\n`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `block_number=${receipt.blockNumber.toString()}\n`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `gas_used=${receipt.gasUsed.toString()}\n`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `status=${receipt.status === "success" ? "success" : "failed"}\n`);
      if (receipt.contractAddress) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `contract_address=${receipt.contractAddress}\n`);
      }
    }

    if (receipt.logs && receipt.logs.length > 0) {
      console.log("\nTransaction logs:", receipt.logs.length);
      receipt.logs.forEach((log: any, i: number) => {
        console.log(`Log ${i}:`, {
          address: log.address,
          topics: log.topics || [],
          data: log.data,
        });
      });
    }

  } catch (error: any) {
    const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
    console.error("\n✗ Transaction failed:");
    if (error.message) {
      console.error("Error:", error.message);
      if (isCI) {
        console.log(`::error::${error.message}`);
      }
    }
    if (error.cause) {
      console.error("Cause:", error.cause);
    }
    console.error("Full error:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
