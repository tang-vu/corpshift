/**
 * Cross-implementation pin: these constants are asserted byte-for-byte by
 * packages/contracts/test/DigestVector.t.sol against the LIVE Solidity
 * EIP-712 implementation. If the two ever disagree, one suite fails.
 */
import { describe, expect, it } from "vitest";
import { encodeAbiParameters, keccak256, stringToHex, type Hex } from "viem";
import { attestDigest } from "../src/eip712.js";
import { SCHEMA_V1_HASH, eventIdOf, sourceHashOf } from "../src/canonicalize.js";
import type { ActionPayload } from "../src/types.js";

const VECTOR_CONTRACT = "0xc0f5c0f5C0F5c0f5C0f5c0F5C0F5c0f5C0f5c0F5" as const;
const VECTOR_CHAIN = 46630n;

const VECTOR_PAYLOAD: ActionPayload = {
  schemaHash: SCHEMA_V1_HASH,
  sourceHash: sourceHashOf("robinhood-rhj"),
  sourceEventId: eventIdOf("fixture.crwd.forward-split.4for1.2026-07-02"),
  asset: "0xea72Ecca2d0f6bFA1394DBBCff85b52CD4233931",
  actionType: 0,
  announcedAt: 1_781_625_600n,
  effectiveAt: 1_782_999_000n,
  observedAt: 1_782_864_000n,
  paramsHash: keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
      [4n, 1n, 4_000_000_000_000_000_000n],
    ),
  ),
  evidenceHash: keccak256(stringToHex("digest-vector-evidence")),
};

describe("EIP-712 cross-implementation vectors", () => {
  it("attestDigest matches the Solidity AttestationLib digest", () => {
    const digest = attestDigest(VECTOR_PAYLOAD, {
      chainId: VECTOR_CHAIN,
      verifyingContract: VECTOR_CONTRACT,
    });
    expect(digest).toBe("0x3c797903908c70165d94936322246ba9613621e04d047ac52f240db971126aa9");
  });

  it("domain separator matches AttestationLib.domainSeparator", () => {
    // Reconstruct EIP712Domain(name="CorpShift",version="1",chainId,contract).
    const typehash = keccak256(
      stringToHex(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
      ),
    );
    const domain = keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "uint256" },
          { type: "address" },
        ],
        [
          typehash,
          keccak256(stringToHex("CorpShift")),
          keccak256(stringToHex("1")),
          VECTOR_CHAIN,
          VECTOR_CONTRACT,
        ],
      ),
    );
    expect(domain).toBe("0x38a90cad00bfcf3aae4f2ebbc89dd2ad53627caf210f201facf1c3f87f225646");
  });

  it("component hashes match the Solidity-side constants", () => {
    expect(SCHEMA_V1_HASH).toBe(
      "0x92170a39f2debe94c96a374209a78c2d3fb29c7d598473b86ee053778b00b14c" as Hex,
    );
    expect(VECTOR_PAYLOAD.sourceHash).toBe(
      "0xa3d21d6de69e634559da5d2281e62c160b5219f4ccacfa39f92383dac28ab47e" as Hex,
    );
    expect(VECTOR_PAYLOAD.sourceEventId).toBe(
      "0x4a633d896f58258054e05bbe6b677e65759825e534de0681db8ba71f70ad41ac" as Hex,
    );
    expect(VECTOR_PAYLOAD.paramsHash).toBe(
      "0xf8df2333369e732f59e6daa619dfbe973d24d854e6f5f90f9f3a6d0a878ecdcc" as Hex,
    );
  });
});
