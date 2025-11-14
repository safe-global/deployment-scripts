import { createGitHubIssue } from "./create-github-issue";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

interface ChainAdditionData {
  chainName: string;
  chainId: string;
  chainDetailUrl?: string;
  rpcUrl: string;
  blockscoutUrl?: string;
  etherscanUrl?: string;
  etherscanApiUrl?: string;
  version: string;
  masterCopy?: {
    address: string;
    txHash: string;
    explorerUrl?: string;
  };
  masterCopyL2?: {
    address: string;
    txHash: string;
    explorerUrl?: string;
  };
  proxyFactory?: {
    address: string;
    txHash: string;
    explorerUrl?: string;
  };
  summary?: string;
}

/**
 * Creates a GitHub issue for adding a new chain using the chain addition template
 */
export async function createChainAdditionIssue(
  owner: string,
  repo: string,
  data: ChainAdditionData
): Promise<any> {
  const title = `[New chain]: ${data.chainName}`;
  
  // Map data to template field IDs (snake_case as in the template)
  // GitHub automatically converts these to camelCase when parsing
  const templateFields: Record<string, string> = {
    'summary': data.summary || `I would like to add ${data.chainName} chain...`,
    'chain_id': data.chainId,
    'chain_ir_url': data.chainDetailUrl || '',
    'rpc_url': data.rpcUrl,
    'blockscout_client_url': data.blockscoutUrl || '',
    'etherscan_client_url': data.etherscanUrl || '',
    'etherscan_client_api_url': data.etherscanApiUrl || '',
    'version': data.version,
  };
  
  if (data.masterCopy) {
    templateFields['address_master_copy'] = data.masterCopy.address;
    // Always include tx_hash (even if empty) - validation script expects it
    templateFields['tx_hash_master_copy'] = data.masterCopy.txHash || '';
    if (data.masterCopy.explorerUrl) {
      templateFields['block_explorer_url_master_copy'] = data.masterCopy.explorerUrl;
    }
  }
  
  if (data.masterCopyL2) {
    templateFields['address_master_copy_l2'] = data.masterCopyL2.address;
    // Always include tx_hash (even if empty)
    templateFields['tx_hash_master_copy_l2'] = data.masterCopyL2.txHash || '';
    if (data.masterCopyL2.explorerUrl) {
      templateFields['block_explorer_url_master_copy_l2'] = data.masterCopyL2.explorerUrl;
    }
  }
  
  if (data.proxyFactory) {
    templateFields['address_proxy'] = data.proxyFactory.address;
    // Always include tx_hash (even if empty) - validation script requires it
    templateFields['tx_hash_proxy'] = data.proxyFactory.txHash || '';
    if (data.proxyFactory.explorerUrl) {
      templateFields['block_explorer_url_proxy'] = data.proxyFactory.explorerUrl;
    }
  }
  
  return await createGitHubIssue({
    owner,
    repo,
    title,
    body: "",
    template: "add_safe_address_new_chain", // Match the actual template filename
    templateFields,
    labels: ["add-new-address"], // Explicitly add the required label for the workflow
  });
}

async function main() {
  const args = process.argv.slice(2);
  const defaultOwner = "safe-global";
  const defaultRepo = "safe-eth-py";
  const dryRun = args.includes("--dry-run");
  const filteredArgs = args.filter(arg => arg !== "--dry-run");
  
  if (filteredArgs.length < 1) {
    console.error("Usage: tsx create-chain-addition-issue.ts <deployment-summary.json> [owner] [repo] [--dry-run]");
    process.exit(1);
  }
  
  const summaryFile = filteredArgs[0];
  const owner = filteredArgs[1] || defaultOwner;
  const repo = filteredArgs[2] || defaultRepo;
  
  if (!fs.existsSync(summaryFile)) {
    console.error(`Error: File not found: ${summaryFile}`);
    process.exit(1);
  }
  
  try {
    const summary = JSON.parse(fs.readFileSync(summaryFile, "utf-8"));
    const chainName = summary.network || "unknown";
    const chainId = summary.chainId || "unknown";
    const version = process.env.SAFE_VERSION || "1.5.0";
    const deployments = summary.deployments || [];
    
    const safeDeployment = deployments.find((d: any) => 
      d.contractName === "safe" || d.contractName === "gnosis_safe"
    );
    const safeL2Deployment = deployments.find((d: any) => 
      d.contractName === "safe_l2" || d.contractName === "gnosis_safe_l2"
    );
    const proxyFactoryDeployment = deployments.find((d: any) => 
      d.contractName === "proxy_factory" || 
      d.contractName === "safe_proxy_factory" ||
      d.contractName === "gnosis_safe_proxy_factory"
    );
    
    const chainData: ChainAdditionData = {
      chainName,
      chainId: chainId.toString(),
      version,
      rpcUrl: process.env.CUSTOM_RPC_URL || process.env.RPC_URL || "",
      summary: `Deployment completed successfully. ${summary.successful || 0} contracts deployed.`,
    };
    
    const buildExplorerUrl = (address: string): string | undefined => {
      if (process.env.BLOCK_EXPLORER_URL) {
        return `${process.env.BLOCK_EXPLORER_URL.replace(/\/$/, '')}/address/${address}`;
      }
      return undefined;
    };
    
    if (safeDeployment?.contractAddress) {
      chainData.masterCopy = {
        address: safeDeployment.contractAddress,
        txHash: safeDeployment.txHash || "",
        explorerUrl: buildExplorerUrl(safeDeployment.contractAddress),
      };
    }
    
    if (safeL2Deployment?.contractAddress) {
      chainData.masterCopyL2 = {
        address: safeL2Deployment.contractAddress,
        txHash: safeL2Deployment.txHash || "",
        explorerUrl: buildExplorerUrl(safeL2Deployment.contractAddress),
      };
    }
    
    if (proxyFactoryDeployment?.contractAddress) {
      chainData.proxyFactory = {
        address: proxyFactoryDeployment.contractAddress,
        txHash: proxyFactoryDeployment.txHash || "",
        explorerUrl: buildExplorerUrl(proxyFactoryDeployment.contractAddress),
      };
    }
    
    if (process.env.BLOCK_EXPLORER_URL) {
      chainData.etherscanUrl = process.env.BLOCK_EXPLORER_URL;
      chainData.chainDetailUrl = `https://chainlist.org/chain/${chainId}`;
      const baseUrl = process.env.BLOCK_EXPLORER_URL.replace(/\/$/, '');
      if (baseUrl.includes('etherscan.io')) {
        chainData.etherscanApiUrl = baseUrl.replace('etherscan.io', 'api.etherscan.io');
      } else if (baseUrl.includes('blockscout.com')) {
        chainData.blockscoutUrl = `${baseUrl}/api/v2`;
      }
    }
    
    if (dryRun) {
      console.log("\n" + "=".repeat(60));
      console.log("DRY RUN - Issue Preview");
      console.log("=".repeat(60));
      console.log(`\nRepository: ${owner}/${repo}`);
      console.log(`Title: [New chain]: ${chainData.chainName}`);
      console.log(`\nTemplate Fields (snake_case -> GitHub converts to camelCase):`);
      console.log(JSON.stringify({
        summary: chainData.summary,
        chain_id: chainData.chainId,
        chain_ir_url: chainData.chainDetailUrl,
        rpc_url: chainData.rpcUrl,
        blockscout_client_url: chainData.blockscoutUrl,
        etherscan_client_url: chainData.etherscanUrl,
        etherscan_client_api_url: chainData.etherscanApiUrl,
        version: chainData.version,
        address_master_copy: chainData.masterCopy?.address,
        tx_hash_master_copy: chainData.masterCopy?.txHash,
        block_explorer_url_master_copy: chainData.masterCopy?.explorerUrl,
        address_master_copy_l2: chainData.masterCopyL2?.address,
        tx_hash_master_copy_l2: chainData.masterCopyL2?.txHash,
        block_explorer_url_master_copy_l2: chainData.masterCopyL2?.explorerUrl,
        address_proxy: chainData.proxyFactory?.address,
        tx_hash_proxy: chainData.proxyFactory?.txHash,
        block_explorer_url_proxy: chainData.proxyFactory?.explorerUrl,
      }, null, 2));
      console.log("\n✅ Dry run completed.");
    } else {
      await createChainAdditionIssue(owner, repo, chainData);
    }
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
