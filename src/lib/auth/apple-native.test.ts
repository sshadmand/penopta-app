import assert from "node:assert/strict";
import test from "node:test";

import {
  MACOS_APP_BUNDLE_ID,
  appleAcceptedClientIds,
  nativeAppleSignInBody,
} from "./apple-native";

test("accepts the Services ID and the Mac bundle id", () => {
  assert.deepEqual(appleAcceptedClientIds("com.penopta.web", MACOS_APP_BUNDLE_ID), [
    "com.penopta.web",
    MACOS_APP_BUNDLE_ID,
  ]);
});

test("does not duplicate the audience when the ids match", () => {
  assert.deepEqual(appleAcceptedClientIds("com.penopta.web", "com.penopta.web"), [
    "com.penopta.web",
  ]);
});

test("native Apple sign-in sends the identity token without a browser redirect", () => {
  assert.deepEqual(
    nativeAppleSignInBody({
      identityToken: "header.payload.sig",
      nonce: "raw-nonce",
      givenName: "Ada",
      familyName: "Lovelace",
      email: "ada@example.com",
    }),
    {
      provider: "apple",
      disableRedirect: true,
      idToken: {
        token: "header.payload.sig",
        nonce: "raw-nonce",
        user: {
          email: "ada@example.com",
          name: { firstName: "Ada", lastName: "Lovelace" },
        },
      },
    },
  );
});

test("returning Apple sign-in omits name and email when Apple does not send them", () => {
  assert.deepEqual(
    nativeAppleSignInBody({
      identityToken: "header.payload.sig",
      nonce: "raw-nonce",
      givenName: "  ",
    }),
    {
      provider: "apple",
      disableRedirect: true,
      idToken: {
        token: "header.payload.sig",
        nonce: "raw-nonce",
      },
    },
  );
});
