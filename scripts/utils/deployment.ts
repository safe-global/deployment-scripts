/**
 * Shared deployment utilities
 * Common functions used across all deployment scripts
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  type Address,
  type Chain,
  publicActions,
  walletActions,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DEPLOYMENT_CONFIG, ENV_DEFAULTS } from "./config";
import { validateRpcUrl, validatePrivateKey, validateChainId } from "./validation";

/**
 * Creates a wallet client with necessary actions
 */
export function createDeploymentWalletClient(
  rpcUrl: string,
  chain: Chain | undefined
) {
  validateRpcUrl(rpcUrl);

  const client = createWalletClient({
    chain,
    transport: http(rpcUrl, {
      timeout: DEPLOYMENT_CONFIG.rpc.timeout,
      retryCount: DEPLOYMENT_CONFIG.rpc.maxRetries,
    }),
  })
    .extend(publicActions)
    .extend(walletActions);

  return client;
}

/**
 * Creates a public client for reading chain data
 */
export function createDeploymentPublicClient(rpcUrl: string, chain: Chain | undefined) {
  validateRpcUrl(rpcUrl);

  return createPublicClient({
    chain,
    transport: http(rpcUrl, {
      timeout: DEPLOYMENT_CONFIG.rpc.timeout,
      retryCount: DEPLOYMENT_CONFIG.rpc.maxRetries,
    }),
  });
}

/**
 * Gets the deployment account from environment variables
 */
export function getDeploymentAccount() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY environment variable is not set");
  }

  validatePrivateKey(privateKey);
  return privateKeyToAccount(privateKey as `0x${string}`);
}

/**
 * Gets the chain ID from the RPC endpoint
 */
export async function getChainId(rpcUrl: string): Promise<number> {
  validateRpcUrl(rpcUrl);

  const publicClient = createPublicClient({
    transport: http(rpcUrl, {
      timeout: DEPLOYMENT_CONFIG.rpc.timeout,
    }),
  });

  try {
    const chainId = await publicClient.getChainId();
    validateChainId(chainId);
    return chainId;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to fetch chain ID from RPC: ${errorMessage}`
    );
  }
}

/**
 * Waits for a specified delay
 */
export async function wait(delayMs: number = DEPLOYMENT_CONFIG.delays.betweenDeployments): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Masks sensitive information in URLs for logging
 */
export function maskUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}/***`;
  } catch {
    return url.replace(/\/\/[^/]+/, "//***");
  }
}

/**
 * Formats an address for display (first 6 and last 4 characters)
 */
export function formatAddress(address: Address): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Checks if we're running in CI environment
 */
export function isCI(): boolean {
  return (
    process.env.CI === "true" ||
    process.env.GITHUB_ACTIONS === "true" ||
    process.env.CONTINUOUS_INTEGRATION === "true"
  );
}

/**
 * Gets the network name from environment or defaults
 */
export function getNetworkName(): string {
  return process.env.NETWORK || ENV_DEFAULTS.NETWORK;
}

