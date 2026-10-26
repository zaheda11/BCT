# Demo Readiness Checklist

**Overall audit status:** PASS WITH WARNINGS. The recorded audit fixed one High, one Medium, and two Low findings. It is not an independent professional audit.

## Unresolved risks to disclose

- No login/registration rate limiting.
- SQLite user, asset, and claim metadata is plaintext.
- Verifier approval/execution and default-admin authority are centralized.
- No automatic chain-to-database reconciler exists; sync failures require replay of the confirmed transaction.

The recorded checks were 10 passing tests, lint, type-check, production build, Prisma validation, Hardhat compilation, and expanded local smoke. The offline npm audit used cached advisory data, not a fresh registry audit. Prisma client generation was blocked by Windows EPERM; Slither and Solhint were unavailable.

## Before the demo

- [ ] Use synthetic names and files only. Do not enter real wills, death certificates, identity documents, bank details, or property references.
- [ ] Install from the committed lockfile with `npm ci`.
- [ ] Copy `.env.example` to ignored `.env` and set the variable names below. Do not commit or display `.env`.
- [ ] In a fresh local setup, run `npm run db:generate`, `npm run db:push`, then `npm run db:seed`. Back up and review before any schema push against data you need to keep.
- [ ] Start the local Hardhat chain with `npm run chain` and leave that terminal open.
- [ ] In another terminal, run `npm run deploy`. Set the printed registry address in `WILL_REGISTRY_ADDRESS` and `NEXT_PUBLIC_WILL_REGISTRY`; the local network uses chain ID 31337.
- [ ] Start the app with `npm run dev`. Use the local URL Next prints.
- [ ] Use the seeded admin and verifier credentials from the local `.env`; never put them in screenshots or presentation slides.
- [ ] Connect a disposable wallet on Hardhat Local at `http://127.0.0.1:8545`, chain ID `31337`. Never reuse local keys elsewhere.

### Required environment variable names

`DATABASE_URL`, `HARDHAT_RPC_URL`, `WILL_REGISTRY_ADDRESS`, `NEXT_PUBLIC_WILL_REGISTRY`, `DOCUMENT_ENCRYPTION_KEY`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `VERIFIER_NAME`, `VERIFIER_EMAIL`, `VERIFIER_PASSWORD`.

`DOCUMENT_ENCRYPTION_KEY` must be 32 bytes encoded as 64 hex characters. Seeded passwords must be at least 12 characters. `SESSION_SECRET` is not used by the implementation; session tokens are random opaque values stored by hash.

## Demo flow

1. Register a synthetic testator and link a disposable wallet by signing the one-use challenge.
2. Create a will with three distinct beneficiary wallet addresses and allocations totaling 100%.
3. Wait for the wallet transaction to confirm. Show its will ID, transaction hash, and version. If the UI reports that chain confirmation succeeded but application sync failed, preserve the hash and retry synchronization instead of creating another will.
4. Upload the exact will file bytes. Verify the original matches and an altered copy does not. Explain that file bytes are encrypted locally with AES-256-GCM while the fingerprint is public on chain.
5. Sign in as verifier, link the verifier wallet, submit the demonstration reference, then approve or reject it. State clearly that this is manual simulation, not government/hospital verification.
6. Sign in as a beneficiary whose wallet appears in the allocation. Submit a claim and synthetic supporting file. Confirm the rightful claimant can access it and unrelated accounts cannot.
7. Sign in as admin, link the default-admin wallet, and grant/revoke verifier permission through local AccessControl transactions.
8. As verifier, execute the approved workflow once. Explain that this records a state only; no money, crypto, property, or bank asset is transferred.
9. Show synthetic counts/audit actions without revealing credentials or document contents.

## Repeatable checks

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
npx prisma validate
npm audit --offline
$env:SMOKE_BASE_URL='http://127.0.0.1:3000'; npm run smoke
```

The smoke test adds synthetic database records and uses fresh in-memory test wallets. It does not reset the database or chain. If sync fails after an on-chain receipt, keep the transaction hash and inspect the UI/API error. On Windows, if Prisma generation reports `EPERM` replacing its engine DLL, stop app processes that use Prisma and retry; do not delete the engine or reset the database to work around the lock.

## Known limitations and recovery

- Hardhat chain 31337 is disposable and controlled by one operator. Restarting it removes contract state; redeploy/update addresses only for a fresh demo setup.
- The verifier reference is manually entered. There is no identity proofing, death-data integration, legal validation, probate processing, or independent evidence source.
- User/asset/claim metadata is plaintext in SQLite. Document bytes are encrypted, but the AES key has no KMS, rotation, or recovery design.
- Verification and execution share one role; admin governance is centralized. Do not use real data or present these demo roles as institutional controls.
- Chain commits and SQLite sync are separate. If sync fails after a receipt, the UI reports the divergence. Re-submit the confirmed transaction hash to the corresponding API workflow; event sync is idempotent. No automatic reconciler exists.
- Claim review is off chain. Claims do not create or transfer assets.
- This prototype is not a legally valid will service or a public-chain deployment.
