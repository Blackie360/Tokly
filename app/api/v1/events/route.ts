import { after } from "next/server";
import { readBearerToken } from "@/lib/security/api-keys";
import { deliverPendingAlerts, ingestUsage } from "@/lib/usage/ingest";
import { usageBatchSchema } from "@/lib/usage/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Payload exceeds 256 KiB." }, { status: 413 });
  }

  const rawKey = readBearerToken(request);
  if (!rawKey) {
    return Response.json({ error: "A valid project Bearer key is required." }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
      return Response.json({ error: "Payload exceeds 256 KiB." }, { status: 413 });
    }
    rawBody = JSON.parse(text);
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = usageBatchSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid usage batch.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await ingestUsage(rawKey, parsed.data);
  if (result.status === "unauthorized") {
    return Response.json({ error: "Project key is invalid or revoked." }, { status: 401 });
  }
  if (result.status === "rate_limited") {
    return Response.json(
      { error: "Project ingestion rate limit exceeded." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  after(() => deliverPendingAlerts(result.organizationId));
  return Response.json(
    { accepted: result.accepted, duplicates: result.duplicates },
    { headers: { "Cache-Control": "no-store" } },
  );
}
