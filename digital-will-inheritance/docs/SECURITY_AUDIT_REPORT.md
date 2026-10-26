# Security Audit Report

**Audit date:** 2026-10-25  
**Overall status:** PASS WITH WARNINGS  
**Scope:** Existing `digital-will-inheritance` local prototype. No production deployment or real personal records were used.

## Architecture reviewed

- Solidity `WillRegistry` with OpenZeppelin `AccessControl`, testator ownership, versioned document fingerprints, beneficiary allocations, verifier decisions, revocation, and one-time inheritance completion.
- Next.js frontend and API routes for account sessions, wallet linking, wills, assets, documents, claims, verification workflow, and role administration.
- Prisma/SQLite data model, scrypt password digests, opaque hashed sessions, one-use EIP-191 wallet challenges, AES-256-GCM local document storage, and SHA-256 integrity verification.
- Hardhat configuration, deployment and seed scripts, Solidity tests, and end-to-end smoke script.

## Findings summary

| Severity | Total | Fixed | Open |
|---|---:|---:|---:|
| Critical | 0 | 0 | 0 |
| High | 1 | 1 | 0 |
| Medium | 4 | 1 | 3 |
| Low | 3 | 2 | 1 |
| Informational | 1 | 0 | 1 |

### High — fixed

**AUD-01: Verifiers could retrieve beneficiary claim records and decrypted claim documents.** Before remediation, verifier accounts were exempted from the document download ownership check, and the claim listing accepted verifiers. Will responses also included claim details and claim-document metadata for verifier-visible pending wills. That allowed a verifier who learned a document ID to retrieve unrelated supporting documents.

**Affected:** `app/api/documents/[documentId]/route.ts`, `app/api/wills/[willId]/documents/route.ts`, `app/api/wills/[willId]/claims/route.ts`, `app/api/wills/route.ts`, and `app/api/wills/[willId]/route.ts`.

**Fix:** Verifiers can access only non-claim documents for active wills with pending verification. The claim listing rejects verifier access. Verifier will responses omit claims and claim-document relations, and document JSON is explicitly shaped to omit nested claim-owner details.

**Evidence:** The production smoke passed: rightful claimant document download succeeded; unauthenticated downloads returned 401; unrelated beneficiary and verifier claim/document requests returned 403.

### Medium — fixed

**AUD-02: The RPC chain-ID check trusted ethers’ configured static network.** With `staticNetwork: true`, `getNetwork()` can return the configured ID without proving the remote RPC endpoint actually serves that chain.

**Affected:** `lib/chain.ts`, new `lib/chain-id.js` and `lib/chain-id.d.ts`.

**Fix:** The server sends raw JSON-RPC `eth_chainId` for transaction validation, role changes, and authoritative will reads. Wrong/malformed IDs are rejected. Known invalid or unconfirmed transactions now return 409.

**Evidence:** `test/chain-id.test.js` accepts 31337 and rejects `0x1` and malformed values. The final production smoke passed against the configured local deployment.

### Low — fixed

**AUD-03: Duplicate asset allocation wallets and invalid verification files were not cleanly rejected.** Duplicate rows could reach a database uniqueness constraint; invalid file bytes in the verify route escaped validation as a generic 500.

**Affected:** `app/api/wills/route.ts`, `app/api/wills/[willId]/assets/route.ts`, `app/api/documents/[documentId]/verify/route.ts`.

**Fix:** Validate allocation object shape, wallet syntax, uniqueness, beneficiary membership, and total shares before persistence. Catch file validation failures and return 400.

**Evidence:** Smoke rejected duplicate asset allocations, invalid PDF content, and invalid text bytes with HTTP 400.

### Low — fixed

**AUD-04: The app lacked baseline browser security headers.**

**Affected:** `next.config.js`.

**Fix:** Added `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, a strict referrer policy, and a restrictive permissions policy. CSP/HSTS were not added: the app has no nonce-based CSP setup, and the audited deployment is local HTTP.

**Evidence:** Production smoke confirmed the frame and content-type headers.

### Medium — open

**AUD-05: Login and registration are not rate-limited.** Scrypt slows password guessing but unlimited attempts can still consume CPU and enable brute-force attempts. Add a persistent/distributed limiter and monitoring before exposing the app to untrusted networks.

### Medium — open

**AUD-06: SQLite application metadata is plaintext at rest.** Document bytes are AES-256-GCM encrypted, but account names/emails, asset descriptions/values, and claim details are ordinary SQLite fields. This is suitable only for synthetic local demos with filesystem protection. Do not store real estate or identity information in this prototype.

### Medium — open

**AUD-07: One verifier role handles evidence submission, approval, and execution; the default-admin key is centralized.** A verifier can approve its own manually supplied demo reference and execute the workflow. Admin-key loss or compromise has no multisig recovery process. Production separation of duties and governed key custody require contract/governance redesign and redeployment, so no such changes were made in this in-place audit.

### Low — open

**AUD-08: Chain commits and SQLite synchronization are sequential.** The app waits for a confirmed receipt, then posts it for API sync. The UI reports when chain confirmation succeeded but application sync failed, and transaction replay is idempotent. There is no automatic event indexer/reconciler, so the application history can remain incomplete until the confirmed transaction is replayed through the API.

### Informational

**AUD-09: This is a local workflow prototype, not a legal or asset-transfer system.** Chain ID is 31337. Verifier references are manual; there is no independent government or hospital evidence lookup. `executeInheritance` records a boolean/event only. There is no public-chain deployment, probate authority, bank/property integration, or real-world asset transfer.

## Controls reviewed

- Contract checks testator ownership, AccessControl roles, nonzero unique beneficiary addresses, shares totaling exactly 10,000 basis points, active state, approved verification, revocation, and one-time execution. Solidity 0.8 checked arithmetic is used. The contract makes no external calls, so reentrancy is not applicable to its current implementation.
- API routes enforce session, role, ownership, linked-wallet, receipt, event, signer, and current contract-state checks where relevant. UI visibility is not used as the authorization boundary.
- Session tokens are random 32-byte values stored by SHA-256 digest; cookies are HTTP-only and SameSite strict, with Secure in production. Passwords use salted scrypt. Wallet challenges expire and are atomically consumed.
- Uploaded filenames are sanitized, storage names are random UUIDs created exclusively, MIME/size/basic signatures are checked, content is encrypted with AES-256-GCM, and decrypted bytes are hash-checked. Database metadata and document metadata remain plaintext.
- Contract events are checked against the configured contract address and successful receipt. Duplicate event processing is idempotent. No automatic listener exists.
- No `dangerouslySetInnerHTML`, direct `innerHTML`, or dynamic `eval` was found in reviewed UI/library code.

## Commands and tools actually run

| Command/tool | Result |
|---|---|
| `npm test` | PASS — 10 tests: 8 contract tests and 2 chain-ID guard tests. |
| `npx hardhat compile` | PASS — “Nothing to compile” after prior compilation. |
| `npm run lint` | PASS — no ESLint warnings/errors; Next reports `next lint` deprecation for a future release. |
| `npx tsc --noEmit` | PASS — zero exit status. |
| `npm run build` | PASS — production build and type validation completed. |
| `npx prisma validate` | PASS — schema valid. |
| `npm audit --offline` | PASS with scope limit — 0 vulnerabilities in cached advisory metadata; this is not a fresh registry audit. |
| `npm ls --depth=0` | PASS — installed dependency tree inspected; no packages were upgraded. |
| `npm run smoke` | PASS — synthetic auth, will sync, document, claim, authorization, role, event replay, and execution flows on local chain 31337. |
| Slither / Solhint | NOT RUN — neither executable is installed. |
| `npm run db:generate` | BLOCKED — Windows returned `EPERM` replacing Prisma’s query-engine DLL. The existing generated client supported build/tests/smoke; no file was forcibly replaced. |
| `npm run db:push` | Not rerun: Prisma schema was unchanged, and the instruction was to preserve the existing database. Schema validation passed. |

## Audit limitations

This was a source review and local test run, not an independent formal security audit, penetration test, load test, or legal review. Dependency advisory data was offline/cached. The tested deployment is local Hardhat, not a public chain. No real account, will, death certificate, bank detail, or identity document was used. The existing database and deployment were preserved; synthetic smoke records were appended.
