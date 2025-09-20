import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const address1 = accounts.get("wallet_1")!;

const contractName = "streamflowcontract";

describe("Simple StreamFlow Tests", () => {
  it("ensures simnet is well initialized", () => {
    expect(simnet.blockHeight).toBeDefined();
  });

  it("should get contract status", () => {
    const { result } = simnet.callReadOnlyFn(
      contractName,
      "get-contract-status",
      [],
      address1
    );
    expect(result).toBeDefined();
  });

  it("should get security status", () => {
    const { result } = simnet.callReadOnlyFn(
      contractName,
      "get-security-status",
      [],
      address1
    );
    expect(result).toBeDefined();
  });

  it("should get BTC rate", () => {
    const { result } = simnet.callReadOnlyFn(
      contractName,
      "get-btc-rate",
      [],
      address1
    );
    expect(result).toBeDefined();
  });
});
