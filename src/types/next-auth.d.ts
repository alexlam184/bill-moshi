import "next-auth";

declare module "next-auth" {
  interface Session {
    googleConnected?: boolean;
    authError?: "RefreshAccessTokenError";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    authError?: "RefreshAccessTokenError";
  }
}
