import { describe, expect, it } from "vitest";
import { googleApiErrorMessage } from "./api-error";

describe("googleApiErrorMessage", () => {
  it("keeps the useful provider message without returning the full payload", () => {
    const message = googleApiErrorMessage(403, JSON.stringify({
      error: {
        message: "The specified parent is not a folder.",
        details: [{ noisy: "provider metadata" }],
      },
    }));

    expect(message).toBe("Google API request failed (403): The specified parent is not a folder.");
    expect(message).not.toContain("provider metadata");
  });
});
