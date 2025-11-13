# Contracts Directory

This directory should contain the Safe contract sources from different releases.

## Setup Options

### Option 1: Git Submodules (Recommended)

```bash
# From the project root
git submodule add -b v1.5.0 https://github.com/safe-fndn/safe-smart-account.git safe-smart-account-v1.5.0
git submodule add -b v1.4.1-3 https://github.com/safe-fndn/safe-smart-account.git safe-smart-account-v1.4.1-3
git submodule add https://github.com/safe-fndn/safe-modules.git safe-modules

git submodule update --init --recursive
```

### Option 2: Manual Copy

1. Clone each repository at the specific tag:
```bash
git clone -b v1.5.0 https://github.com/safe-fndn/safe-smart-account.git temp-v1.5.0
git clone -b v1.4.1-3 https://github.com/safe-fndn/safe-smart-account.git temp-v1.4.1-3
git clone https://github.com/safe-fndn/safe-modules.git temp-modules
```

2. Copy the contracts to this directory:
```bash
cp -r temp-v1.5.0/contracts/* ./v1.5.0/
cp -r temp-v1.4.1-3/contracts/* ./v1.4.1-3/
cp -r temp-modules/contracts/* ./modules/
```

3. Clean up:
```bash
rm -rf temp-*
```

### Option 3: Use Setup Script

Run the setup script from the project root:
```bash
./scripts/setup-contracts.sh
```

## Directory Structure

After setup, your contracts directory should look like:

```
contracts/
├── safe-smart-account-v1.5.0/  (or v1.5.0/)
│   └── contracts/
│       ├── Safe.sol
│       ├── SafeProxyFactory.sol
│       └── ...
├── safe-smart-account-v1.4.1-3/ (or v1.4.1-3/)
│   └── contracts/
│       ├── Safe.sol
│       ├── SafeProxyFactory.sol
│       └── ...
└── safe-modules/ (or modules/)
    └── contracts/
        ├── SocialRecoveryModule.sol
        └── ...
```

## Note

You may need to update the deployment scripts (`scripts/deploy-*.ts`) to match the actual contract paths and names based on how you organize the contracts here.

