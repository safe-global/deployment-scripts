# Deployment Utilities

This directory contains shared utilities used across all deployment scripts.

## Files

### `config.ts`
Centralized configuration for all deployment settings including:
- Delays between operations
- Gas limits and thresholds
- Retry configuration
- File paths
- Valid deployment targets

### `validation.ts`
Validation functions for:
- Environment variables
- RPC URLs
- Private keys
- Chain IDs
- Deployment targets
- Token amounts and IDs

### `deployment.ts`
Common deployment utilities:
- Client creation (wallet and public)
- Account management
- Chain ID fetching
- Helper functions (wait, mask URLs, format addresses)

### `retry.ts`
Retry utilities with exponential backoff:
- `retry()` - Retry with exponential backoff
- `retryOnErrors()` - Retry only for specific error types
- `retryWithFixedDelay()` - Retry with fixed delay
- Automatic retry for transient network errors

## Usage Example

```typescript
import { validateEnvironment, validateRpcUrl } from "./utils/validation";
import { createDeploymentWalletClient, getDeploymentAccount, getChainId } from "./utils/deployment";
import { DEPLOYMENT_CONFIG } from "./utils/config";
import { retry } from "./utils/retry";
import { estimateDeploymentGas, logGasEstimate } from "./utils/gas";

async function main() {
  // Validate environment
  validateEnvironment();
  
  const rpcUrl = process.env.CUSTOM_RPC_URL!;
  validateRpcUrl(rpcUrl);
  
  // Get chain ID with retry
  const chainId = await retry(() => getChainId(rpcUrl));
  
  // Create clients
  const account = getDeploymentAccount();
  const client = createDeploymentWalletClient(rpcUrl, chain);
  
  // Estimate gas before deployment
  const gasEstimate = await estimateDeploymentGas(
    () => client.estimateGas({ ... }),
    publicClient
  );
  logGasEstimate(gasEstimate);
  
  // Use configuration
  await wait(DEPLOYMENT_CONFIG.delays.betweenDeployments);
}
```

## Benefits

1. **DRY Principle**: No code duplication across scripts
2. **Consistency**: Same validation and configuration everywhere
3. **Maintainability**: Change once, update everywhere
4. **Type Safety**: Shared types and interfaces
5. **Error Handling**: Consistent error messages

