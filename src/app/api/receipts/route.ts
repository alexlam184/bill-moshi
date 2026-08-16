import { auth } from "@/auth";
import { GoogleWorkspaceAdapter } from "@/lib/integrations/google/server";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.accessToken) return Response.json({ error: "Google Drive is not connected." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const scope = form.get("scope") === "group" ? "group" : "personal";
  const groupId = String(form.get("groupId") ?? "") || undefined;
  const groupName = String(form.get("groupName") ?? "") || undefined;
  const canCreateGroupWorkspace = form.get("canCreateGroupWorkspace") === "true";
  const recordId = String(form.get("recordId") ?? form.get("expenseId") ?? "");
  const recordType = form.get("recordType") === "debt_record" ? "debt_record" : "expense";
  const eventName = String(form.get("eventName") ?? "Receipts");
  if (!recordId || (scope === "group" && !groupId) || !(file instanceof File) || !allowedTypes.has(file.type) || file.size > 15 * 1024 * 1024) {
    return Response.json({ error: "Receipt must be a JPEG, PNG, WebP, or PDF under 15 MB." }, { status: 400 });
  }
  try {
    const adapter = new GoogleWorkspaceAdapter(session.accessToken, session.user?.email ?? undefined);
    const fileId = await adapter.uploadReceipt({ scope, groupId, groupName, canCreateGroupWorkspace, recordId, recordType, eventName, fileName: file.name, bytes: await file.arrayBuffer(), mimeType: file.type });
    return Response.json({ fileId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Receipt upload failed." }, { status: 502 });
  }
}
