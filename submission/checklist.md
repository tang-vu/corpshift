# Submission checklist

## Pre-submit

- [x] `pnpm install` clean on fresh checkout
- [x] `pnpm demo` boots full stack (anvil → deploy → indexer → api → web)
- [x] `pnpm demo:check` — 13/13 assertions pass on live stack
- [x] `forge test` — 61/61
- [x] `pnpm test` — 41/41 vitest
- [x] `pnpm e2e` — 3/3 Playwright (real browser, real txs)
- [x] `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `forge fmt --check` — clean
- [x] `pnpm build` — all packages + web production build
- [x] Docker build context complete (forge-std submodule documented)
- [x] README quickstart verified verbatim on fresh stack
- [x] No secrets in repo (demo keys are anvil public accounts)
- [x] `.gitignore` covers data/, test-results/, .claude/, node_modules
- [x] deployments/31337.json committed (local demo manifest)

## Submission package

- [x] `submission/hackquest.md` — project writeup
- [x] `submission/demo-script.md` — ~4min walkthrough
- [x] `submission/checklist.md` — this file
- [x] `submission/judge-notes.md` — what to look for
- [x] `submission/x-post.md` — announcement post text
- [ ] Demo video recorded (follow demo-script.md)
- [x] Testnet deploy **simulated** on live 46630 RPC (~9.85M gas, ~0.0002
      ETH) — broadcast only needs a faucet-funded key (documented in
      deployment-guide.md)

## Judge verification path (5 min)

```bash
git submodule update --init --recursive
pnpm install
pnpm demo          # wait for "demo stack is live"
# → open http://localhost:8056/lab, click through 6 steps
pnpm demo:check    # in a second terminal — 13 green checks
```

No api keys, no faucets, no external accounts needed.
