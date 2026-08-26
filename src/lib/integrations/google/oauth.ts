export interface GoogleRefreshResult {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
}

export async function refreshGoogleAccessToken(
  input: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  },
  fetcher: typeof fetch = fetch,
): Promise<GoogleRefreshResult> {
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
    }),
  });
  if (!response.ok) {
    throw new Error(`Google token refresh failed (${response.status}).`);
  }

  const tokens = (await response.json()) as GoogleTokenResponse;
  if (!tokens.access_token || !tokens.expires_in) {
    throw new Error("Google token refresh returned an incomplete response.");
  }
  return {
    accessToken: tokens.access_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    refreshToken: tokens.refresh_token,
  };
}
