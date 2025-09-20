import { describe, expect, it, beforeEach } from "vitest";
import { ClarityValue, cvToValue } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const address1 = accounts.get("wallet_1")!;
const address2 = accounts.get("wallet_2")!;
const address3 = accounts.get("wallet_3")!;

const contractName = "streamflowcontract";

describe("StreamFlow Security Tests", () => {
  beforeEach(() => {
    simnet.mineEmptyBlock(1);
  });

  describe("Basic Contract Initialization", () => {
    it("ensures simnet is well initialized", () => {
      expect(simnet.blockHeight).toBeDefined();
    });

    it("should have correct initial contract status", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-contract-status",
        [],
        address1
      );
      expect(result).toBeOk();
      
      const status = cvToValue(result.value);
      expect(status.paused).toBe(false);
      expect(status.emergency_paused).toBe(false);
      expect(status.next_stream_id).toBe(1);
      expect(status.next_nft_id).toBe(1);
      expect(status.btc_rate).toBe(50000000);
    });

    it("should have correct security status", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-security-status",
        [],
        address1
      );
      expect(result).toBeOk();
      
      const status = cvToValue(result.value);
      expect(status.contract_paused).toBe(false);
      expect(status.emergency_paused).toBe(false);
      expect(status.reentrancy_locked).toBe(false);
      expect(status.oracle_cooldown_active).toBe(false);
      expect(status.emergency_withdrawal_pending).toBe(false);
    });
  });

  describe("Stream Creation Security", () => {
    it("should create stream with valid parameters", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "create-stream",
        [
          ClarityValue.fromCV(ClarityValue.principalFromAddress(address2)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000)),
          ClarityValue.fromCV(ClarityValue.uintCV(3600)),
          ClarityValue.fromCV(ClarityValue.uintCV(1800)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000000))
        ],
        address1
      );
      expect(result).toBeOk();
      expect(result.value).toBeUint(1);
    });

    it("should reject stream creation with invalid BTC rate (too low)", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "create-stream",
        [
          ClarityValue.fromCV(ClarityValue.principalFromAddress(address2)),
          ClarityValue.fromCV(ClarityValue.uintCV(0)),
          ClarityValue.fromCV(ClarityValue.uintCV(3600)),
          ClarityValue.fromCV(ClarityValue.uintCV(1800)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000000))
        ],
        address1
      );
      expect(result).toBeErr(115);
    });

    it("should reject stream creation with invalid BTC rate (too high)", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "create-stream",
        [
          ClarityValue.fromCV(ClarityValue.principalFromAddress(address2)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000000001)),
          ClarityValue.fromCV(ClarityValue.uintCV(3600)),
          ClarityValue.fromCV(ClarityValue.uintCV(1800)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000000))
        ],
        address1
      );
      expect(result).toBeErr(115);
    });

    it("should reject stream creation with self as recipient", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "create-stream",
        [
          ClarityValue.fromCV(ClarityValue.principalFromAddress(address1)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000)),
          ClarityValue.fromCV(ClarityValue.uintCV(3600)),
          ClarityValue.fromCV(ClarityValue.uintCV(1800)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000000))
        ],
        address1
      );
      expect(result).toBeErr(108);
    });

    it("should reject stream creation with zero deposit", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "create-stream",
        [
          ClarityValue.fromCV(ClarityValue.principalFromAddress(address2)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000)),
          ClarityValue.fromCV(ClarityValue.uintCV(3600)),
          ClarityValue.fromCV(ClarityValue.uintCV(1800)),
          ClarityValue.fromCV(ClarityValue.uintCV(0))
        ],
        address1
      );
      expect(result).toBeErr(102);
    });

    it("should reject stream creation with duration exceeding maximum", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "create-stream",
        [
          ClarityValue.fromCV(ClarityValue.principalFromAddress(address2)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000)),
          ClarityValue.fromCV(ClarityValue.uintCV(31536001)),
          ClarityValue.fromCV(ClarityValue.uintCV(1800)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000000))
        ],
        address1
      );
      expect(result).toBeErr(108);
    });

    it("should reject stream creation when cliff exceeds duration", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "create-stream",
        [
          ClarityValue.fromCV(ClarityValue.principalFromAddress(address2)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000)),
          ClarityValue.fromCV(ClarityValue.uintCV(3600)),
          ClarityValue.fromCV(ClarityValue.uintCV(7200)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000000))
        ],
        address1
      );
      expect(result).toBeErr(108);
    });
  });

  describe("Rate Limiting Security", () => {
    it("should enforce rate limiting on stream creation", () => {
      simnet.callPublicFn(
        contractName,
        "create-stream",
        [
          ClarityValue.fromCV(ClarityValue.principalFromAddress(address2)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000)),
          ClarityValue.fromCV(ClarityValue.uintCV(3600)),
          ClarityValue.fromCV(ClarityValue.uintCV(1800)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000000))
        ],
        address1
      );

      const { result } = simnet.callPublicFn(
        contractName,
        "create-stream",
        [
          ClarityValue.fromCV(ClarityValue.principalFromAddress(address3)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000)),
          ClarityValue.fromCV(ClarityValue.uintCV(3600)),
          ClarityValue.fromCV(ClarityValue.uintCV(1800)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000000))
        ],
        address1
      );
      expect(result).toBeErr(112);
    });

    it("should allow stream creation after rate limit cooldown", () => {
      simnet.callPublicFn(
        contractName,
        "create-stream",
        [
          ClarityValue.fromCV(ClarityValue.principalFromAddress(address2)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000)),
          ClarityValue.fromCV(ClarityValue.uintCV(3600)),
          ClarityValue.fromCV(ClarityValue.uintCV(1800)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000000))
        ],
        address1
      );

      simnet.mineEmptyBlock(1);

      const { result } = simnet.callPublicFn(
        contractName,
        "create-stream",
        [
          ClarityValue.fromCV(ClarityValue.principalFromAddress(address3)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000)),
          ClarityValue.fromCV(ClarityValue.uintCV(3600)),
          ClarityValue.fromCV(ClarityValue.uintCV(1800)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000000))
        ],
        address1
      );
      expect(result).toBeOk();
    });
  });

  describe("Oracle Security", () => {
    it("should allow owner to update BTC rate", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "update-btc-rate",
        [ClarityValue.fromCV(ClarityValue.uintCV(60000000))],
        deployer
      );
      expect(result).toBeOk();
    });

    it("should reject unauthorized oracle updates", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "update-btc-rate",
        [ClarityValue.fromCV(ClarityValue.uintCV(60000000))],
        address1
      );
      expect(result).toBeErr(100);
    });

    it("should enforce oracle update cooldown", () => {
      simnet.callPublicFn(
        contractName,
        "update-btc-rate",
        [ClarityValue.fromCV(ClarityValue.uintCV(60000000))],
        deployer
      );

      const { result } = simnet.callPublicFn(
        contractName,
        "update-btc-rate",
        [ClarityValue.fromCV(ClarityValue.uintCV(70000000))],
        deployer
      );
      expect(result).toBeErr(112);
    });

    it("should reject rate changes exceeding maximum percentage", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "update-btc-rate",
        [ClarityValue.fromCV(ClarityValue.uintCV(100000000))],
        deployer
      );
      expect(result).toBeErr(115);
    });

    it("should allow authorized oracle to update rate", () => {
      simnet.callPublicFn(
        contractName,
        "authorize-oracle",
        [ClarityValue.fromCV(ClarityValue.principalFromAddress(address1))],
        deployer
      );

      const { result } = simnet.callPublicFn(
        contractName,
        "update-btc-rate",
        [ClarityValue.fromCV(ClarityValue.uintCV(55000000))],
        address1
      );
      expect(result).toBeOk();
    });
  });

  describe("Emergency Functions", () => {
    it("should allow owner to emergency pause", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "emergency-pause",
        [],
        deployer
      );
      expect(result).toBeOk();
    });

    it("should reject emergency pause from non-owner", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "emergency-pause",
        [],
        address1
      );
      expect(result).toBeErr(100);
    });

    it("should prevent stream creation during emergency pause", () => {
      simnet.callPublicFn(contractName, "emergency-pause", [], deployer);

      const { result } = simnet.callPublicFn(
        contractName,
        "create-stream",
        [
          ClarityValue.fromCV(ClarityValue.principalFromAddress(address2)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000)),
          ClarityValue.fromCV(ClarityValue.uintCV(3600)),
          ClarityValue.fromCV(ClarityValue.uintCV(1800)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000000))
        ],
        address1
      );
      expect(result).toBeErr(114);
    });

    it("should allow owner to resume after emergency pause", () => {
      simnet.callPublicFn(contractName, "emergency-pause", [], deployer);

      const { result } = simnet.callPublicFn(
        contractName,
        "emergency-resume",
        [],
        deployer
      );
      expect(result).toBeOk();
    });

    it("should allow emergency withdrawal request", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "request-emergency-withdrawal",
        [ClarityValue.fromCV(ClarityValue.uintCV(1000000))],
        deployer
      );
      expect(result).toBeOk();
    });

    it("should reject emergency withdrawal execution before delay", () => {
      simnet.callPublicFn(
        contractName,
        "request-emergency-withdrawal",
        [ClarityValue.fromCV(ClarityValue.uintCV(1000000))],
        deployer
      );

      const { result } = simnet.callPublicFn(
        contractName,
        "execute-emergency-withdrawal",
        [],
        deployer
      );
      expect(result).toBeErr(108);
    });
  });

  describe("Stream Operations Security", () => {
    let streamId: number;

    beforeEach(() => {
      const { result } = simnet.callPublicFn(
        contractName,
        "create-stream",
        [
          ClarityValue.fromCV(ClarityValue.principalFromAddress(address2)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000)),
          ClarityValue.fromCV(ClarityValue.uintCV(3600)),
          ClarityValue.fromCV(ClarityValue.uintCV(1800)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000000))
        ],
        address1
      );
      streamId = Number(cvToValue(result.value));
    });

    it("should allow recipient to claim after cliff period", () => {
      simnet.mineEmptyBlock(3);

      const { result } = simnet.callPublicFn(
        contractName,
        "claim-stream",
        [ClarityValue.fromCV(ClarityValue.uintCV(streamId))],
        address2
      );
      expect(result).toBeOk();
    });

    it("should reject claim before cliff period", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "claim-stream",
        [ClarityValue.fromCV(ClarityValue.uintCV(streamId))],
        address2
      );
      expect(result).toBeErr(106);
    });

    it("should reject claim from non-recipient", () => {
      simnet.mineEmptyBlock(3);

      const { result } = simnet.callPublicFn(
        contractName,
        "claim-stream",
        [ClarityValue.fromCV(ClarityValue.uintCV(streamId))],
        address3
      );
      expect(result).toBeErr(100);
    });

    it("should allow sender to pause/resume stream", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "toggle-stream-pause",
        [ClarityValue.fromCV(ClarityValue.uintCV(streamId))],
        address1
      );
      expect(result).toBeOk();
    });

    it("should reject pause from non-sender", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "toggle-stream-pause",
        [ClarityValue.fromCV(ClarityValue.uintCV(streamId))],
        address2
      );
      expect(result).toBeErr(100);
    });

    it("should allow sender to close stream", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "close-stream",
        [ClarityValue.fromCV(ClarityValue.uintCV(streamId))],
        address1
      );
      expect(result).toBeOk();
    });

    it("should reject close from non-sender", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "close-stream",
        [ClarityValue.fromCV(ClarityValue.uintCV(streamId))],
        address2
      );
      expect(result).toBeErr(100);
    });
  });

  describe("Overflow Protection", () => {
    it("should handle large numbers safely", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "create-stream",
        [
          ClarityValue.fromCV(ClarityValue.principalFromAddress(address2)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000000000)),
          ClarityValue.fromCV(ClarityValue.uintCV(31536000)),
          ClarityValue.fromCV(ClarityValue.uintCV(31536000)),
          ClarityValue.fromCV(ClarityValue.uintCV(1000000000000))
        ],
        address1
      );
      expect(result).toBeOk();
    });
  });

  describe("Access Control", () => {
    it("should allow owner to authorize oracle", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "authorize-oracle",
        [ClarityValue.fromCV(ClarityValue.principalFromAddress(address1))],
        deployer
      );
      expect(result).toBeOk();
    });

    it("should reject oracle authorization from non-owner", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "authorize-oracle",
        [ClarityValue.fromCV(ClarityValue.principalFromAddress(address1))],
        address1
      );
      expect(result).toBeErr(100);
    });

    it("should allow owner to revoke oracle", () => {
      simnet.callPublicFn(
        contractName,
        "authorize-oracle",
        [ClarityValue.fromCV(ClarityValue.principalFromAddress(address1))],
        deployer
      );

      const { result } = simnet.callPublicFn(
        contractName,
        "revoke-oracle",
        [ClarityValue.fromCV(ClarityValue.principalFromAddress(address1))],
        deployer
      );
      expect(result).toBeOk();
    });

    it("should check oracle authorization correctly", () => {
      let { result } = simnet.callReadOnlyFn(
        contractName,
        "is-oracle-authorized",
        [ClarityValue.fromCV(ClarityValue.principalFromAddress(address1))],
        address1
      );
      expect(result).toBeOk();
      expect(result.value).toBeBool(false);

      simnet.callPublicFn(
        contractName,
        "authorize-oracle",
        [ClarityValue.fromCV(ClarityValue.principalFromAddress(address1))],
        deployer
      );

      result = simnet.callReadOnlyFn(
        contractName,
        "is-oracle-authorized",
        [ClarityValue.fromCV(ClarityValue.principalFromAddress(address1))],
        address1
      );
      expect(result).toBeOk();
      expect(result.value).toBeBool(true);
    });
  });
});
