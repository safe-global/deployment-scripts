import { type Address, defineChain, type Chain, formatEther, erc721Abi } from "viem";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Import shared utilities
import { validateEnvironment, validateRpcUrl, validateErc721TokenId } from "./utils/validation";
import {
  createDeploymentWalletClient,
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

// Extended ERC721 ABI with safeMint function
const erc721WithSafeMintAbi = [
  ...erc721Abi,
  {
    name: "safeMint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

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
  blockNumber?: bigint;
  gasUsed?: bigint;
  error?: string;
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

async function deployNFT(
  client: ReturnType<typeof createDeploymentWalletClient>,
  deploymentData: DeploymentData,
  account: ReturnType<typeof getDeploymentAccount>,
  chain: Chain | undefined,
  networkName: string,
  chainId: number
): Promise<DeploymentResult> {
  const result: DeploymentResult = {
    contractName: "ERC721",
    success: false,
  };

  try {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Deploying: ERC721 NFT Token`);
    console.log(`${"=".repeat(60)}`);
    console.log("Bytecode length:", deploymentData.data.length, "characters");
    if (deploymentData.expectedAddress) {
      console.log("Expected address:", deploymentData.expectedAddress);
    }

    // Deploy contract using deployContract
    console.log("\nDeploying contract...");
    const hash = await client.deployContract({
      abi: erc721WithSafeMintAbi,
      account,
      bytecode: deploymentData.data as `0x${string}`,
      chain: chain,
    });

    result.txHash = hash;
    console.log("Transaction hash:", hash);
    console.log("Waiting for confirmation...");

    // Wait for transaction receipt
    const receipt = await client.waitForTransactionReceipt({ hash });

    result.blockNumber = receipt.blockNumber;
    result.gasUsed = receipt.gasUsed;

    console.log("\n✓ Transaction confirmed!");
    console.log("Block number:", receipt.blockNumber.toString());
    console.log("Gas used:", receipt.gasUsed.toString());
    console.log("Status:", receipt.status === "success" ? "Success" : "Failed");

    if (receipt.status === "success") {
      result.success = true;

      // Get contract address from receipt
      let contractAddress: Address | undefined;
      if (receipt.contractAddress) {
        contractAddress = receipt.contractAddress;
        result.contractAddress = contractAddress;
        console.log("Deployed contract address:", contractAddress);
      } else if (deploymentData.expectedAddress) {
        // If no contract address in receipt but expected address is provided, use it
        contractAddress = deploymentData.expectedAddress;
        result.contractAddress = contractAddress;
        console.log("Deployed contract address (expected):", contractAddress);
      } else {
        console.warn("⚠ No contract address available in receipt");
      }

      // Mint NFT to the deployer account if contract address is available
      if (contractAddress) {
        try {
          // Get token ID from environment with validation
          const tokenIdStr = validateErc721TokenId(process.env.ERC721_TOKEN_ID || ENV_DEFAULTS.ERC721_TOKEN_ID);
          const tokenId = BigInt(tokenIdStr);
          
          // Wait before minting (configurable delay)
          await wait(DEPLOYMENT_CONFIG.delays.afterConfirmation);

          console.log(`\n${"=".repeat(60)}`);
          console.log(`Minting ERC721 NFT`);
          console.log(`${"=".repeat(60)}`);
          console.log("Contract address:", contractAddress);
          console.log("Recipient:", account.address);
          console.log("Token ID:", tokenId.toString());

          // Call safeMint function (standard ERC721 safeMint(address to, uint256 tokenId) signature)
          console.log("\nCalling safeMint function...");
          const mintHash = await client.writeContract({
            address: contractAddress,
            abi: erc721WithSafeMintAbi,
            functionName: "safeMint",
            args: [account.address, tokenId],
            account,
            chain: chain,
          });

          console.log("Mint transaction hash:", mintHash);
          console.log("Waiting for confirmation...");

          const mintReceipt = await client.waitForTransactionReceipt({ hash: mintHash });

          if (mintReceipt.status === "success") {
            console.log("\n✓ Mint successful!");
            console.log("Block number:", mintReceipt.blockNumber.toString());
            console.log("Gas used:", mintReceipt.gasUsed.toString());
            
            // Optionally read the owner to verify
            try {
              const owner = await client.readContract({
                address: contractAddress,
                abi: erc721WithSafeMintAbi,
                functionName: "ownerOf",
                args: [tokenId],
              });
              console.log(`Owner of token ${tokenId}:`, owner);
              if (owner.toLowerCase() === account.address.toLowerCase()) {
                console.log("✓ Ownership verified!");
              }
            } catch (error: unknown) {
              console.warn("⚠ Could not verify ownership:", formatError(error));
            }
          } else {
            console.warn("⚠ Mint transaction failed");
          }
        } catch (error: unknown) {
          // Check if error is because safeMint function doesn't exist
          const errorMsg = formatError(error);
          if (errorMsg.includes("Function") && errorMsg.includes("not found")) {
            console.warn(`\n⚠ safeMint function not found in contract. Skipping mint.`);
            console.warn(`This is normal if the ERC721 contract doesn't have a safeMint function.`);
          } else {
            console.warn(`\n⚠ Failed to mint NFT:`, errorMsg);
            console.warn(`Continuing without mint...`);
          }
        }
      }
    } else {
      result.error = "Transaction failed";
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

/**
 * Creates a GitHub Actions compatible deployment summary file
 */
function createGitHubActionsSummary(
  result: DeploymentResult,
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
    totalContracts: 1,
    successful: result.success ? 1 : 0,
    failed: result.success ? 0 : 1,
    deployments: [{
      contractName: result.contractName,
      success: result.success,
      txHash: result.txHash || null,
      blockNumber: result.blockNumber ? result.blockNumber.toString() : null,
      contractAddress: result.contractAddress || null,
      expectedAddress: null,
      gasUsed: result.gasUsed ? result.gasUsed.toString() : null,
      error: result.error || null,
    }],
  };

  // Save GitHub Actions summary file
  const githubSummaryFile = path.join(deploymentsDir, `github-actions-summary-nft-${networkName}-${Date.now()}.json`);
  fs.writeFileSync(githubSummaryFile, JSON.stringify(summary, null, 2));
  console.log(`\n💾 Saved GitHub Actions summary to: ${githubSummaryFile}`);

  // Also save a latest version for easy access
  const latestSummaryFile = path.join(deploymentsDir, `github-actions-summary-nft-${networkName}-latest.json`);
  fs.writeFileSync(latestSummaryFile, JSON.stringify(summary, null, 2));
  console.log(`💾 Saved latest summary to: ${latestSummaryFile}`);
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

  // Path to NFT JSON file
  const nftJsonPath = path.join(
    process.cwd(),
    "contracts",
    "deployement-data",
    "tokens",
    "nft.json"
  );

  if (!fs.existsSync(nftJsonPath)) {
    console.error(`NFT JSON file not found: ${nftJsonPath}`);
    process.exit(1);
  }

  // Read deployment data
  const deploymentData: DeploymentData = JSON.parse(
    fs.readFileSync(nftJsonPath, "utf-8")
  );

  if (!deploymentData.data) {
    console.error("Invalid deployment data: missing 'data' field");
    process.exit(1);
  }

    // Get deployment account (validates private key)
    const account = getDeploymentAccount();

    console.log("\n" + "=".repeat(60));
    console.log("ERC721 NFT Deployment Script");
    console.log("=".repeat(60));
    console.log("Deployer address:", account.address);
    console.log("Network:", networkName);
    console.log("RPC URL:", maskUrl(rpcUrl));
    console.log("NFT JSON path:", nftJsonPath);

    // Fetch chain ID from RPC using utility function
    console.log("Fetching chain ID from RPC...");
    const chainId = await getChainId(rpcUrl);
    console.log("Chain ID (from RPC):", chainId);

    // Create custom chain using the fetched chain ID
    const customChain = createCustomChain(rpcUrl, chainId);

    // Create clients using utility functions
    const client = createDeploymentWalletClient(rpcUrl, customChain);

  // Get and display ETH balance
  try {
    const balance = await client.getBalance({ address: account.address });
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

    // Set GitHub Actions output
    if (isCI() && process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `deployer_address=${account.address}\n`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `network=${networkName}\n`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `chain_id=${chainId}\n`);
    }

    // Deploy NFT contract
    const result = await deployNFT(
      client,
      deploymentData,
      account,
      customChain,
      networkName,
      chainId
    );

    // Create GitHub Actions summary file
    createGitHubActionsSummary(result, networkName, chainId);

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("Deployment Summary");
    console.log("=".repeat(60));

    if (result.success) {
      console.log("✓ Deployment successful!");
      if (result.txHash) console.log(`TX Hash: ${result.txHash}`);
      if (result.contractAddress) console.log(`Contract Address: ${result.contractAddress}`);
      if (result.blockNumber) console.log(`Block Number: ${result.blockNumber}`);
      if (result.gasUsed) console.log(`Gas Used: ${result.gasUsed}`);
    } else {
      console.log("✗ Deployment failed!");
      console.log(`Error: ${result.error || "Unknown error"}`);
    }

    // Set GitHub Actions output
    if (isCI() && process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `deployment_success=${result.success}\n`);
      if (result.txHash) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `tx_hash=${result.txHash}\n`);
      }
      if (result.contractAddress) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `contract_address=${result.contractAddress}\n`);
      }
      if (result.blockNumber) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `block_number=${result.blockNumber.toString()}\n`);
      }
      if (result.gasUsed) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `gas_used=${result.gasUsed.toString()}\n`);
      }
      if (result.error) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `error=${result.error.replace(/\n/g, ' ')}\n`);
      }
    }

    // Exit with error code if deployment failed
    if (!result.success) {
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

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Unhandled error:", formatError(error));
    process.exit(1);
  });

