import { describe, expect, test } from "bun:test";
import { humanizeWalletError, isValidAddress } from "../src/lib/wallet";

describe("wallet error handling", () => {
  test("names a rejected signature without treating it as success", () => {
    expect(humanizeWalletError(new Error("User rejected the request"))).toBe(
      "The wallet request was rejected.",
    );
    expect(humanizeWalletError({ code: 4001, message: "denied" })).toBe(
      "The wallet request was rejected.",
    );
  });

  test("names a missing wallet", () => {
    expect(humanizeWalletError(new Error("No ethereum provider found"))).toBe(
      "No browser wallet was found.",
    );
  });

  test("names a wrong-chain failure", () => {
    expect(humanizeWalletError(new Error("Wrong chain: expected 84532"))).toBe(
      "Switch your wallet to Base Sepolia and try again.",
    );
  });

  test("preserves an otherwise actionable wallet error", () => {
    expect(humanizeWalletError(new Error("Insufficient funds for gas"))).toBe(
      "Insufficient funds for gas",
    );
  });
});

describe("address validation", () => {
  test("accepts a normal 20-byte EVM address", () => {
    expect(isValidAddress("0x1111111111111111111111111111111111111111")).toBe(true);
  });

  test("rejects the zero address, short values, and non-hex input", () => {
    expect(isValidAddress("0x0000000000000000000000000000000000000000")).toBe(false);
    expect(isValidAddress("0x1234")).toBe(false);
    expect(isValidAddress("not-an-address")).toBe(false);
  });
});
