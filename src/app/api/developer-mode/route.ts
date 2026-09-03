export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "Developer mode is unavailable in production." }, { status: 404 });
  const expected = process.env.BILL_MOSHI_DEVELOPER_PASSWORD;
  if (!expected) return Response.json({ error: "Set BILL_MOSHI_DEVELOPER_PASSWORD in .env.local to enable developer mode." }, { status: 503 });
  let body: { password?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Enter the developer password." }, { status: 400 }); }
  if (typeof body.password !== "string" || body.password !== expected) return Response.json({ error: "Incorrect developer password." }, { status: 403 });
  return Response.json({ authorized: true }, { headers: { "Cache-Control": "no-store" } });
}
