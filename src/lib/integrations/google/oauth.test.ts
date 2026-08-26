import { describe, expect, it, vi } from "vitest";
import { refreshGoogleAccessToken } from "./oauth";

describe("refreshGoogleAccessToken", () => {
  it("exchanges a refresh token and calculates the new expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-19T12:00:00.000Z"));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      access_token: "new-access-token",
      expires_in: 3600,
    }), { status: 200 }));

    const result = await refreshGoogleAccessToken({
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "saved-refresh-token",
    }, fetcher);

    expect(result).toEqual({
      accessToken: "new-access-token",
      expiresAt: Date.parse("2026-08-19T13:00:00.000Z"),
      refreshToken: undefined,
    });
    const request = fetcher.mock.calls[0];
    expect(request?.[0]).toBe("https://oauth2.googleapis.com/token");
    expect(String(request?.[1]?.body)).toContain("grant_type=refresh_token");
    vi.useRealTimers();
  });

  it("does not expose Google's response body when refresh fails", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      error: "invalid_grant",
      error_description: "sensitive provider detail",
    }), { status: 400 }));

    await expect(refreshGoogleAccessToken({
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "saved-refresh-token",
    }, fetcher)).rejects.toThrow("Google token refresh failed (400).");
  });
});
