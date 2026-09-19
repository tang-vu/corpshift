# syntax=docker/dockerfile:1
# CorpShift demo stack — single container running the full demo:
# anvil (local chain) → forge deploy → indexer → api → web.
#
#   docker build -t corpshift .
#   docker run --rm -p 3000:3000 -p 4000:4000 -p 8545:8545 corpshift
#   open http://localhost:3000/lab
#
# The build context must include the forge-std submodule
# (git submodule update --init --recursive) — the RUN step below
# falls back to `forge install` if it is absent.

FROM node:24-bookworm-slim

# Foundry toolchain (anvil for the local chain, forge for Deploy.s.sol).
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && curl -L https://foundry.paradigm.xyz | bash \
 && /root/.foundry/bin/foundryup
ENV PATH="/root/.foundry/bin:${PATH}"

RUN corepack enable
WORKDIR /app

# Dependency layer first so source edits don't bust the install cache.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/indexer/package.json apps/indexer/
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/shared/package.json packages/shared/
COPY packages/sdk/package.json packages/sdk/
RUN pnpm install --frozen-lockfile

COPY . .

# forge-std submodule may be missing from a shallow context — recover it.
RUN cd packages/contracts \
 && ([ -f lib/forge-std/src/Test.sol ] || forge install foundry-rs/forge-std --no-git)

EXPOSE 3000 4000 8545

HEALTHCHECK --interval=10s --timeout=5s --start-period=90s --retries=30 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "demo"]
