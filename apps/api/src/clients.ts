/**
 * Chain clients — one public client for reads, plus lazily-built wallet
 * clients for the demo roles (user, operator, liquidator, attester).
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CorpShiftClient } from "@corpshift/sdk";
import {
  anvilLocal,
  robinhoodMainnet,
  robinhoodTestnet,
  LOCAL_CHAIN_ID,
  ROBINHOOD_MAINNET_CHAIN_ID,
  ROBINHOOD_TESTNET_CHAIN_ID,
} from "@corpshift/shared";
import type { ApiConfig } from "./config.ts";

const CHAIN_DEFS: Record<number, Chain> = {
  [LOCAL_CHAIN_ID]: anvilLocal,
  [ROBINHOOD_MAINNET_CHAIN_ID]: robinhoodMainnet,
  [ROBINHOOD_TESTNET_CHAIN_ID]: robinhoodTestnet,
};

export interface ChainClients {
  chain: Chain;
  publicClient: PublicClient;
  corpshift: CorpShiftClient;
}

export function buildClients(cfg: ApiConfig): ChainClients {
  const chain = CHAIN_DEFS[cfg.chainId];
  if (!chain) throw new Error(`no chain definition for ${cfg.chainId}`);
  const publicClient = createPublicClient({
    chain,
    transport: http(cfg.rpcUrl),
  }) as PublicClient;
  const corpshift = new CorpShiftClient({
    publicClient,
    registry: cfg.manifest.registry,
    chainId: cfg.chainId,
    ...(cfg.manifest.settlementVault ? { settlementVault: cfg.manifest.settlementVault } : {}),
  });
  return { chain, publicClient, corpshift };
}

export function walletFor(chain: Chain, rpcUrl: string, key: Hex) {
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
  return { account: account as Account, wallet: wallet as WalletClient };
}
