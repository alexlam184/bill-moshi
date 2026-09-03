import { googleAuth } from "@/auth";
import {
  invitationPreview,
  pendingJoinRequests,
  registerInvitation,
  reviewStoredJoinRequest,
  revokeStoredInvitation,
  submitJoinRequest,
} from "@/lib/collaboration/store";
import type { Group, GroupInvitation, MemberRole } from "@/lib/domain/types";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const session = await googleAuth(request);
  if (!session.user?.email) return Response.json({ error: "Sign in with Google to continue." }, { status: 401, headers });
  const url = new URL(request.url);
  try {
    const token = url.searchParams.get("token");
    if (token) {
      const preview = await invitationPreview(token, session.user.email);
      return preview ? Response.json({ preview }, { headers }) : Response.json({ error: "This invitation is unavailable." }, { status: 404, headers });
    }
    const groupId = url.searchParams.get("groupId");
    if (!groupId) return Response.json({ error: "A Group or invitation is required." }, { status: 400, headers });
    return Response.json({ requests: await pendingJoinRequests(groupId, session.user.email) }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load collaboration data." }, { status: 403, headers });
  }
}

export async function POST(request: Request) {
  const session = await googleAuth(request);
  if (!session.user?.email) return Response.json({ error: "Sign in with Google to continue." }, { status: 401, headers });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "Invalid collaboration request." }, { status: 400, headers }); }
  try {
    if (body.action === "create") {
      const invitation = body.invitation as GroupInvitation | undefined;
      const group = body.group as Group | undefined;
      if (!invitation?.id || !invitation.token || !group?.id || invitation.groupId !== group.id) return Response.json({ error: "Invalid invitation." }, { status: 400, headers });
      const preview = await registerInvitation({ invitation, group, ownerEmail: session.user.email, ownerName: session.user.name ?? session.user.email });
      return Response.json({ preview }, { headers });
    }
    if (body.action === "revoke") {
      await revokeStoredInvitation(String(body.invitationId ?? ""), session.user.email);
      return Response.json({ revoked: true }, { headers });
    }
    if (body.action === "request") {
      const result = await submitJoinRequest({
        token: String(body.token ?? ""),
        requesterUserId: `google:${session.user.email.toLowerCase()}`,
        requesterName: session.user.name ?? session.user.email,
        requesterEmail: session.user.email,
      });
      return Response.json(result, { status: result.status === "invalid" ? 404 : 200, headers });
    }
    if (body.action === "review") {
      const decision = body.decision === "approved" ? "approved" : body.decision === "rejected" ? "rejected" : undefined;
      const role = body.role === "viewer" ? "viewer" : "member";
      if (!decision) return Response.json({ error: "Choose Approve or Reject." }, { status: 400, headers });
      const reviewed = await reviewStoredJoinRequest({ requestId: String(body.requestId ?? ""), ownerEmail: session.user.email, ownerUserId: `google:${session.user.email.toLowerCase()}`, decision, role: role as Exclude<MemberRole, "owner"> });
      return Response.json({ request: reviewed }, { headers });
    }
    return Response.json({ error: "Unknown collaboration action." }, { status: 400, headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Collaboration request failed." }, { status: 403, headers });
  }
}
