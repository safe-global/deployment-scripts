# GitHub Actions Workflows

This directory contains GitHub Actions workflows for deploying Safe contracts.

## Workflows

### 1. `deploy.yml` - General Deployment Workflow

A flexible workflow that can be triggered:
- **Manually** via workflow_dispatch with custom inputs
- **Automatically** on pushes to main branch when deployment data files change
- **On pull requests** when deployment data files change (for validation)

**Usage:**
1. Go to Actions tab in GitHub
2. Select "Deploy Safe Contracts"
3. Click "Run workflow"
4. Fill in:
   - Deployment file path
   - Network name
   - RPC URL (optional, uses secret if not provided)

### 2. `deploy-specific.yml` - Quick Deployment Workflow

A workflow with predefined options for common deployments. Easier to use with dropdown menus.

**Usage:**
1. Go to Actions tab in GitHub
2. Select "Deploy Specific Contract"
3. Click "Run workflow"
4. Select from dropdown menus:
   - Deployment file (predefined list)
   - Network (predefined list)
   - RPC URL secret name (optional)

## Required Secrets

Configure these secrets in your GitHub repository settings (Settings → Secrets and variables → Actions):

### Required
- `PRIVATE_KEY` - The private key of the deployer account (must start with 0x)

### Optional (use one of these)
- `RPC_URL` - Default RPC URL for all networks
- `SEPOLIA_RPC_URL` - RPC URL for Sepolia testnet
- `MAINNET_RPC_URL` - RPC URL for Ethereum mainnet
- `GOERLI_RPC_URL` - RPC URL for Goerli testnet
- `BASE_RPC_URL` - RPC URL for Base network
- `OPTIMISM_RPC_URL` - RPC URL for Optimism network
- `ARBITRUM_RPC_URL` - RPC URL for Arbitrum network
- `POLYGON_RPC_URL` - RPC URL for Polygon network

Or use network-specific secrets like `${NETWORK}_RPC_URL` pattern.

## Security Notes

- **Never commit private keys** to the repository
- Use GitHub Secrets for all sensitive data
- The workflow will fail if required secrets are not set
- RPC URLs are partially masked in logs for security

## Example: Setting up Secrets

1. Go to your repository on GitHub
2. Navigate to Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add:
   - Name: `PRIVATE_KEY`
   - Value: `0x...` (your private key)
5. Add network-specific RPC URLs as needed:
   - Name: `SEPOLIA_RPC_URL`
   - Value: `https://sepolia.infura.io/v3/YOUR_KEY`

## Troubleshooting

### Error: PRIVATE_KEY secret is not set
- Make sure you've added the `PRIVATE_KEY` secret in repository settings
- Verify the secret name matches exactly (case-sensitive)

### Error: RPC_URL secret is not set
- Add the `RPC_URL` secret, or
- Use network-specific secrets like `SEPOLIA_RPC_URL`
- Or provide RPC URL as workflow input

### Error: Deployment file not found
- Verify the file path is correct
- Check that the file exists in the repository
- Use relative paths from repository root

