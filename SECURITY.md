# Security policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately — do **not** open a public
issue. Email: security@corpshift.dev (placeholder — see below).

For the hackathon evaluation period, you can also open a GitHub Security
Advisory on this repository, which keeps the report private until a fix
lands.

Include: affected contract/component, attack scenario, expected vs actual
behavior, and a minimal reproduction (a forge test is ideal). We aim to
acknowledge within 72 hours.

## Scope

**In scope:**

- `packages/contracts/src/**` — registry, policy engine, adapters,
  settlement vault, attestation library
- `packages/core/src/**` — canonicalization, EIP-712 encoding (a divergence
  from Solidity's digest is a security bug)
- `apps/indexer/src/**`, `apps/api/src/**` — attestation signing, onchain
  submission, demo conductor
- Signature verification, replay protection, state-machine transitions,
  normalization-factor verification

**Out of scope:**

- `packages/contracts/src/mocks/**`, `src/demo/**` — test/demo contracts
  (permissionless mints by design)
- Third-party code (`lib/forge-std`, dependencies)
- The Robinhood API itself, oracle price correctness, chain liveness
- Social engineering, physical attacks, issues requiring keys we never ship

## Design notes worth knowing before reporting

- Attestation is the security boundary: `submitAction` only accepts actions
  signed by a registry-authorized attester (EIP-712, domain-bound to
  chain+contract, low-`s`, `v∈{27,28}`).
- `applyAction` **verifies** the token's live `uiMultiplier()` against the
  attested factor — a forged factor cannot reconcile to `ACTIVE`.
- Governance (owner) can register assets, manage attesters, and invalidate
  actions. In the demo deployment it is an EOA — centralization is known and
  documented, not a finding.
- Demo keys are anvil's well-known accounts — they are public by design and
  carry no value.

See [docs/threat-model.md](docs/threat-model.md) for the full analysis,
including honest residual risks.
