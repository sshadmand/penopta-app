/**
 * Best-effort client IP for rate limiting.
 *
 * Prefer platform headers that callers cannot spoof (`x-vercel-forwarded-for`).
 * Fall back to the last `x-forwarded-for` hop (the address the proxy added).
 */
export function clientIpFromHeaders(headers: Headers): string {
  const vercel = headers.get("x-vercel-forwarded-for")?.trim();
  if (vercel) return firstHop(vercel);

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = headers.get("x-forwarded-for")?.trim();
  if (forwarded) return lastHop(forwarded);

  return "unknown";
}

function firstHop(value: string): string {
  const hop = value.split(",")[0]?.trim();
  return hop || "unknown";
}

function lastHop(value: string): string {
  const parts = value.split(",");
  const hop = parts[parts.length - 1]?.trim();
  return hop || "unknown";
}
