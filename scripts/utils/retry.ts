/**
 * Retry utility with exponential backoff
 * Handles transient failures automatically
 */

import { DEPLOYMENT_CONFIG } from "./config";
import { NetworkError, TransactionError, formatError } from "./errors";

/**
 * Options for retry behavior
 */
export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxAttempts?: number;
  /** Initial delay between retries (in milliseconds) */
  initialDelayMs?: number;
  /** Maximum delay between retries (in milliseconds) */
  maxDelayMs?: number;
  /** Exponential backoff multiplier */
  backoffMultiplier?: number;
  /** Function to determine if an error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Custom delay function (overrides exponential backoff) */
  delayFn?: (attempt: number) => number;
}

/**
 * Default retry options from configuration
 */
const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: DEPLOYMENT_CONFIG.retries.maxAttempts,
  initialDelayMs: DEPLOYMENT_CONFIG.retries.initialDelayMs,
  maxDelayMs: DEPLOYMENT_CONFIG.retries.maxDelayMs,
  backoffMultiplier: DEPLOYMENT_CONFIG.retries.backoffMultiplier,
  isRetryable: (error: unknown) => {
    // Retry on network errors and certain transaction errors
    if (error instanceof NetworkError) {
      return true;
    }
    if (error instanceof TransactionError) {
      // Don't retry transaction errors (they're usually permanent)
      return false;
    }
    // Retry on generic errors that might be transient
    const errorMessage = formatError(error).toLowerCase();
    const retryablePatterns = [
      "network",
      "timeout",
      "connection",
      "econnreset",
      "etimedout",
      "eai_again",
      "rate limit",
      "too many requests",
      "service unavailable",
      "bad gateway",
      "gateway timeout",
    ];
    return retryablePatterns.some((pattern) => errorMessage.includes(pattern));
  },
  delayFn: (attempt: number) => {
    const config = DEPLOYMENT_CONFIG.retries;
    const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
    return Math.min(delay, config.maxDelayMs);
  },
};

/**
 * Waits for a specified number of milliseconds
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries a function with exponential backoff
 * 
 * @param fn - The function to retry
 * @param options - Retry options
 * @returns The result of the function
 * @throws The last error if all retries fail
 * 
 * @example
 * ```typescript
 * const result = await retry(
 *   () => client.getBalance({ address }),
 *   { maxAttempts: 3 }
 * );
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      // Check if error is retryable
      if (!opts.isRetryable(error)) {
        throw error;
      }

      // If this is the last attempt, throw the error
      if (attempt === opts.maxAttempts) {
        throw error;
      }

      // Calculate delay
      const delay = opts.delayFn ? opts.delayFn(attempt) : opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1);
      const clampedDelay = Math.min(delay, opts.maxDelayMs);

      console.warn(
        `⚠ Attempt ${attempt}/${opts.maxAttempts} failed: ${formatError(error)}`
      );
      console.log(`Retrying in ${clampedDelay}ms...`);

      await wait(clampedDelay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Retries a function with exponential backoff, but only for specific error types
 * 
 * @param fn - The function to retry
 * @param retryableErrors - Array of error classes/types that should be retried
 * @param options - Additional retry options
 * @returns The result of the function
 */
export async function retryOnErrors<T>(
  fn: () => Promise<T>,
  retryableErrors: (new (...args: any[]) => Error)[],
  options: Omit<RetryOptions, "isRetryable"> = {}
): Promise<T> {
  return retry(fn, {
    ...options,
    isRetryable: (error: unknown) => {
      return retryableErrors.some((ErrorClass) => error instanceof ErrorClass);
    },
  });
}

/**
 * Retries a function with a fixed delay between attempts
 * 
 * @param fn - The function to retry
 * @param maxAttempts - Maximum number of attempts
 * @param delayMs - Fixed delay between attempts (in milliseconds)
 * @returns The result of the function
 */
export async function retryWithFixedDelay<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> {
  return retry(fn, {
    maxAttempts,
    delayFn: () => delayMs,
  });
}

