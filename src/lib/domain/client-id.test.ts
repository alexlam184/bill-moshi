import { afterEach, describe, expect, it } from "vitest";
import { createClientId } from "./client-id";

const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");

afterEach(() => {
  if (originalCrypto) Object.defineProperty(globalThis, "crypto", originalCrypto);
  else Reflect.deleteProperty(globalThis, "crypto");
});

describe("createClientId", () => {
  it("uses randomUUID when the browser provides it", () => {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: { randomUUID: () => "test-uuid" } });
    expect(createClientId("recurring")).toBe("recurring-test-uuid");
  });

  it("creates distinct IDs when randomUUID is unavailable", () => {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
    const first = createClientId("recurring");
    const second = createClientId("recurring");
    expect(first).toMatch(/^recurring-[a-z0-9]+-[a-f0-9]{24}$/);
    expect(second).not.toBe(first);
  });
});
