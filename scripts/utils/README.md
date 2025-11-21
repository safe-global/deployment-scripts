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

## Usage Example

```typescript
import { validateEnvironment, validateRpcUrl } from "./utils/validation";
import { createDeploymentWalletClient, getDeploymentAccount, getChainId } from "./utils/deployment";
import { DEPLOYMENT_CONFIG } from "./utils/config";

async function main() {
  // Validate environment
  validateEnvironment();
  
  const rpcUrl = process.env.CUSTOM_RPC_URL!;
  validateRpcUrl(rpcUrl);
  
  // Get chain ID
  const chainId = await getChainId(rpcUrl);
  
  // Create clients
  const account = getDeploymentAccount();
  const client = createDeploymentWalletClient(rpcUrl, chain);
  
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

