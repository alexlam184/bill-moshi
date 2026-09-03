import { googleAuth } from "@/auth";
import { GoogleApiRequestError, GoogleWorkspaceAdapter } from "@/lib/integrations/google/server";

export async function POST(request: Request) {
  const session = await googleAuth(request);
  if (!session?.accessToken || session.authError === "RefreshAccessTokenError") return Response.json({ error: "Connect Google again before factory reset." }, { status: 401 });
  let body: { confirmation?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid factory reset request." }, { status: 400 }); }
  if (body.confirmation !== "factory reset") return Response.json({ error: 'Type "factory reset" to confirm factory reset.' }, { status: 400 });
  try {
    const result = await new GoogleWorkspaceAdapter(session.accessToken, session.user?.email ?? undefined).factoryReset();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof GoogleApiRequestError && [401, 403, 429].includes(error.status) ? error.status : 502;
    const message = status === 401 ? "Google authorization expired. Reconnect Google before factory reset." : status === 429 ? "Google Drive is temporarily rate-limited. Wait a minute; phone data has not been changed." : error instanceof Error ? error.message : "Could not reset Google Drive storage.";
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store", ...(status === 429 ? { "Retry-After": "60" } : {}) } });
  }
}
