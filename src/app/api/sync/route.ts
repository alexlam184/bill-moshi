import { auth } from "@/auth";
import type { AppSnapshot, PendingOperation } from "@/lib/domain/types";
import { GoogleWorkspaceAdapter } from "@/lib/integrations/google/server";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.accessToken) {
    return Response.json({ error: "Google Drive is not connected." }, { status: 401 });
  }
  const body = (await request.json()) as { operations?: PendingOperation[]; snapshot?: AppSnapshot };
  if (!Array.isArray(body.operations) || body.operations.length > 100) {
    return Response.json({ error: "Invalid sync batch." }, { status: 400 });
  }
  try {
    const adapter = new GoogleWorkspaceAdapter(session.accessToken, session.user?.email ?? undefined);
    return Response.json(await adapter.applyOperations(body.operations, body.snapshot));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Google sync failed." },
      { status: 502 },
    );
  }
}
