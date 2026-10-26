# Security and Limitations

## Implemented safeguards

- Solidity checks testator ownership, nonzero and unique beneficiary wallets, allocations totaling 10,000 basis points, verifier role, verification state, revocation, and single execution.
- Passwords are salted and hashed with scrypt. Sessions use random tokens stored by hash and HTTP-only, SameSite cookies; secure cookies are enabled in production mode. Unknown-user login performs a dummy password comparison.
- Wallet linking uses a short-lived one-use signed challenge. API routes enforce roles and ownership.
- Chain sync checks local chain ID, successful receipt, expected registry event and arguments, transaction signer, and authoritative contract state.
- Document bytes are encrypted using AES-256-GCM before writing to local storage. Download decrypts and validates the stored digest. Upload size/type checks are applied.
- Beneficiary-facing claim and document queries are scoped to the linked beneficiary wallet/account.

## Limits and risks

This is a local development prototype, not a legally valid will service. There is no identity proofing, MFA, password reset, login rate limiting, government/hospital oracle, probate workflow, jurisdictional legal validation, or independent security audit. Verifier evidence is a manually entered reference. Admin and verifier keys are local development keys.

The database is SQLite and encrypted files live on the local filesystem. The AES key is supplied through an environment variable; there is no managed KMS, backup/rotation design, multi-host storage, or retention/deletion workflow. Production deployment needs hardened infrastructure, monitoring, rate limiting, consent and access controls, tested recovery, and formal key custody.

Addresses, allocations, hashes, and contract workflow state are public on chain. Hashes can disclose whether a guessed document was registered. Asset descriptions, claims, and full document bytes are off chain, but local database access remains sensitive.

`executeInheritance` only marks the contract workflow complete. It does not move cryptocurrency, money, property, or bank deposits. No public/testnet/mainnet deployment or institutional integration is included.

Before any real use: obtain jurisdiction-specific legal advice, establish legal identity/evidence processes and appeal paths, commission independent contract and application audits, design institutional key custody and disaster recovery, and integrate external organizations only under formal agreements.
