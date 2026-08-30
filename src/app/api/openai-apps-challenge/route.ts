/**
 * OpenAI plugin domain-verification challenge.
 * Served at `/.well-known/openai-apps-challenge` via next.config rewrite
 * (same pattern as OAuth well-known — App Router dot-directories are flaky).
 *
 * Response must be exact plain text: `Content-Type: text/plain` (no charset).
 */
const CHALLENGE_TOKEN =
  process.env.OPENAI_APPS_CHALLENGE?.trim() ||
  "pd0ITskYxBkeMw1SqnE6kGjTyvrD1D_KuIVX173zAnY";

export function GET() {
  return new Response(CHALLENGE_TOKEN, {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export function HEAD() {
  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Content-Length": String(CHALLENGE_TOKEN.length),
    },
  });
}
