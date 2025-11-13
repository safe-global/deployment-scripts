# Safe Deployments Scripts

A modern Viem-based repository for deploying Safe Smart Account contracts using deterministic deployment via the Safe Singleton Factory.

## Overview

This repository provides scripts for deploying Safe Smart Account contracts from deployment data JSON files. All deployments use deterministic deployment via the [Safe Singleton Factory](https://github.com/safe-global/safe-singleton-factory) to ensure contracts are deployed to the same addresses across all supported networks.

## Prerequisites

- Node.js >= 18.0.0
- pnpm (recommended) or npm

## Installation

1. Install dependencies:
```bash
pnpm install
```

2. Set up environment variables:
```bash
# Create .env file
PRIVATE_KEY=0x...  # Your deployer private key (must start with 0x)
RPC_URL=https://...  # RPC URL for your network
# Or use network-specific variables:
# SEPOLIA_RPC_URL=https://...
# MAINNET_RPC_URL=https://...
```

## Usage

### Send Deployment Transaction

Deploy a contract using a deployment data JSON file:

```bash
pnpm send-deployment-tx <path-to-deployment-data.json> --network <network-name>
```

**Example:**
```bash
pnpm send-deployment-tx contracts/deployement-data/module/social-recovery/0.1.0.json --network sepolia
```

### Deployment Data Files

Deployment data files are located in `contracts/deployement-data/` and contain:
- `to`: The Safe Singleton Factory address
- `data`: The deployment transaction data (hex-encoded bytecode)
- `expected`: (Optional) The expected deployed contract address
- `codeHash`: (Optional) The code hash for verification

## GitHub Actions

This repository includes GitHub Actions workflows for automated deployments:

### Manual Deployment

1. Go to **Actions** tab in GitHub
2. Select **"Deploy Safe Contracts"** or **"Deploy Specific Contract"**
3. Click **"Run workflow"**
4. Fill in the required inputs

### Required Secrets

Configure these secrets in your GitHub repository settings:

- `PRIVATE_KEY` - The private key of the deployer account (must start with 0x)
- `RPC_URL` - Default RPC URL, or network-specific secrets:
  - `SEPOLIA_RPC_URL`
  - `MAINNET_RPC_URL`
  - `GOERLI_RPC_URL`
  - `BASE_RPC_URL`
  - `OPTIMISM_RPC_URL`
  - `ARBITRUM_RPC_URL`
  - `POLYGON_RPC_URL`

See `.github/workflows/README.md` for detailed setup instructions.

## Project Structure

```
.
├── contracts/
│   └── deployement-data/     # Deployment data JSON files
│       ├── module/            # Module deployments
│       └── smart-account/     # Smart account deployments
│           ├── 1.3.0-155/
│           ├── 1.3.0-canonical/
│           ├── 1.4.1/
│           └── 1.5.0/
├── scripts/
│   └── send-deployment-tx.ts # Main deployment script
├── .github/
│   └── workflows/            # GitHub Actions workflows
└── package.json
```

## Deterministic Deployment

All deployments use **deterministic deployment** via the Safe Singleton Factory, which uses CREATE2 to ensure contracts are deployed to the same addresses across all supported networks.

### Supported Networks

The Safe Singleton Factory is available on many networks. To check if a network is supported, see the [Safe Singleton Factory repository](https://github.com/safe-global/safe-singleton-factory).

## Security Notes

- **Never commit private keys** to the repository
- Use GitHub Secrets for all sensitive data in CI/CD
- Private keys and RPC URLs are masked in logs when running in CI environments

## License

Private repository
