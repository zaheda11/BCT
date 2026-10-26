# Digital Will & Inheritance Management

Academic prototype for a blockchain-backed will record and inheritance workflow. It combines a local Hardhat EVM, Solidity contract, Next.js application, Prisma/SQLite metadata store, password sessions, wallet-signature linking, encrypted local document storage, verifier workflow, and beneficiary claims.

## What works

- Create and version a will with beneficiary allocations enforced on chain.
- Revoke a will, submit a verifier reference, approve/reject verification, and record one-time inheritance execution.
- Register and sign in as testator/beneficiary; verifier and administrator accounts are seeded locally. Link an Ethereum wallet by signing a one-use challenge.
- Persist application metadata in SQLite. API routes verify confirmed transaction receipts, event contents, signer identity, and authoritative contract state before syncing workflow changes.
- Upload documents to local storage encrypted with AES-256-GCM. Verify uploaded bytes against SHA-256 fingerprints. Will document fingerprints are anchored on chain; claim/supporting documents remain off chain.
- Submit beneficiary claims after verification approval, attach supporting files, and manage verifier roles through an admin page backed by actual AccessControl transactions.

The contract's `executeInheritance` only records workflow completion. It does not transfer money, cryptocurrency, property, or bank funds.

## Requirements and local setup

Use Node.js 20.19+ or 22.12+ and npm. Install dependencies, copy `.env.example` to `.env`, and provide a unique `DOCUMENT_ENCRYPTION_KEY` plus seeded `ADMIN_PASSWORD` and `VERIFIER_PASSWORD`. The encryption key must be 32 bytes encoded as 64 hex characters. Keep `.env` private.

```powershell
npm ci
npm run db:generate
npm run db:push
npm run db:seed
```

In a separate terminal start the local chain, then deploy the contract:

```powershell
npm run chain
npm run deploy
```

Copy the printed contract address into both `WILL_REGISTRY_ADDRESS` and `NEXT_PUBLIC_WILL_REGISTRY` in `.env`. The deployer is the local admin; Hardhat account 1 is the initial verifier. These accounts are for disposable local development only.

Start the web app:

```powershell
npm run dev
```

Open the local URL printed by Next.js, register testator/beneficiary accounts, and sign in with the seeded verifier/admin credentials from `.env`. Add the local Hardhat network to MetaMask (`http://127.0.0.1:8545`, chain ID `31337`) and use disposable local accounts. Do not reuse local development keys elsewhere.

## Verification

```powershell
npm test
npm run lint
npm run build
npx prisma validate
npm run smoke
```

The smoke script exercises role-based account/wallet linking, will creation, document encryption and hash match/mismatch, invalid uploads, cross-user download denial, claims, verifier/admin role changes, event replay, failed-transaction rejection, and one-time inheritance execution. Set `SMOKE_BASE_URL` if the dev server is not on port 3000.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Demo script](docs/DEMO_SCRIPT.md)
- [Project report](docs/PROJECT_REPORT.md)
- [Security and limitations](docs/SECURITY_AND_LIMITATIONS.md)
- [Security audit report](docs/SECURITY_AUDIT_REPORT.md)
- [Functional test report](docs/FUNCTIONAL_TEST_REPORT.md)
- [Audit remediation log](docs/AUDIT_REMEDIATION_LOG.md)
- [Demo readiness checklist](docs/DEMO_READINESS_CHECKLIST.md)
- [Final submission summary](docs/FINAL_SUBMISSION_SUMMARY.md)

This is a local prototype, not a legal will service. It has no government, hospital, bank, property registry, or probate integration; no production identity assurance; and no real asset transfer. SQLite and encrypted files are local development storage, not a production deployment design.

## Latest local verification (2026-10-25)

- Test suite: **10 passing** (8 contract tests and 2 chain-ID guard tests).
- `npm run lint`: **passed**, no ESLint warnings or errors.
- `npm run build`: **passed**.
- `npx prisma validate` and `npm run db:push`: **passed**; the SQLite schema is valid and in sync.
- `npx hardhat compile`: **passed**; no pending compilation.
- `npm run smoke` against local chain 31337: **passed**; document match/mismatch, invalid uploads, authorized/unauthorized downloads, claim idempotency, event replay, failed transaction rejection, role changes, and inheritance execution all completed.

`npm run db:generate` was blocked on this Windows host by `EPERM` while replacing the existing Prisma query-engine DLL. No generated files were forcibly removed; the existing client supported the passing build and smoke flow. See the audit report for scope and remaining risks.


