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

### 3. `deploy-1.3.0-canonical.yml` - Deploy Safe 1.3.0 Canonical Contracts

A specialized workflow for deploying all Safe 1.3.0 canonical contracts in batch. Designed for custom networks with full chain configuration.

**Usage:**
1. Go to Actions tab in GitHub
2. Select "Deploy Safe 1.3.0 Canonical Contracts"
3. Click "Run workflow"
4. Fill in the required inputs:
   - **Chain ID**: The chain ID number (e.g., `11155111` for Sepolia, `1` for Mainnet)
   - **Custom RPC URL**: The RPC endpoint URL for your network
   - **Block Explorer URL**: (Optional) Block explorer URL for the network
   - **Network Name**: (Optional) A name for the network (defaults to "custom")

**Example Inputs:**
- Chain ID: `11155111`
- Custom RPC URL: `https://sepolia.infura.io/v3/YOUR_KEY`
- Block Explorer URL: `https://sepolia.etherscan.io`
- Network Name: `sepolia`

**What it does:**
- Deploys all 9 Safe 1.3.0 canonical contracts sequentially
- Checks for existing deployments before deploying
- Validates codeHash matches expected values
- Saves deployment results to `deployments/` directory
- Creates structured JSON summary files with transaction hashes and block numbers
- Uploads deployment artifacts as workflow artifacts for consumption by other workflows

**Artifacts Created:**
1. `deployment-results` - Contains all individual deployment JSON files from `deployments/` directory
2. `deployment-summary` - Contains structured summary files:
   - `deployment-summary.json` - Main summary file with all transaction hashes and block numbers
   - `github-actions-summary-{network}-latest.json` - Latest summary for the network

**Summary File Structure:**
```json
{
  "network": "sepolia",
  "chainId": "11155111",
  "timestamp": "2025-11-13T15:00:00.000Z",
  "totalContracts": 9,
  "successful": 9,
  "failed": 0,
  "deployments": [
    {
      "contractName": "compatibility_fallback_handler",
      "success": true,
      "txHash": "0x...",
      "blockNumber": "12345678",
      "contractAddress": "0x...",
      "expectedAddress": "0x...",
      "gasUsed": "123456",
      "error": null
    },
    ...
  ]
}
```

**Consuming Artifacts in Other Workflows:**
See `example-consume-deployment.yml` for a complete example of how to consume deployment artifacts in another workflow using `workflow_run` trigger.

## Required Secrets

Configure these secrets in your GitHub repository settings (Settings → Secrets and variables → Actions):

### Required (for all workflows)
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

## Consuming Deployment Artifacts in Other Workflows

The `deploy-1.3.0-canonical.yml` workflow creates artifacts that can be consumed by other workflows.

### Method 1: Using `workflow_run` Trigger

Create a workflow that triggers after the deployment completes:

```yaml
on:
  workflow_run:
    workflows: ["Deploy Safe 1.3.0 Canonical Contracts"]
    types:
      - completed
```

Then download the artifact:

```yaml
- name: Download deployment summary
  uses: actions/download-artifact@v4
  with:
    name: deployment-summary
    github-token: ${{ secrets.GITHUB_TOKEN }}
    run-id: ${{ github.event.workflow_run.id }}
    path: ./deployment-artifacts
```

### Method 2: Using Artifact API

You can also download artifacts programmatically using the GitHub API.

### Example Workflow

See `.github/workflows/example-consume-deployment.yml` for a complete example that:
- Triggers after deployment completes
- Downloads the deployment summary artifact
- Extracts transaction hashes and block numbers
- Processes the deployment results

