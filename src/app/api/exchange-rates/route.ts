import { CBSA_EXCHANGE_RATE_URL, isSupportedCurrency, quoteFromCbsaPayload } from "@/lib/domain/exchange-rates";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const from = searchParams.get("from")?.toUpperCase() ?? null;
  const to = searchParams.get("to")?.toUpperCase() ?? null;

  if (!isSupportedCurrency(from) || !isSupportedCurrency(to)) {
    return Response.json({ error: "Choose a supported from and to currency." }, { status: 400 });
  }

  try {
    const response = await fetch(CBSA_EXCHANGE_RATE_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`CBSA exchange-rate request failed (${response.status}).`);
    const quote = quoteFromCbsaPayload(await response.json(), from, to);
    return Response.json(quote, {
      headers: { "Cache-Control": "public, max-age=900, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "CBSA exchange rates are temporarily unavailable." },
      { status: 502 },
    );
  }
}
