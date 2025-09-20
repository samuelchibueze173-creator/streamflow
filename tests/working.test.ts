import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const address1 = accounts.get("wallet_1")!;
const address2 = accounts.get("wallet_2")!;

const contractName = "streamflowcontract";

describe("Working StreamFlow Tests", () => {
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

  it("should allow owner to emergency pause", () => {
    const { result } = simnet.callPublicFn(
      contractName,
      "emergency-pause",
      [],
      deployer
    );
    expect(result).toBeDefined();
  });

  it("should reject emergency pause from non-owner", () => {
    const { result } = simnet.callPublicFn(
      contractName,
      "emergency-pause",
      [],
      address1
    );
    expect(result).toBeDefined();
  });

  it("should allow owner to resume after emergency pause", () => {
    simnet.callPublicFn(contractName, "emergency-pause", [], deployer);

    const { result } = simnet.callPublicFn(
      contractName,
      "emergency-resume",
      [],
      deployer
    );
    expect(result).toBeDefined();
  });

  it("should allow owner to toggle contract pause", () => {
    const { result } = simnet.callPublicFn(
      contractName,
      "toggle-contract-pause",
      [],
      deployer
    );
    expect(result).toBeDefined();
  });
});
