/**
 * Robinhood Chain network definitions — verified against official docs
 * and live RPC on 2026-09-19 (docs/research/README.md).
 */
import { defineChain } from "viem";

export const ROBINHOOD_MAINNET_CHAIN_ID = 4663;
export const ROBINHOOD_TESTNET_CHAIN_ID = 46630;
export const LOCAL_CHAIN_ID = 31337;

export const robinhoodMainnet = defineChain({
  id: ROBINHOOD_MAINNET_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
});

export const robinhoodTestnet = defineChain({
  id: ROBINHOOD_TESTNET_CHAIN_ID,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://explorer.testnet.chain.robinhood.com" },
  },
  testnet: true,
});

export const anvilLocal = defineChain({
  id: LOCAL_CHAIN_ID,
  name: "Anvil (local)",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});

export const TESTNET_FAUCET_URL = "https://faucet.testnet.chain.robinhood.com";

export interface ChainInfo {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  faucetUrl?: string;
}

export const CHAINS: Record<number, ChainInfo> = {
  [ROBINHOOD_MAINNET_CHAIN_ID]: {
    chainId: ROBINHOOD_MAINNET_CHAIN_ID,
    name: "Robinhood Chain",
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    explorerUrl: "https://robinhoodchain.blockscout.com",
  },
  [ROBINHOOD_TESTNET_CHAIN_ID]: {
    chainId: ROBINHOOD_TESTNET_CHAIN_ID,
    name: "Robinhood Chain Testnet",
    rpcUrl: "https://rpc.testnet.chain.robinhood.com",
    explorerUrl: "https://explorer.testnet.chain.robinhood.com",
    faucetUrl: TESTNET_FAUCET_URL,
  },
  [LOCAL_CHAIN_ID]: {
    chainId: LOCAL_CHAIN_ID,
    name: "Anvil (local)",
    rpcUrl: "http://127.0.0.1:8545",
    explorerUrl: "", // local: no explorer — UI hides links
  },
};

export function chainInfo(chainId: number): ChainInfo {
  const info = CHAINS[chainId];
  if (!info) throw new Error(`unsupported chainId ${chainId}`);
  return info;
}

export function explorerTxUrl(chainId: number, txHash: string): string | undefined {
  const base = CHAINS[chainId]?.explorerUrl;
  return base ? `${base}/tx/${txHash}` : undefined;
}

export function explorerAddressUrl(chainId: number, address: string): string | undefined {
  const base = CHAINS[chainId]?.explorerUrl;
  return base ? `${base}/address/${address}` : undefined;
}
