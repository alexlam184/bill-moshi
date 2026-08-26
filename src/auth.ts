import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import type { JWT } from "next-auth/jwt";
import { refreshGoogleAccessToken } from "@/lib/integrations/google/oauth";

const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

async function refreshAccessToken(token: JWT): Promise<JWT> {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret || typeof token.refreshToken !== "string") {
    return { ...token, accessToken: undefined, authError: "RefreshAccessTokenError" };
  }
  try {
    const refreshed = await refreshGoogleAccessToken({
      clientId,
      clientSecret,
      refreshToken: token.refreshToken,
    });
    return {
      ...token,
      accessToken: refreshed.accessToken,
      accessTokenExpires: refreshed.expiresAt,
      refreshToken: refreshed.refreshToken ?? token.refreshToken,
      authError: undefined,
    };
  } catch {
    return { ...token, accessToken: undefined, authError: "RefreshAccessTokenError" };
  }
}

export const { handlers, auth } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? (!googleConfigured ? "bill-moshi-local-demo-only" : undefined),
  providers: googleConfigured
    ? [
        Google({
          authorization: {
            params: {
              scope: [
                "openid",
                "email",
                "profile",
                "https://www.googleapis.com/auth/drive.file",
                "https://www.googleapis.com/auth/spreadsheets",
              ].join(" "),
              access_type: "offline",
              prompt: "consent",
            },
          },
        }),
      ]
    : [],
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : undefined;
        token.authError = undefined;
        return token;
      }
      if (
        typeof token.accessToken === "string"
        && (typeof token.accessTokenExpires !== "number" || Date.now() < token.accessTokenExpires - 60_000)
      ) return token;
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = typeof token.accessToken === "string" ? token.accessToken : undefined;
      session.authError = token.authError === "RefreshAccessTokenError" ? token.authError : undefined;
      return session;
    },
  },
});
