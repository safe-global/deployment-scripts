/**
 * Gas estimation and management utilities
 */

import type { Chain, Address, PublicClient } from "viem";
import { DEPLOYMENT_CONFIG } from "./config";
import { GasEstimationError, NetworkError, formatError } from "./errors";
import { retry } from "./retry";

/**
 * Gas estimation result
 */
export interface GasEstimate {
  /** Estimated gas amount */
  gas: bigint;
  /** Gas price in wei */
  gasPrice: bigint;
  /** Estimated cost in wei (gas * gasPrice) */
  estimatedCost: bigint;
  /** Warning level if gas exceeds thresholds */
  warning?: "high" | "critical";
}

/**
 * Estimates gas for a contract deployment
 * @param estimateGasFn - Function that estimates gas
 * @param publicClient - Optional public client for fetching gas price
 * @returns Gas estimation result
 */
export async function estimateDeploymentGas(
  estimateGasFn: () => Promise<bigint>,
  publicClient?: PublicClient
): Promise<GasEstimate> {
  try {
    const gas = await retry(estimateGasFn, {
      maxAttempts: 3,
      initialDelayMs: 1000,
    });
    
    const gasPrice = publicClient 
      ? await getGasPrice(publicClient)
      : await getGasPriceFallback();
    
    const estimatedCost = gas * gasPrice;

    // Check for warnings
    let warning: "high" | "critical" | undefined;
    if (gas > BigInt(DEPLOYMENT_CONFIG.gas.maxLimit)) {
      warning = "critical";
    } else if (gas > BigInt(DEPLOYMENT_CONFIG.gas.warningThreshold)) {
      warning = "high";
    }

    return {
      gas,
      gasPrice,
      estimatedCost,
      warning,
    };
  } catch (error: unknown) {
    throw new GasEstimationError(
      `Failed to estimate gas: ${formatError(error)}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Gets current gas price from RPC
 * @param publicClient - Public client to fetch gas price
 * @returns Gas price in wei
 */
async function getGasPrice(publicClient: PublicClient): Promise<bigint> {
  try {
    const gasPrice = await retry(
      () => publicClient.getGasPrice(),
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
      }
    );
    return gasPrice;
  } catch (error: unknown) {
    console.warn(`⚠ Could not fetch gas price from RPC: ${formatError(error)}`);
    console.warn("Using fallback gas price...");
    return getGasPriceFallback();
  }
}

/**
 * Fallback gas price when RPC call fails
 * @returns Default gas price in wei (20 gwei)
 */
function getGasPriceFallback(): bigint {
  return 20000000000n; // 20 gwei
}

/**
 * Formats gas amount for display
 */
export function formatGas(gas: bigint): string {
  return gas.toString();
}

/**
 * Formats gas cost in ETH for display
 */
export function formatGasCost(cost: bigint): string {
  // Convert wei to ETH (1 ETH = 10^18 wei)
  const eth = Number(cost) / 1e18;
  if (eth < 0.001) {
    return `${(eth * 1000).toFixed(3)} mETH`;
  }
  return `${eth.toFixed(6)} ETH`;
}

/**
 * Logs gas estimation with warnings
 */
export function logGasEstimate(estimate: GasEstimate): void {
  console.log("\n" + "=".repeat(60));
  console.log("Gas Estimation");
  console.log("=".repeat(60));
  console.log(`Estimated Gas: ${formatGas(estimate.gas)}`);
  console.log(`Gas Price: ${formatGas(estimate.gasPrice)} wei`);
  console.log(`Estimated Cost: ${formatGasCost(estimate.estimatedCost)}`);

  if (estimate.warning === "critical") {
    console.warn(
      `\n⚠️ CRITICAL: Gas estimate (${formatGas(estimate.gas)}) exceeds maximum limit (${DEPLOYMENT_CONFIG.gas.maxLimit})`
    );
    console.warn("Deployment may fail. Consider optimizing the contract or increasing gas limit.");
  } else if (estimate.warning === "high") {
    console.warn(
      `\n⚠️ WARNING: Gas estimate (${formatGas(estimate.gas)}) is high (above ${DEPLOYMENT_CONFIG.gas.warningThreshold})`
    );
    console.warn("This deployment will be expensive. Proceed with caution.");
  }
  console.log("=".repeat(60) + "\n");
}

