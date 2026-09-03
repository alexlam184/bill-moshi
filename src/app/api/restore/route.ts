import { googleAuth } from "@/auth";
import { GoogleApiRequestError } from "@/lib/integrations/google/server";
import { GoogleRestoreReader } from "@/lib/integrations/google/restore-reader";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const session = await googleAuth(request);
  if (!session?.accessToken || !session.user?.email || session.authError === "RefreshAccessTokenError") return Response.json({ error: "Connect Google again to restore your backup." }, { status: 401, headers });
  let body: { action?: unknown; workspaceIds?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid restore request." }, { status: 400, headers }); }
  if (!body || !["list", "preview"].includes(String(body.action)) || (body.action === "preview" && (!Array.isArray(body.workspaceIds) || !body.workspaceIds.length || body.workspaceIds.length > 10 || !body.workspaceIds.every((id) => typeof id === "string" && /^[\w-]+$/.test(id))))) return Response.json({ error: "Choose up to 10 backup sheets." }, { status: 400, headers });
  try {
    const email = session.user.email;
    const reader = new GoogleRestoreReader(session.accessToken, { id: `google:${email.toLowerCase()}`, email, name: session.user.name ?? email, defaultCurrency: "CAD" });
    if (body.action === "list") return Response.json({ accountEmail: email, workspaces: await reader.list() }, { headers });
    return Response.json(await reader.preview(body.workspaceIds as string[]), { headers });
  } catch (error) {
    const status = error instanceof GoogleApiRequestError && [401, 403, 429].includes(error.status) ? error.status : 502;
    const message = status === 429 ? "Google Sheets is temporarily rate-limited. Wait a minute before trying again; no phone data was changed." : status === 401 ? "Google authorization expired. Reconnect Google to restore." : error instanceof Error ? error.message : "Could not load your Google backup.";
    return Response.json({ error: message }, { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "60" } : {}) } });
  }
}
