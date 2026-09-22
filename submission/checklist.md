# Submission checklist

## Pre-submit

- [ ] Reverify install and quickstart on a separate fresh checkout before submission
- [x] `pnpm demo` boots full stack (anvil → deploy → indexer → api → web)
- [x] `pnpm demo:check` — 13/13 assertions pass on live stack
- [x] `forge test` — 61/61
- [x] `pnpm test` — 44/44 vitest
- [x] `pnpm e2e` — 8/8 Playwright (real-chain scenario, injected failures, mobile layouts, illustration and navigation)
- [x] `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `forge fmt --check` — clean
- [x] `pnpm build` — all packages + web production build
- [x] Docker build context complete (forge-std submodule documented)
- [x] Local demo stack boots and passes acceptance checks in the current workspace
- [x] Testnet key in Git-ignored .env.robinhood-testnet; public sandbox uses Anvil public accounts
- [x] `.gitignore` covers data/, test-results/, .claude/, node_modules
- [x] deployments/31337.json committed (local demo manifest)

- [x] Robinhood testnet deployment: 10 contracts, 17 successful receipts; see deployments/46630-evidence.json
- [x] Public demo URL: https://corpshift.tangvu.dev (Anvil lab + separate testnet deployment proof)
- [ ] Recorded walkthrough
- [ ] Recheck event terms and submission deadline

## Submission package

- [x] `submission/hackquest.md` — project writeup
- [x] `submission/demo-script.md` — ~4min walkthrough
- [x] `submission/checklist.md` — this file
- [x] `submission/judge-notes.md` — what to look for
- [x] `submission/x-post.md` — announcement post text
- [ ] Demo video recorded (follow demo-script.md)
- [x] Testnet deployment broadcast and read back on 2026-09-22; mock-token demo surface. Full testnet scenario and explorer source verification remain separate work.

## Judge verification path (5 min)

```bash
git submodule update --init --recursive
pnpm install
pnpm demo          # wait for "demo stack is live"
# → open http://localhost:8056/lab, click through 6 steps
pnpm demo:check    # in a second terminal — 13 green checks
```

No api keys, no faucets, no external accounts needed.
