import assert from "node:assert/strict";
import test from "node:test";

import {
  isMacosAppReviewReturnTo,
  isMacosHandoffReturnTo,
  macosHandoffReturnTo,
  postSignInHref,
} from "./post-sign-in-url";

test("builds normal and App Review Mac handoff destinations", () => {
  assert.equal(macosHandoffReturnTo(), "/auth/macos-handoff?src=macos");
  assert.equal(
    macosHandoffReturnTo(true),
    "/auth/macos-handoff?src=macos&app_review=1",
  );
});

test("recognizes App Review only on the exact Mac handoff", () => {
  assert.equal(
    isMacosAppReviewReturnTo("/auth/macos-handoff?src=macos&app_review=1"),
    true,
  );
  assert.equal(
    isMacosAppReviewReturnTo("/auth/macos-handoff?src=website&app_review=1"),
    false,
  );
  assert.equal(isMacosAppReviewReturnTo("/?src=macos&app_review=1"), false);
  assert.equal(
    isMacosAppReviewReturnTo("/auth/macos-handoff?src=macos&app_review=false"),
    false,
  );
});

test("post-sign-in preserves the full handoff query", () => {
  const reviewReturnTo = macosHandoffReturnTo(true);
  assert.equal(isMacosHandoffReturnTo(reviewReturnTo), true);
  assert.equal(
    postSignInHref(reviewReturnTo),
    "/api/auth/post-sign-in?to=%2Fauth%2Fmacos-handoff%3Fsrc%3Dmacos%26app_review%3D1",
  );
});
