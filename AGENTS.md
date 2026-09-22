# Repository working agreement

Read `docs/code-standards.md` before making changes.

## Delivery workflow

The owner has authorized this workflow for every coherent update:

1. Implement and validate the change on a feature branch.
2. Commit the relevant files, push the branch, and create a pull request against `main`.
3. Wait for the applicable CI checks and required reviews to pass. Fix failures in the same PR.
4. Merge automatically using squash merge; enable GitHub auto-merge when branch rules require waiting.
5. Report the PR link and actual merge/check status. Synchronize the local checkout with `main` afterward.

Do not request permission again for the routine create-PR/push/merge steps above.
Do not bypass required reviews, failed checks, branch protection or use admin merge overrides.
If no required-check rule exists, explicitly wait for all CI checks before merging.
If merge is blocked, keep the PR open and report the concrete blocker.

Never commit private keys, `.env*` secrets, tunnel credentials, runtime databases,
or generated Foundry broadcast/cache files. Public deployment manifests and
redacted receipt evidence may be committed. Do not stage unrelated user changes.
