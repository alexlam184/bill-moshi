import { googleAuth } from "@/auth";
import type { AppSnapshot, PendingOperation } from "@/lib/domain/types";
import { GoogleApiRequestError, GoogleRootFolderConfirmationRequiredError, GoogleWorkspaceAccessError, GoogleWorkspaceAdapter } from "@/lib/integrations/google/server";
import { partitionOperationsForDeletedGroups } from "@/lib/integrations/google/workspace-routing";

export async function POST(request: Request) {
  const session = await googleAuth(request);
  if (session?.authError === "RefreshAccessTokenError") {
    return Response.json({ error: "Google authorization expired. Reconnect Google to continue syncing." }, { status: 401 });
  }
  if (!session?.accessToken) {
    return Response.json({ error: "Google Drive is not connected." }, { status: 401 });
  }
  const body = (await request.json()) as { operations?: PendingOperation[]; snapshot?: AppSnapshot; allowRootCreation?: boolean };
  if (!Array.isArray(body.operations) || body.operations.length > 100) {
    return Response.json({ error: "Invalid sync batch." }, { status: 400 });
  }
  if ((body.snapshot && !Array.isArray(body.snapshot.records)) || body.operations.some((operation) => (operation?.entityType as string) === "expense")) {
    return Response.json({ error: "This app version is no longer supported. Close all Bill Moshi tabs and reopen the rebuilt app before syncing." }, { status: 400 });
  }
  try {
    const adapter = new GoogleWorkspaceAdapter(session.accessToken, session.user?.email ?? undefined);
    const eventGroupIds = new Map(
      (body.snapshot?.events ?? []).map((event) => [event.id, event.groupId]),
    );
    const { active, discardedOperationIds } = partitionOperationsForDeletedGroups(
      body.operations,
      eventGroupIds,
    );
    const result = await adapter.applyOperations(active, body.snapshot, {
      allowRootCreation: body.allowRootCreation === true,
    });
    return Response.json({
      ...result,
      syncedOperationIds: [...discardedOperationIds, ...result.syncedOperationIds],
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error([
        "Bill Moshi Google sync failed",
        `name=${error instanceof Error ? error.name : "UnknownError"}`,
        `providerStatus=${error instanceof GoogleApiRequestError ? error.status : "unknown"}`,
        `message=${error instanceof Error ? error.message : "Google sync failed."}`,
      ].join(" | "));
    }
    if (error instanceof GoogleRootFolderConfirmationRequiredError) {
      return Response.json({ error: error.message, code: error.code }, { status: 409 });
    }
    if (error instanceof GoogleWorkspaceAccessError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof GoogleApiRequestError && error.status === 401) {
      return Response.json({ error: "Google authorization expired. Reconnect Google to continue syncing." }, { status: 401 });
    }
    if (error instanceof GoogleApiRequestError && error.status === 429) {
      return Response.json(
        {
          error: "Google Sheets is temporarily rate-limited. Your changes are safe and sync will retry automatically.",
          retryAfterSeconds: 60,
        },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }
    if (error instanceof GoogleApiRequestError && error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Google sync failed." },
      { status: 502 },
    );
  }
}
