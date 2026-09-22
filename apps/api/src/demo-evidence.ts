import { BaseError, ContractFunctionRevertedError } from "viem";

/** A transport failure is never proof that an onchain policy protected a user. */
export function expectedRevert(error: unknown, name: string): boolean {
  if (!(error instanceof BaseError)) return false;
  const revert = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
  return revert instanceof ContractFunctionRevertedError && revert.data?.errorName === name;
}

export function assertSuccessfulReceipt(receipt: {
  status: string;
  transactionHash: string;
}): void {
  if (receipt.status !== "success") {
    throw new Error(`Transaction ${receipt.transactionHash} reverted; step is not verified`);
  }
}
