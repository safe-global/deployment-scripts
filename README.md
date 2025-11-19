# Safe Deployments Scripts

A modern Viem-based repository for deploying Safe Smart Account contracts and modules using deterministic deployment via the Safe Singleton Factory.

## Purpose

This repository provides automated deployment scripts for:
- **Safe Smart Account contracts** (versions 1.3.0-canonical, 1.4.1, and 1.5.0)
- **Safe Modules** (social-recovery and allowance modules)

All deployments use **deterministic deployment** via the [Safe Singleton Factory](https://github.com/safe-global/safe-singleton-factory) to ensure contracts are deployed to the same addresses across all supported networks. This is critical for maintaining consistency and interoperability across different blockchain networks.

### Key Features

- ✅ Deterministic contract addresses across all networks
- ✅ Batch deployment support for multiple contracts
- ✅ Automatic chain ID detection from RPC
- ✅ Pre-deployment checks to skip already deployed contracts
- ✅ GitHub Actions integration for CI/CD
- ✅ Comprehensive deployment summaries and artifacts

## Prerequisites

- Node.js >= 18.0.0
- pnpm (recommended) or npm
- **Gas tokens** sent to the deployer address: `0x38D48FaDa993b749691E93e4E62259c488bCb766`

> ⚠️ **Important**: Before running deployments, ensure the deployer address (`0x38D48FaDa993b749691E93e4E62259c488bCb766`) has sufficient gas tokens (ETH or native token) for the target network. Deployment transactions require gas fees.

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Safe-deployments-scripts
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
# Create .env file
PRIVATE_KEY=0x...  # Your deployer private key (must start with 0x)
RPC_URL=https://...  # RPC URL for your network
# Or use network-specific variables:
# SEPOLIA_RPC_URL=https://...
# MAINNET_RPC_URL=https://...
# CUSTOM_RPC_URL=https://...  # For custom networks
```

4. **Send gas tokens** to the deployer address:
   - **Deployer Address**: `0x38D48FaDa993b749691E93e4E62259c488bCb766`
   - Send native gas tokens (ETH, MATIC, etc.) depending on your target network
   - Ensure sufficient balance for all deployment transactions

## Usage

### Available Deployment Scripts

This repository provides several deployment scripts:

1. **`deploy-1.3.0-canonical`** - Deploy Safe 1.3.0 canonical contracts
2. **`deploy-1.4.1`** - Deploy Safe 1.4.1 contracts
3. **`deploy-1.5.0`** - Deploy Safe 1.5.0 contracts
4. **`deploy-modules`** - Deploy Safe modules (social-recovery and allowance)

### Local Deployment

#### Deploy Safe Smart Account Contracts

**Deploy Safe 1.3.0 Canonical:**
```bash
pnpm deploy-1.3.0-canonical --network <network-name>
```

**Deploy Safe 1.4.1:**
```bash
pnpm deploy-1.4.1 --network <network-name>
```

**Deploy Safe 1.5.0:**
```bash
pnpm deploy-1.5.0 --network <network-name>
```

**Deploy Safe Modules:**
```bash
pnpm deploy-modules --network <network-name>
```

#### Example: Deploying to Sepolia Testnet

```bash
# Set environment variables
export CUSTOM_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
export PRIVATE_KEY=0x... #your private key
export NETWORK=sepolia
export BLOCK_EXPLORER_URL=https://sepolia.etherscan.io

# Ensure deployer address has ETH for gas
# Send ETH to your address

# Run deployment
pnpm deploy-1.5.0 --network sepolia
```

#### Example: Deploying to a Custom Network

```bash
# Set environment variables
export CUSTOM_RPC_URL=https://your-custom-rpc-url.com
export PRIVATE_KEY=0x...  #your private key
export NETWORK=custom
export BLOCK_EXPLORER_URL=https://your-explorer.com

# Ensure deployer address has native tokens for gas
# Send native tokens to your address

# Run deployment (chain ID will be auto-detected from RPC)
pnpm deploy-modules --network custom
```

### How It Works

1. **Pre-deployment Check**: Scripts check if contracts are already deployed at expected addresses
2. **Chain ID Detection**: Automatically fetches chain ID from the RPC endpoint
3. **Deterministic Deployment**: Uses Safe Singleton Factory for CREATE2 deployments
4. **Post-deployment Verification**: Verifies contracts were deployed correctly
5. **Summary Generation**: Creates JSON summaries and deployment artifacts

### Deployment Output

After deployment, you'll find:
- **Individual contract files**: `deployments/<contract-name>-<timestamp>.json`
- **Summary files**: `deployments/github-actions-summary-<network>-latest.json`
- **Transaction details**: Includes tx hash, block number, gas used, and contract addresses

### Deployment Data Files

Deployment data files are located in `contracts/deployement-data/` and contain:
- `to`: The Safe Singleton Factory address
- `data`: The deployment transaction data (hex-encoded bytecode)
- `expectedAddress`: (Optional) The expectedAddress deployed contract address
- `codeHash`: (Optional) The code hash for verification

## GitHub Actions

This repository includes GitHub Actions workflows for automated deployments via CI/CD.

### Using GitHub Actions

1. Go to the **Actions** tab in your GitHub repository
2. Select the desired workflow:
   - **Deploy Safe 1.3.0 Canonical Contracts**
   - **Deploy Safe 1.4.1 Contracts**
   - **Deploy Safe 1.5.0 Contracts**
   - **Deploy Safe Modules**
3. Click **"Run workflow"**
4. Fill in the required inputs:
   - **Custom RPC URL**: Your network's RPC endpoint (required)
   - **Block Explorer URL**: (Optional) Block explorer URL for transaction links
   - **Network Name**: (Optional) Network identifier for logging
   - **Chain ID**: Automatically detected from RPC (no input needed)

### Workflow Features

- ✅ Automatic chain ID detection from RPC
- ✅ Masked RPC URLs in logs for security
- ✅ Comprehensive deployment summaries
- ✅ Artifact uploads for deployment records
- ✅ Pre-deployment checks to avoid redundant transactions

### Required GitHub Secrets

Configure these secrets in your GitHub repository settings (**Settings → Secrets and variables → Actions**):

- **`PRIVATE_KEY`** - The private key of the deployer account (must start with `0x`)
  - This should be the private key for address: `0x38D48FaDa993b749691E93e4E62259c488bCb766`
  - ⚠️ **Never commit this to the repository**

> 💡 **Tip**: You can use the `custom_rpc_url` input in workflows instead of setting secrets, which is more flexible for different networks.

### Before Running Workflows

**Important**: Ensure the deployer address has sufficient gas tokens before running workflows:

- **Deployer Address**: `0x38D48FaDa993b749691E93e4E62259c488bCb766`
- Send native gas tokens (ETH, MATIC, etc.) to this address on your target network
- Check balance before deployment to avoid failed transactions

See `.github/workflows/README.md` for detailed setup instructions.

## Project Structure

```
.
├── contracts/
│   └── deployement-data/     # Deployment data JSON files
│       ├── module/           # Module deployments
│       │   ├── allowance/
│       │   └── social-recovery/
│       └── smart-account/    # Smart account deployments
│           ├── 1.3.0-155/
│           ├── 1.3.0-canonical/
│           ├── 1.4.1/
│           └── 1.5.0/
├── scripts/
│   ├── deploy-1.3.0-canonical.ts  # Deploy Safe 1.3.0 canonical contracts
│   ├── deploy-1.4.1.ts            # Deploy Safe 1.4.1 contracts
│   ├── deploy-1.5.0.ts            # Deploy Safe 1.5.0 contracts
│   ├── deploy-modules.ts          # Deploy Safe modules
│   ├── create-github-issue.ts     # GitHub issue creation utilities
│   └── create-chain-addition-issue.ts
├── deployments/              # Deployment results and summaries (generated)
├── .github/
│   └── workflows/           # GitHub Actions workflows
└── package.json
```

## Deterministic Deployment

All deployments use **deterministic deployment** via the Safe Singleton Factory, which uses CREATE2 to ensure contracts are deployed to the same addresses across all supported networks.

### Supported Networks

The Safe Singleton Factory is available on many networks. To check if a network is supported, see the [Safe Singleton Factory repository](https://github.com/safe-global/safe-singleton-factory).

## Security Notes

- **Never commit private keys** to the repository
- Use GitHub Secrets for all sensitive data in CI/CD
- Private keys and RPC URLs are automatically masked in logs when running in CI environments
- The deployer address (`0x38D48FaDa993b749691E93e4E62259c488bCb766`) should only be used for deployments
- Keep the private key secure and rotate if compromised

## Gas Token Requirements

### Deployer Address

All deployments use the following deployer address:
```
0x38D48FaDa993b749691E93e4E62259c488bCb766
```

### Before Deployment

**You must send gas tokens to this address** before running any deployment:

1. **Identify the native token** for your target network:
   - Ethereum/EVM chains: ETH
   - Polygon: MATIC
   - BSC: BNB
   - Avalanche: AVAX
   - etc.

2. **Send sufficient tokens** to cover:
   - All deployment transactions
   - Gas fees for contract deployments
   - Network-specific transaction costs

3. **Verify balance** before running deployments:
   ```bash
   # Check balance on Etherscan or your network's explorer
   # Address: 0x38D48FaDa993b749691E93e4E62259c488bCb766
   ```

## License

Private repository
