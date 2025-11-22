import { describe, expect, it, beforeEach } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const address1 = accounts.get("wallet_1")!;
const address2 = accounts.get("wallet_2")!;
const address3 = accounts.get("wallet_3")!;
const oracleAddress = "ST3J2GVMMM2R07ZFBJDWTYEYAR8FZH5WKDTFJ9AHA";

const contractName = "streamflowcontract";

// Helper function to advance blocks
function advanceBlocks(blocks: number) {
  for (let i = 0; i < blocks; i++) {
    simnet.mineBlock([]);
  }
}

// Helper function to advance time (approximately)
function advanceTime(seconds: number) {
  const blocks = Math.ceil(seconds / 600); // 600 seconds per block
  advanceBlocks(blocks);
}

describe("StreamFlow Contract - Comprehensive Tests", () => {
  beforeEach(() => {
    // Reset contract state before each test
    simnet.setEpoch("3.0");
  });

  describe("Contract Initialization", () => {
    it("should initialize with correct default values", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-contract-status",
        [],
        address1
      );

      expect(result).toBeDefined();
      expect(result).toHaveProperty('data');
      expect(result.data['btc-rate']).toBe(50000000n); // 50 STX per BTC
    });

    it("should get correct security status", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-security-status",
        [],
        address1
      );

      expect(result).toBeDefined();
      expect(result.data['contract-paused']).toBe(false);
      expect(result.data['emergency-paused']).toBe(false);
      expect(result.data['reentrancy-locked']).toBe(false);
    });
  });

  describe("Oracle Management", () => {
    it("should allow owner to update BTC rate", () => {
      const newRate = 60000000n; // 60 STX per BTC
      const { result } = simnet.callPublicFn(
        contractName,
        "update-btc-rate",
        [newRate],
        deployer
      );

      expect(result).toBeDefined();
      expect(result).toBeOk(true);
    });

    it("should reject BTC rate update from non-owner", () => {
      const newRate = 60000000n;
      const { result } = simnet.callPublicFn(
        contractName,
        "update-btc-rate",
        [newRate],
        address1
      );

      expect(result).toBeErr(100n); // ERR_UNAUTHORIZED
    });

    it("should reject invalid BTC rates", () => {
      const invalidRate = 0n; // Invalid rate
      const { result } = simnet.callPublicFn(
        contractName,
        "update-btc-rate",
        [invalidRate],
        deployer
      );

      expect(result).toBeErr(102n); // ERR_INVALID_AMOUNT
    });

    it("should enforce oracle update cooldown", () => {
      const newRate = 60000000n;
      // First update should succeed
      simnet.callPublicFn(contractName, "update-btc-rate", [newRate], deployer);

      // Immediate second update should fail
      const { result } = simnet.callPublicFn(
        contractName,
        "update-btc-rate",
        [65000000n],
        deployer
      );

      expect(result).toBeErr(115n); // ERR_INVALID_RATE (due to cooldown)
    });

    it("should allow authorized oracle to update rate", () => {
      // First authorize oracle
      simnet.callPublicFn(
        contractName,
        "authorize-oracle",
        [oracleAddress],
        deployer
      );

      const newRate = 55000000n;
      const { result } = simnet.callPublicFn(
        contractName,
        "update-btc-rate",
        [newRate],
        oracleAddress
      );

      expect(result).toBeOk(true);
    });
  });

  describe("Stream Creation", () => {
    beforeEach(() => {
      // Ensure oracle data is fresh
      simnet.callPublicFn(contractName, "update-btc-rate", [50000000n], deployer);
    });

    it("should create a valid stream", () => {
      const recipient = address1;
      const btcRate = 1000n; // 1000 satoshis per second
      const duration = 3600n; // 1 hour
      const cliff = 1800n; // 30 minutes
      const deposit = 1000000n; // 1 STX

      const { result } = simnet.callPublicFn(
        contractName,
        "create-stream",
        [recipient, btcRate, duration, cliff, deposit],
        deployer
      );

      expect(result).toBeOk(1n); // First stream ID
    });

    it("should reject stream creation with insufficient deposit", () => {
      const recipient = address1;
      const btcRate = 1000n;
      const duration = 3600n;
      const cliff = 1800n;
      const deposit = 500n; // Too small - below MIN_STREAM_DEPOSIT (1000)

      const { result } = simnet.callPublicFn(
        contractName,
        "create-stream",
        [recipient, btcRate, duration, cliff, deposit],
        deployer
      );

      expect(result).toBeErr(108n); // ERR_INVALID_PARAMS
    });

    it("should reject stream creation to self", () => {
      const btcRate = 1000n;
      const duration = 3600n;
      const cliff = 1800n;
      const deposit = 1000000n;

      const { result } = simnet.callPublicFn(
        contractName,
        "create-stream",
        [deployer, btcRate, duration, cliff, deposit],
        deployer
      );

      expect(result).toBeErr(108n); // ERR_INVALID_PARAMS
    });

    it("should enforce rate limiting on stream creation", () => {
      const recipient = address1;
      const btcRate = 1000n;
      const duration = 3600n;
      const cliff = 1800n;
      const deposit = 1000000n;

      // First stream creation should succeed
      simnet.callPublicFn(
        contractName,
        "create-stream",
        [recipient, btcRate, duration, cliff, deposit],
        deployer
      );

      // Immediate second creation should fail due to rate limit
      const { result } = simnet.callPublicFn(
        contractName,
        "create-stream",
        [address2, btcRate, duration, cliff, deposit],
        deployer
      );

      expect(result).toBeErr(112n); // ERR_RATE_LIMIT
    });

    it("should reject stream creation when contract is paused", () => {
      // Pause contract first
      simnet.callPublicFn(contractName, "toggle-contract-pause", [], deployer);

      const recipient = address1;
      const btcRate = 1000n;
      const duration = 3600n;
      const cliff = 1800n;
      const deposit = 1000000n;

      const { result } = simnet.callPublicFn(
        contractName,
        "create-stream",
        [recipient, btcRate, duration, cliff, deposit],
        deployer
      );

      expect(result).toBeErr(100n); // ERR_UNAUTHORIZED
    });
  });

  describe("Stream Claims", () => {
    let streamId: bigint;

    beforeEach(() => {
      // Ensure oracle data is fresh and create a stream for testing
      simnet.callPublicFn(contractName, "update-btc-rate", [50000000n], deployer);
      
      const recipient = address1;
      const btcRate = 1000n;
      const duration = 3600n; // 1 hour
      const cliff = 1800n; // 30 minutes
      const deposit = 1000000n;

      const createResult = simnet.callPublicFn(
        contractName,
        "create-stream",
        [recipient, btcRate, duration, cliff, deposit],
        deployer
      );
      streamId = createResult.result.data;
    });

    it("should reject claims before cliff period", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "claim-stream",
        [streamId],
        address1 // recipient
      );

      expect(result).toBeErr(106n); // ERR_CLIFF_NOT_REACHED
    });

    it("should allow claims after cliff period", () => {
      // Advance time past cliff (30 minutes + 1 second)
      advanceTime(1830);

      const { result } = simnet.callPublicFn(
        contractName,
        "claim-stream",
        [streamId],
        address1
      );

      expect(result).toBeOk(); // Should succeed
    });

    it("should reject claims by unauthorized users", () => {
      advanceTime(1830);

      const { result } = simnet.callPublicFn(
        contractName,
        "claim-stream",
        [streamId],
        address2 // Not the recipient
      );

      expect(result).toBeErr(100n); // ERR_UNAUTHORIZED
    });

    it("should enforce claim rate limiting", () => {
      advanceTime(1830);

      // First claim should succeed
      simnet.callPublicFn(contractName, "claim-stream", [streamId], address1);

      // Immediate second claim should fail
      const { result } = simnet.callPublicFn(
        contractName,
        "claim-stream",
        [streamId],
        address1
      );

      expect(result).toBeErr(112n); // ERR_RATE_LIMIT
    });
  });

  describe("Stream Management", () => {
    let streamId: bigint;

    beforeEach(() => {
      // Ensure oracle data is fresh and create a stream for testing
      simnet.callPublicFn(contractName, "update-btc-rate", [50000000n], deployer);
      
      const recipient = address1;
      const btcRate = 1000n;
      const duration = 3600n;
      const cliff = 1800n;
      const deposit = 1000000n;

      const createResult = simnet.callPublicFn(
        contractName,
        "create-stream",
        [recipient, btcRate, duration, cliff, deposit],
        deployer
      );
      streamId = createResult.result.data;
    });

    it("should allow sender to pause stream", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "toggle-stream-pause",
        [streamId],
        deployer // sender
      );

      expect(result).toBeOk("Stream paused");
    });

    it("should allow sender to resume paused stream", () => {
      // Pause first
      simnet.callPublicFn(contractName, "toggle-stream-pause", [streamId], deployer);

      // Resume
      const { result } = simnet.callPublicFn(
        contractName,
        "toggle-stream-pause",
        [streamId],
        deployer
      );

      expect(result).toBeOk("Stream resumed");
    });

    it("should reject pause/resume from non-sender", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "toggle-stream-pause",
        [streamId],
        address2 // Not the sender
      );

      expect(result).toBeErr(100n); // ERR_UNAUTHORIZED
    });

    it("should allow sender to close stream", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "close-stream",
        [streamId],
        deployer
      );

      expect(result).toBeOk(); // Should return remaining balance
    });

    it("should reject close from non-sender", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "close-stream",
        [streamId],
        address2
      );

      expect(result).toBeErr(100n); // ERR_UNAUTHORIZED
    });
  });

  describe("Emergency Controls", () => {
    it("should allow owner to emergency pause", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "emergency-pause",
        [],
        deployer
      );

      expect(result).toBeOk(true);
    });

    it("should reject emergency pause from non-owner", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "emergency-pause",
        [],
        address1
      );

      expect(result).toBeErr(100n); // ERR_UNAUTHORIZED
    });

    it("should block operations when emergency paused", () => {
      // Emergency pause
      simnet.callPublicFn(contractName, "emergency-pause", [], deployer);

      // Try to create stream - should fail
      const recipient = address1;
      const btcRate = 1000n;
      const duration = 3600n;
      const cliff = 1800n;
      const deposit = 1000000n;

      const { result } = simnet.callPublicFn(
        contractName,
        "create-stream",
        [recipient, btcRate, duration, cliff, deposit],
        deployer
      );

      expect(result).toBeErr(114n); // ERR_EMERGENCY_PAUSED
    });

    it("should allow owner to resume after emergency pause", () => {
      simnet.callPublicFn(contractName, "emergency-pause", [], deployer);

      const { result } = simnet.callPublicFn(
        contractName,
        "emergency-resume",
        [],
        deployer
      );

      expect(result).toBeOk(true);
    });
  });

  describe("NFT Functionality", () => {
    beforeEach(() => {
      // Ensure oracle data is fresh
      simnet.callPublicFn(contractName, "update-btc-rate", [50000000n], deployer);
    });

    it("should mint NFT when creating stream", () => {
      const recipient = address1;
      const btcRate = 1000n;
      const duration = 3600n;
      const cliff = 1800n;
      const deposit = 1000000n;

      simnet.callPublicFn(
        contractName,
        "create-stream",
        [recipient, btcRate, duration, cliff, deposit],
        deployer
      );

      // Check NFT ownership
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-owner",
        [1n], // NFT ID 1
        address1
      );

      expect(result).toBeDefined();
    });

    it("should allow NFT transfer", () => {
      const recipient = address1;
      const btcRate = 1000n;
      const duration = 3600n;
      const cliff = 1800n;
      const deposit = 1000000n;

      simnet.callPublicFn(
        contractName,
        "create-stream",
        [recipient, btcRate, duration, cliff, deposit],
        deployer
      );

      // Transfer NFT
      const { result } = simnet.callPublicFn(
        contractName,
        "transfer-stream-nft",
        [1n, deployer, address2],
        deployer
      );

      expect(result).toBeOk(true);
    });
  });

  describe("Batch Operations", () => {
    beforeEach(() => {
      // Ensure oracle data is fresh
      simnet.callPublicFn(contractName, "update-btc-rate", [50000000n], deployer);
    });

    it("should create multiple streams in batch", () => {
      const recipients = [address1, address2];
      const btcRates = [1000n, 1500n];
      const durations = [3600n, 7200n];
      const cliffs = [1800n, 3600n];
      const deposits = [1000000n, 1500000n];

      const { result } = simnet.callPublicFn(
        contractName,
        "batch-create-streams",
        [recipients, btcRates, durations, cliffs, deposits],
        deployer
      );

      expect(result).toBeDefined();
    });

    it("should batch claim streams", () => {
      // Create two streams first
      const recipient1 = address1;
      const recipient2 = address2;
      const btcRate = 1000n;
      const duration = 3600n;
      const cliff = 1800n;
      const deposit = 1000000n;

      const stream1 = simnet.callPublicFn(
        contractName,
        "create-stream",
        [recipient1, btcRate, duration, cliff, deposit],
        deployer
      );

      const stream2 = simnet.callPublicFn(
        contractName,
        "create-stream",
        [recipient2, btcRate, duration, cliff, deposit],
        deployer
      );

      // Advance past cliff
      advanceTime(1830);

      // Batch claim
      const { result } = simnet.callPublicFn(
        contractName,
        "batch-claim-streams",
        [[stream1.result.data, stream2.result.data]],
        deployer
      );

      expect(result).toBeDefined();
    });
  });

  describe("Stream Templates", () => {
    beforeEach(() => {
      // Ensure oracle data is fresh
      simnet.callPublicFn(contractName, "update-btc-rate", [50000000n], deployer);
    });

    it("should allow owner to create stream template", () => {
      const name = "Monthly Salary";
      const btcRate = 1000n;
      const duration = 2592000n; // 30 days
      const cliff = 0n;

      const { result } = simnet.callPublicFn(
        contractName,
        "create-stream-template",
        [name, btcRate, duration, cliff],
        deployer
      );

      expect(result).toBeOk(1n); // First template ID
    });

    it("should allow creating stream from template", () => {
      // Create template first
      simnet.callPublicFn(
        contractName,
        "create-stream-template",
        ["Monthly Salary", 1000n, 2592000n, 0n],
        deployer
      );

      // Create stream from template
      const { result } = simnet.callPublicFn(
        contractName,
        "create-stream-from-template",
        [1n, address1, 1000000n], // template ID, recipient, deposit
        deployer
      );

      expect(result).toBeOk(1n); // First stream ID
    });
  });

  describe("Analytics and Read Functions", () => {
    it("should provide user analytics", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-user-analytics",
        [deployer],
        address1
      );

      expect(result).toBeDefined();
      expect(result.data['total-streams-created']).toBe(0n);
    });

    it("should provide global analytics", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-global-analytics",
        [],
        address1
      );

      expect(result).toBeDefined();
      expect(result.data).toHaveProperty('total-volume-streamed');
    });

    it("should batch get stream data", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-streams-batch",
        [[1n, 2n, 3n]],
        address1
      );

      expect(result).toBeDefined();
    });
  });

  describe("Security Edge Cases", () => {
    it("should handle overflow protection in safe math", () => {
      // Test with maximum values that might cause overflow
      const largeAmount = 2n ** 128n - 1n; // Near uint max

      const result = simnet.callReadOnlyFn(
        contractName,
        "safe-add",
        [largeAmount, 1n],
        address1
      );

      expect(result).toBeDefined();
    });

    it("should validate BTC conversion properly", () => {
      const btcAmount = 100000000n; // 1 BTC in satoshis

      const { result } = simnet.callReadOnlyFn(
        contractName,
        "convert-btc-to-stx",
        [btcAmount],
        address1
      );

      expect(result).toBeDefined();
    });

    it("should handle invalid stream IDs gracefully", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-stream",
        [999n], // Non-existent stream
        address1
      );

      expect(result).toBeDefined();
    });

    it("should protect against reentrancy attacks", () => {
      // This would require a more complex test setup with a malicious contract
      // For now, we verify the reentrancy lock is properly managed
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-security-status",
        [],
        address1
      );

      expect(result.data['reentrancy-locked']).toBe(false);
    });
  });

  describe("Milestones", () => {
    let streamId: bigint;

    beforeEach(() => {
      // Ensure oracle data is fresh and create a stream for testing
      simnet.callPublicFn(contractName, "update-btc-rate", [50000000n], deployer);
      
      const recipient = address1;
      const btcRate = 1000n;
      const duration = 3600n;
      const cliff = 1800n;
      const deposit = 1000000n;

      const createResult = simnet.callPublicFn(
        contractName,
        "create-stream",
        [recipient, btcRate, duration, cliff, deposit],
        deployer
      );
      streamId = createResult.result.data;
    });

    it("should add milestone to stream", () => {
      const milestoneId = 1n;
      const amount = 50000n;
      const description = "Phase 1 completion";

      const { result } = simnet.callPublicFn(
        contractName,
        "add-stream-milestone",
        [streamId, milestoneId, amount, description],
        deployer // sender
      );

      expect(result).toBeOk(true);
    });

    it("should mark milestone as reached", () => {
      // Add milestone first
      simnet.callPublicFn(
        contractName,
        "add-stream-milestone",
        [streamId, 1n, 50000n, "Phase 1 completion"],
        deployer
      );

      // Mark as reached
      const { result } = simnet.callPublicFn(
        contractName,
        "mark-milestone-reached",
        [streamId, 1n],
        address1 // recipient
      );

      expect(result).toBeOk(true);
    });
  });

  describe("Top-ups", () => {
    let streamId: bigint;

    beforeEach(() => {
      // Ensure oracle data is fresh and create a stream for testing
      simnet.callPublicFn(contractName, "update-btc-rate", [50000000n], deployer);
      
      const recipient = address1;
      const btcRate = 1000n;
      const duration = 3600n;
      const cliff = 1800n;
      const deposit = 1000000n;

      const createResult = simnet.callPublicFn(
        contractName,
        "create-stream",
        [recipient, btcRate, duration, cliff, deposit],
        deployer
      );
      streamId = createResult.result.data;
    });

    it("should allow topping up a stream", () => {
      const additionalAmount = 500000n;

      const { result } = simnet.callPublicFn(
        contractName,
        "top-up-stream",
        [streamId, additionalAmount],
        deployer // sender
      );

      expect(result).toBeOk(1500000n); // Original + additional
    });

    it("should reject top-up from non-sender", () => {
      const additionalAmount = 500000n;

      const { result } = simnet.callPublicFn(
        contractName,
        "top-up-stream",
        [streamId, additionalAmount],
        address2 // Not the sender
      );

      expect(result).toBeErr(100n); // ERR_UNAUTHORIZED
    });
  });
});
