/**
 * Gas estimation and management utilities
 */

import type { Chain, Address } from "viem";
import { DEPLOYMENT_CONFIG } from "./config";
import { GasEstimationError } from "./errors";

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
 * @returns Gas estimation result
 */
export async function estimateDeploymentGas(
  estimateGasFn: () => Promise<bigint>
): Promise<GasEstimate> {
  try {
    const gas = await estimateGasFn();
    const gasPrice = await getGasPrice();
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
  } catch (error: any) {
    throw new GasEstimationError(
      `Failed to estimate gas: ${error.message || String(error)}`,
      error
    );
  }
}

/**
 * Gets current gas price (placeholder - should be implemented with actual RPC call)
 * TODO: Implement actual gas price fetching from RPC
 */
async function getGasPrice(): Promise<bigint> {
  // This is a placeholder - in a real implementation, you would fetch this from the RPC
  // For now, return a default value
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

