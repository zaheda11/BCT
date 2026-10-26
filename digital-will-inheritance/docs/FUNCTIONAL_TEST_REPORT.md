# Functional Test Report

**Run date:** 2026-10-25  
**Environment:** Local Hardhat chain 31337, configured local registry, existing SQLite database, synthetic accounts/files only.
**Overall audit status:** PASS WITH WARNINGS. The recorded evidence supports 4 fixed findings (1 High, 1 Medium, 2 Low); the remaining risks are listed below.

| ID | Scenario | Expected result | Actual result | Status | Evidence |
|---|---|---|---|---|---|
| C-01 | Create will with valid distinct beneficiaries and shares | Register version 1 and emit creation/beneficiary events | Contract test passed | PASS | `test/WillRegistry.test.js` |
| C-02 | Empty arrays, duplicate addresses, zero/invalid shares, wrong total | Reject invalid allocation input | Contract test passed | PASS | `test/WillRegistry.test.js` |
| C-03 | Testator updates will; other wallet attempts update | Preserve prior version hash; reject unauthorized update | Contract test passed | PASS | `test/WillRegistry.test.js` |
| C-04 | Revision while verification pending/approved; retry after rejection | Block unsafe revision and permit retry after rejection | Contract test passed | PASS | `test/WillRegistry.test.js` |
| C-05 | Non-verifier verification/decision; execution without approval | Reject unauthorized/ineligible calls | Contract test passed | PASS | `test/WillRegistry.test.js` |
| C-06 | Approved inheritance execution and repeat execution | First execution succeeds once; second reverts | Contract test passed; smoke confirmed duplicate rejection | PASS | `test/WillRegistry.test.js`, `scripts/smoke-local.cjs` |
| C-07 | Reject verification; revoke will; edit after revocation | Rejection blocks execution; revoked will cannot be edited | Contract tests passed | PASS | `test/WillRegistry.test.js` |
| C-08 | Read unknown will/version | Revert | Contract test passed | PASS | `test/WillRegistry.test.js` |
| C-09 | RPC chain ID guard | Accept 31337; reject wrong/malformed chain IDs | 2 tests passed | PASS | `test/chain-id.test.js` |
| API-01 | Register/sign in and link wallets for testator, beneficiary, verifier, admin | Session and signed wallet link succeed | Smoke passed | PASS | `scripts/smoke-local.cjs` |
| API-02 | Beneficiary attempts will creation | Reject non-testator role | HTTP 403 | PASS | `scripts/smoke-local.cjs` |
| API-03 | Create will and read persisted data in a new production server process | Confirmed chain data syncs; API reads expected records | Smoke passed; admin metrics included prior records plus the new run | PASS | `scripts/smoke-local.cjs` |
| API-04 | Duplicate asset allocation wallet | Reject before persistence | HTTP 400 | PASS | `scripts/smoke-local.cjs` |
| DOC-01 | Upload encrypted will document and verify original bytes | Upload succeeds; SHA-256 matches | Match true | PASS | `scripts/smoke-local.cjs` |
| DOC-02 | Verify altered document bytes | Detect mismatch | Match false | PASS | `scripts/smoke-local.cjs` |
| DOC-03 | Upload invalid PDF content / invalid UTF-8 text | Reject malformed file bytes | Both HTTP 400 | PASS | `scripts/smoke-local.cjs` |
| DOC-04 | Claimant downloads own encrypted supporting file | Return decrypted bytes matching original | HTTP 200 and exact-byte equality | PASS | `scripts/smoke-local.cjs` |
| DOC-05 | Unauthenticated, unrelated beneficiary, or verifier requests claim file | Reject access | HTTP 401/403 as appropriate | PASS | `scripts/smoke-local.cjs` |
| API-05 | Submit same open claim twice | Return existing open claim; do not duplicate it | Same claim ID returned | PASS | `scripts/smoke-local.cjs` |
| API-06 | Verifier requests claims or claim documents; outsider requests will/claims | Deny access | HTTP 403 | PASS | `scripts/smoke-local.cjs` |
| API-07 | Submit confirmed verification/decision/execution events, then replay | Persist once; replay returns idempotent response | Replays marked idempotent | PASS | `scripts/smoke-local.cjs` |
| API-08 | Submit nonexistent transaction hash as confirmed inheritance event | Reject and do not persist transaction | HTTP 409; no transaction row for hash | PASS | `scripts/smoke-local.cjs` |
| API-09 | Non-admin grants/revokes verifier; non-admin reviews claim | Reject unauthorized operations | HTTP 403 | PASS | `scripts/smoke-local.cjs` |
| API-10 | Admin grants and revokes verifier with actual contract transactions | Sync matching role state | Both operations succeeded | PASS | `scripts/smoke-local.cjs` |
| UI-01 | Check security headers on served page | Include frame/content-type protections | `DENY` and `nosniff` present | PASS | `scripts/smoke-local.cjs` |
| BUILD-01 | Lint, type-check, production build, Prisma validation, offline dependency audit | Complete with recorded outcomes | All passed; offline audit found 0 cached advisories | PASS | Command outputs in audit run |
| DB-01 | Regenerate Prisma client | Complete without changing data | Windows `EPERM` on query-engine DLL replacement | BLOCKED | `npm run db:generate` output |
| RESTART-01 | Start a fresh production app process against the same database | Existing records remain available without duplication | New process reported existing wills/claims and smoke successfully read/write through it; prior process was not explicitly stopped first. | PASS | Smoke response |

The smoke script uses fresh in-memory wallets and funds only the synthetic testator from the local Hardhat admin account. It does not embed or print private keys, and it does not reset the database or chain.

## Unresolved risks

- Login and registration are not rate-limited.
- User, asset, and claim metadata is plaintext in SQLite.
- Verifier approval/execution and default-admin governance are centralized.
- Chain transactions and database sync are sequential; there is no automatic reconciler.

The offline npm audit used cached advisory data and is not a fresh registry audit. Prisma client regeneration was blocked by Windows EPERM replacing the query-engine DLL. Slither and Solhint were unavailable. These items do not change the recorded test outcomes above.


