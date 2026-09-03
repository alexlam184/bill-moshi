import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getToken, type JWT } from "next-auth/jwt";
import { refreshGoogleAccessToken } from "@/lib/integrations/google/oauth";

const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
const authSecret = process.env.AUTH_SECRET ?? (!googleConfigured ? "bill-moshi-local-demo-only" : undefined);

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
  secret: authSecret,
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
      session.googleConnected = typeof token.accessToken === "string";
      session.authError = token.authError === "RefreshAccessTokenError" ? token.authError : undefined;
      return session;
    },
  },
});

/**
 * Reads the encrypted Auth.js JWT only on the server. Google bearer tokens are
 * deliberately never copied into the browser-visible session response.
 */
export async function googleAuth(request: Request) {
  if (!authSecret) return { accessToken: undefined, authError: "RefreshAccessTokenError" as const, user: undefined };
  const token = await getToken({
    req: request,
    secret: authSecret,
    secureCookie: new URL(request.url).protocol === "https:",
  });
  if (!token) return { accessToken: undefined, authError: undefined, user: undefined };
  const refreshed = typeof token.accessToken === "string"
    && (typeof token.accessTokenExpires !== "number" || Date.now() < token.accessTokenExpires - 60_000)
    ? token
    : await refreshAccessToken(token);
  return {
    accessToken: typeof refreshed.accessToken === "string" ? refreshed.accessToken : undefined,
    authError: refreshed.authError === "RefreshAccessTokenError" ? refreshed.authError : undefined,
    user: typeof refreshed.email === "string" ? {
      email: refreshed.email,
      name: typeof refreshed.name === "string" ? refreshed.name : refreshed.email,
      image: typeof refreshed.picture === "string" ? refreshed.picture : undefined,
    } : undefined,
  };
}
