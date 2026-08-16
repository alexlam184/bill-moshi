import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

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
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = typeof token.accessToken === "string" ? token.accessToken : undefined;
      return session;
    },
  },
});
