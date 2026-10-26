# Demo Script

## Start

1. Copy `.env.example` to `.env`; set a unique local document-encryption key and admin/verifier passwords.
2. Run `npm ci`, `npm run db:generate`, `npm run db:push`, and `npm run db:seed`.
3. Start `npm run chain`, then run `npm run deploy`. Put the resulting address in both registry address variables in `.env`.
4. Start `npm run dev`. Use disposable Hardhat accounts on `http://127.0.0.1:8545`, chain ID `31337`. Register a testator and beneficiary. Use seeded verifier/admin credentials from `.env`.

## Walkthrough (about four minutes)

1. **Create:** sign in as testator, link wallet, create a will with three distinct beneficiary wallets and allocations totaling 100%, and show the confirmed transaction.
2. **Document:** upload the will file; verify that the exact original matches and an altered copy does not. Explain that file contents are encrypted off chain while the fingerprint is public on chain.
3. **Verify:** sign in as verifier, submit a demonstration reference, then approve or reject it. The verifier role is checked both by the contract and API.
4. **Claim:** after approval, sign in with a beneficiary wallet matching the allocation; submit a claim and supporting document. The status remains an application workflow record.
5. **Admin:** show the admin role workspace and grant/revoke verifier permission with actual chain transactions.
6. **Execute:** after approval, execute the inheritance workflow once and show the final contract status. Explain that no property, currency, or account is transferred.
7. **Limitations:** this local academic prototype has no government/hospital oracle, legal validation, probate integration, or real asset custody.

For a repeatable API/chain integration run, start the app and run `npm run smoke` (set `SMOKE_BASE_URL` for a non-default port).

