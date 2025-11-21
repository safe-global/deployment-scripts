/**
 * Centralized configuration for deployment scripts
 * All deployment-related settings should be defined here
 */

export const DEPLOYMENT_CONFIG = {
  /**
   * Delays between operations (in milliseconds)
   */
  delays: {
    /** Delay between contract deployments */
    betweenDeployments: 1000,
    /** Delay after minting operations */
    afterMint: 2000,
    /** Delay after transaction confirmation */
    afterConfirmation: 500,
  },

  /**
   * Gas configuration
   */
  gas: {
    /** Default gas limit for deployments */
    defaultLimit: 5000000,
    /** Warning threshold for gas estimation (in wei) */
    warningThreshold: 3000000,
    /** Maximum gas limit before failing */
    maxLimit: 10000000,
  },

  /**
   * Retry configuration
   */
  retries: {
    /** Maximum number of retry attempts */
    maxAttempts: 3,
    /** Initial delay between retries (in milliseconds) */
    initialDelayMs: 5000,
    /** Maximum delay between retries (in milliseconds) */
    maxDelayMs: 30000,
    /** Exponential backoff multiplier */
    backoffMultiplier: 2,
  },

  /**
   * Transaction configuration
   */
  transaction: {
    /** Maximum number of confirmations to wait */
    maxConfirmations: 12,
    /** Timeout for transaction confirmation (in milliseconds) */
    confirmationTimeout: 300000, // 5 minutes
  },

  /**
   * RPC configuration
   */
  rpc: {
    /** Request timeout (in milliseconds) */
    timeout: 30000,
    /** Maximum number of retries for RPC calls */
    maxRetries: 3,
  },

  /**
   * File paths
   */
  paths: {
    /** Base directory for deployment data */
    deploymentData: "contracts/deployement-data",
    /** Base directory for deployment results */
    deployments: "deployments",
    /** Directory for GitHub Actions summaries */
    githubSummaries: "deployments",
  },
} as const;

/**
 * Environment variable defaults
 */
export const ENV_DEFAULTS = {
  NETWORK: "custom",
  CHAIN_NAME: undefined, // Will use "Custom Chain {chainId}" if not set
  NATIVE_CURRENCY_NAME: "Ether",
  NATIVE_CURRENCY_SYMBOL: "ETH",
  NATIVE_CURRENCY_DECIMALS: "18",
  ERC20_MINT_AMOUNT: "1000",
  ERC721_TOKEN_ID: "1",
} as const;

/**
 * Valid deployment target names
 */
export const VALID_DEPLOY_TARGETS = [
  "1.3.0",
  "1.4.1",
  "1.5.0",
  "modules",
  "erc20",
  "erc721",
  "all",
] as const;

export type DeployTarget = typeof VALID_DEPLOY_TARGETS[number];

