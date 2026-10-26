# Project Report: Digital Will and Inheritance Management

## Abstract

This academic prototype demonstrates a versioned digital-will record and verifier-gated inheritance workflow using Solidity on a local Hardhat EVM. It anchors document fingerprints and wallet allocations on chain, while a Next.js application and Prisma/SQLite store manage off-chain users, asset descriptions, encrypted documents, and beneficiary claims. The prototype demonstrates tamper-evident workflow records; it does not validate legal status or transfer real-world assets.

## Problem and objectives

Paper and digital inheritance information can be lost, altered, disputed, or difficult to audit. A shared ledger can make recorded state changes verifiable, but cannot itself prove a will is legally valid or an oracle's evidence is true. The project objectives are to implement allocation validation, document hash versioning, role-protected verification, revocation, claims, and one-time completion with a browser-accessible workflow.

## Scope and architecture

The solution uses a Solidity `WillRegistry`, OpenZeppelin `AccessControl`, a local Hardhat chain (chain ID 31337), Next.js routes and UI, Prisma with SQLite, password sessions, signed wallet linking, and AES-256-GCM local file storage. APIs validate chain receipts, events, signers, and authoritative contract state before syncing workflow events. Names, asset details, claim records, and file bytes remain off chain. The system has no Fabric deployment, public-chain deployment, or external identity/healthcare/legal/banking integrations.

## Smart contract

The contract supports `createWill`, `updateWill`, `revokeWill`, `submitVerification`, `decideVerification`, and `executeInheritance`, with getters for will versions and beneficiary allocations. Share validation requires unique nonzero addresses and a total of 10,000 basis points. Only the testator may revise/revoke; only an authorized verifier may decide and execute. Execution requires an active will with approved verification and can occur once. The contract records completion; no external assets are transferred.

## Application features

Users can register as testators or beneficiaries. Verifier and administrator accounts are seeded for the local demonstration. An EIP-191 challenge links a wallet to a session account. The testator creates wills, adds assets, uploads encrypted documents, and checks document fingerprints. Verifiers submit a reference and decide approval/rejection. Beneficiaries submit claims and supporting documents after approval. Administrators grant or revoke the verifier role on chain. Workspace views are role-protected.

## Security and limitations

Passwords use salted scrypt hashes, sessions use opaque random tokens stored by hash, wallet challenges are one-use, and document uploads are encrypted with AES-256-GCM. These controls are implementation details for a local prototype, not a security certification. SQLite/local file storage, environment-managed keys, missing MFA/rate limiting, lack of institutional proofing, and absence of external verification remain material limitations. Public chain data includes wallet addresses, allocations, hashes, and workflow state. No legal validity or real-world transfer is implied.

## Verification performed

The local environment was initialized with Prisma/SQLite and a Hardhat contract deployment. Solidity tests cover creation/allocations, invalid inputs, version history, verification retry and access control, one-time execution, revocation, and unknown reads. The end-to-end smoke flow covers account/wallet linking, will creation and metadata sync, encrypted upload and matching/mismatching file hashes, verifier approval, beneficiary claim and supporting file, unauthorized claim-review rejection, admin role grant/revoke, and inheritance execution. See the project README for the current command results and repeatable commands.

## Conclusion and future work

The prototype demonstrates how a chain can anchor a will fingerprint and enforce workflow permissions while an application handles private metadata. Future work includes independent legal and security review, stronger identity assurance, managed key custody and document storage, rate limiting, audit/retention processes, and integrations with authorized institutions. Any production system would require jurisdiction-specific governance and formal institutional agreements.
