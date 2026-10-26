# Architecture

## Components

- **Next.js application:** responsive overview, authentication, and role-specific workspaces for wills, assets, documents, verification, claims, inheritance, administration, and transactions.
- **Solidity registry:** stores will ID, testator address, versioned SHA-256 document hash, beneficiary addresses and shares, revocation, verification decision, and executed state. OpenZeppelin `AccessControl` protects verifier and admin actions.
- **API layer:** session-protected routes use Prisma/SQLite for off-chain metadata. Chain-dependent workflows validate the receipt, registry event, transaction sender, and current contract state before recording the event.
- **Local document store:** files are AES-256-GCM encrypted on disk. Metadata includes the SHA-256 digest and document association. The encryption key is provided through the environment.
- **Wallet identity:** password session authenticates the app account; an expiring one-use challenge signed with EIP-191 links an Ethereum wallet to it.

## Data boundary

On chain: will ID, document hash, version, testator and beneficiary addresses, allocation basis points, verifier reference hash, workflow status, and transaction events. Off chain: names, email, asset descriptions/values, claim details, and document bytes. This split does not make the local SQLite store or local filesystem production-grade.

## Main flows

1. Testator registers/signs in, links a wallet, signs a contract create/update call, and syncs transaction metadata through the API.
2. A document upload is encrypted off chain. The app hashes exact file bytes and checks will-document hashes against the current contract version.
3. A verifier submits a reference hash and approves/rejects it through contract calls; confirmed events are synced to the database.
4. After approval, a beneficiary with a matching linked wallet can submit a claim and upload supporting material.
5. Admin grants/revokes verifier role with an on-chain AccessControl transaction. Verifier can record inheritance execution once approved.

## Constraints

`executeInheritance` records completion only; it does not transfer assets. Verification references are manually entered by the verifier, not obtained from a government/hospital oracle. The configured development network is local Hardhat, chain ID 31337. No Fabric network, public chain deployment, institutional integrations, or legal/probate service is part of this project.
