/**
 * Validation utilities for deployment scripts
 */

import { ENV_DEFAULTS } from "./config";

/**
 * Required environment variables for deployment
 */
export const REQUIRED_ENV_VARS = [
  "PRIVATE_KEY",
  "CUSTOM_RPC_URL",
] as const;

/**
 * Optional environment variables with their descriptions
 */
export const OPTIONAL_ENV_VARS = {
  BLOCK_EXPLORER_URL: "Block explorer URL for the network",
  NETWORK: `Network name (default: ${ENV_DEFAULTS.NETWORK})`,
  CHAIN_NAME: "Custom chain name",
  NATIVE_CURRENCY_NAME: `Native currency name (default: ${ENV_DEFAULTS.NATIVE_CURRENCY_NAME})`,
  NATIVE_CURRENCY_SYMBOL: `Native currency symbol (default: ${ENV_DEFAULTS.NATIVE_CURRENCY_SYMBOL})`,
  NATIVE_CURRENCY_DECIMALS: `Native currency decimals (default: ${ENV_DEFAULTS.NATIVE_CURRENCY_DECIMALS})`,
  ERC20_MINT_AMOUNT: `ERC20 mint amount (default: ${ENV_DEFAULTS.ERC20_MINT_AMOUNT})`,
  ERC721_TOKEN_ID: `ERC721 token ID (default: ${ENV_DEFAULTS.ERC721_TOKEN_ID})`,
} as const;

/**
 * Validates that all required environment variables are set
 * @throws Error if any required variables are missing
 */
export function validateEnvironment(): void {
  const missing: string[] = [];

  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName] || process.env[varName]!.trim() === "") {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\n` +
      `Please set these variables before running the deployment script.`
    );
  }
}

/**
 * Validates RPC URL format
 * @param rpcUrl - The RPC URL to validate
 * @throws Error if the URL format is invalid
 */
export function validateRpcUrl(rpcUrl: string): void {
  if (!rpcUrl || rpcUrl.trim() === "") {
    throw new Error("RPC URL cannot be empty");
  }

  try {
    const url = new URL(rpcUrl);
    if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) {
      throw new Error(`Invalid RPC URL protocol: ${url.protocol}`);
    }
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Invalid RPC URL format: ${rpcUrl}`);
    }
    throw error;
  }
}

/**
 * Validates private key format
 * @param privateKey - The private key to validate
 * @throws Error if the private key format is invalid
 */
export function validatePrivateKey(privateKey: string): void {
  if (!privateKey || privateKey.trim() === "") {
    throw new Error("Private key cannot be empty");
  }

  // Remove 0x prefix if present
  const key = privateKey.startsWith("0x") ? privateKey.slice(2) : privateKey;

  // Check if it's a valid hex string with correct length (64 hex chars = 32 bytes)
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      "Invalid private key format. Expected 64-character hex string (with or without 0x prefix)"
    );
  }
}

/**
 * Validates chain ID
 * @param chainId - The chain ID to validate
 * @throws Error if the chain ID is invalid
 */
export function validateChainId(chainId: number): void {
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid chain ID: ${chainId}. Must be a positive integer`);
  }

  // Ethereum mainnet and common testnets
  const reservedChainIds = [1, 3, 4, 5, 10, 56, 137, 42161, 43114, 8453];
  if (reservedChainIds.includes(chainId)) {
    console.warn(
      `⚠ Warning: Chain ID ${chainId} is a reserved/mainnet chain ID. Make sure this is intentional.`
    );
  }
}

/**
 * Validates deployment target string
 * @param targets - Comma-separated list of deployment targets
 * @param validTargets - Array of valid target names
 * @returns Array of validated target names
 * @throws Error if any target is invalid
 */
export function validateDeployTargets(
  targets: string,
  validTargets: readonly string[]
): string[] {
  if (!targets || targets.trim() === "") {
    return [];
  }

  // Normalize: lowercase, remove spaces
  const normalized = targets.toLowerCase().replace(/\s/g, "");
  
  // Split by comma
  const targetList = normalized.split(",").filter((t) => t.length > 0);

  if (targetList.length === 0) {
    return [];
  }

  // Check for "all" keyword
  if (targetList.includes("all")) {
    if (targetList.length > 1) {
      throw new Error(
        'Invalid deploy_targets: "all" cannot be combined with other targets'
      );
    }
    return ["all"];
  }

  // Validate each target
  const invalid: string[] = [];
  for (const target of targetList) {
    if (!validTargets.includes(target)) {
      invalid.push(target);
    }
  }

  if (invalid.length > 0) {
    throw new Error(
      `Invalid deployment targets: ${invalid.join(", ")}\n` +
      `Valid options are: ${validTargets.join(", ")}`
    );
  }

  return targetList;
}

/**
 * Validates ERC20 mint amount
 * @param amount - The amount string to validate
 * @returns The validated amount as a string
 * @throws Error if the amount is invalid
 */
export function validateErc20MintAmount(amount: string): string {
  if (!amount || amount.trim() === "") {
    return ENV_DEFAULTS.ERC20_MINT_AMOUNT;
  }

  const num = parseFloat(amount);
  if (isNaN(num) || num <= 0) {
    throw new Error(`Invalid ERC20 mint amount: ${amount}. Must be a positive number`);
  }

  return amount;
}

/**
 * Validates ERC721 token ID
 * @param tokenId - The token ID string to validate
 * @returns The validated token ID as a string
 * @throws Error if the token ID is invalid
 */
export function validateErc721TokenId(tokenId: string): string {
  if (!tokenId || tokenId.trim() === "") {
    return ENV_DEFAULTS.ERC721_TOKEN_ID;
  }

  const num = BigInt(tokenId);
  if (num < 0n) {
    throw new Error(`Invalid ERC721 token ID: ${tokenId}. Must be a non-negative integer`);
  }

  return tokenId;
}

