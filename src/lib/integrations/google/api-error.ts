export function googleApiErrorMessage(status: number, body: string) {
  let detail = "Google rejected the request.";
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } };
    if (typeof parsed.error?.message === "string" && parsed.error.message.trim()) {
      detail = parsed.error.message.trim();
    }
  } catch {
    if (body.trim()) detail = body.trim().slice(0, 240);
  }
  return `Google API request failed (${status}): ${detail}`;
}
