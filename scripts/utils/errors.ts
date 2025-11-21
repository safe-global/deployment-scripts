/**
 * Structured error types for deployment scripts
 */

/**
 * Base error class for deployment-related errors
 */
export class DeploymentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "DeploymentError";
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DeploymentError);
    }
  }
}

/**
 * Configuration error - invalid or missing configuration
 */
export class ConfigurationError extends DeploymentError {
  constructor(message: string, cause?: Error) {
    super(message, "CONFIGURATION_ERROR", cause);
    this.name = "ConfigurationError";
  }
}

/**
 * Validation error - input validation failed
 */
export class ValidationError extends DeploymentError {
  constructor(message: string, public readonly field?: string, cause?: Error) {
    super(message, "VALIDATION_ERROR", cause);
    this.name = "ValidationError";
  }
}

/**
 * Network error - RPC or network-related issues
 */
export class NetworkError extends DeploymentError {
  constructor(
    message: string,
    public readonly rpcUrl?: string,
    cause?: Error
  ) {
    super(message, "NETWORK_ERROR", cause);
    this.name = "NetworkError";
  }
}

/**
 * Transaction error - transaction failed or was rejected
 */
export class TransactionError extends DeploymentError {
  constructor(
    message: string,
    public readonly txHash?: string,
    cause?: Error
  ) {
    super(message, "TRANSACTION_ERROR", cause);
    this.name = "TransactionError";
  }
}

/**
 * Gas estimation error - gas estimation failed
 */
export class GasEstimationError extends DeploymentError {
  constructor(message: string, cause?: Error) {
    super(message, "GAS_ESTIMATION_ERROR", cause);
    this.name = "GasEstimationError";
  }
}

/**
 * Contract verification error - contract verification failed
 */
export class ContractVerificationError extends DeploymentError {
  constructor(
    message: string,
    public readonly contractAddress?: string,
    cause?: Error
  ) {
    super(message, "CONTRACT_VERIFICATION_ERROR", cause);
    this.name = "ContractVerificationError";
  }
}

/**
 * Checks if an error is a DeploymentError
 */
export function isDeploymentError(error: unknown): error is DeploymentError {
  return error instanceof DeploymentError;
}

/**
 * Formats an error for logging
 */
export function formatError(error: unknown): string {
  if (isDeploymentError(error)) {
    let message = `[${error.code}] ${error.message}`;
    if (error.cause) {
      message += `\nCaused by: ${error.cause.message}`;
    }
    return message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

