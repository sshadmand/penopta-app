import assert from "node:assert/strict";
import test from "node:test";

import { clientIpFromHeaders } from "./client-ip";

test("prefers the Vercel client IP header", () => {
  const headers = new Headers({
    "x-vercel-forwarded-for": "203.0.113.9",
    "x-forwarded-for": "1.1.1.1, 203.0.113.9",
  });
  assert.equal(clientIpFromHeaders(headers), "203.0.113.9");
});

test("uses x-real-ip when Vercel is absent", () => {
  const headers = new Headers({ "x-real-ip": "198.51.100.2" });
  assert.equal(clientIpFromHeaders(headers), "198.51.100.2");
});

test("takes the last x-forwarded-for hop so spoofed prefixes are ignored", () => {
  const headers = new Headers({
    "x-forwarded-for": "1.1.1.1, 198.51.100.7",
  });
  assert.equal(clientIpFromHeaders(headers), "198.51.100.7");
});

test("falls back to unknown when no IP headers are present", () => {
  assert.equal(clientIpFromHeaders(new Headers()), "unknown");
});
