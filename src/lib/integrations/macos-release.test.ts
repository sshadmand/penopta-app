import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MACOS_SYNC_GITHUB_REPO,
  getPenoptaSyncDownloadUrl,
  macosSyncGithubAssetUrl,
  macosSyncGithubDmgUrl,
  macosSyncGithubManifestUrl,
  parsePenoptaSyncRelease,
} from "./macos-release";

const SAMPLE = {
  version: "1.20.1",
  build: 1,
  contentMd5: "abc",
  downloadUrl:
    "https://github.com/sshadmand/penopta-app/releases/download/macos-sync-1.20.1.1/Penopta-Sync.dmg",
  notes: "Fixes hourly sync.",
  publishedAt: "2026-08-30T04:18:32Z",
};

test("parsePenoptaSyncRelease accepts a published manifest", () => {
  const parsed = parsePenoptaSyncRelease(SAMPLE);
  assert.deepEqual(parsed, SAMPLE);
});

test("parsePenoptaSyncRelease rejects missing or invalid version/build", () => {
  assert.equal(parsePenoptaSyncRelease(null), null);
  assert.equal(parsePenoptaSyncRelease({ version: "", build: 1 }), null);
  assert.equal(parsePenoptaSyncRelease({ version: "1.0.0", build: 0 }), null);
  assert.equal(parsePenoptaSyncRelease({ version: "1.0.0", build: 1.5 }), null);
  assert.equal(parsePenoptaSyncRelease({ version: "1.0.0", build: "1" }), null);
});

test("macosSyncGithubAssetUrl builds the floating current-pointer URLs", () => {
  const previousManifest = process.env.PENOPTA_SYNC_MANIFEST_URL;
  const previousRepo = process.env.PENOPTA_SYNC_GITHUB_REPO;
  delete process.env.PENOPTA_SYNC_MANIFEST_URL;
  delete process.env.PENOPTA_SYNC_GITHUB_REPO;

  assert.equal(
    macosSyncGithubManifestUrl(),
    `https://github.com/${DEFAULT_MACOS_SYNC_GITHUB_REPO}/releases/download/macos-sync/Penopta-Sync.json`,
  );
  assert.equal(
    macosSyncGithubDmgUrl(),
    `https://github.com/${DEFAULT_MACOS_SYNC_GITHUB_REPO}/releases/download/macos-sync/Penopta-Sync.dmg`,
  );
  assert.equal(
    macosSyncGithubAssetUrl("macos-sync-1.20.1.1", "Penopta-Sync.dmg"),
    `https://github.com/${DEFAULT_MACOS_SYNC_GITHUB_REPO}/releases/download/macos-sync-1.20.1.1/Penopta-Sync.dmg`,
  );

  process.env.PENOPTA_SYNC_MANIFEST_URL = "https://example.com/manifest.json";
  assert.equal(
    macosSyncGithubManifestUrl(),
    "https://example.com/manifest.json",
  );

  if (previousManifest === undefined) {
    delete process.env.PENOPTA_SYNC_MANIFEST_URL;
  } else {
    process.env.PENOPTA_SYNC_MANIFEST_URL = previousManifest;
  }
  if (previousRepo === undefined) {
    delete process.env.PENOPTA_SYNC_GITHUB_REPO;
  } else {
    process.env.PENOPTA_SYNC_GITHUB_REPO = previousRepo;
  }
});

test("getPenoptaSyncDownloadUrl prefers env, then downloadUrl, then downloadPath", () => {
  const previousDownload = process.env.PENOPTA_SYNC_DOWNLOAD_URL;
  const previousApp = process.env.APP_URL;
  delete process.env.PENOPTA_SYNC_DOWNLOAD_URL;
  process.env.APP_URL = "https://app.penopta.com";

  assert.equal(
    getPenoptaSyncDownloadUrl(SAMPLE),
    SAMPLE.downloadUrl,
  );
  assert.equal(
    getPenoptaSyncDownloadUrl({
      version: "1.0.0",
      build: 1,
      downloadPath: "/downloads/Penopta-Sync.dmg",
    }),
    "https://app.penopta.com/downloads/Penopta-Sync.dmg",
  );
  assert.equal(getPenoptaSyncDownloadUrl(null), macosSyncGithubDmgUrl());

  process.env.PENOPTA_SYNC_DOWNLOAD_URL = "https://example.com/Penopta-Sync.dmg";
  assert.equal(
    getPenoptaSyncDownloadUrl(SAMPLE),
    "https://example.com/Penopta-Sync.dmg",
  );

  if (previousDownload === undefined) {
    delete process.env.PENOPTA_SYNC_DOWNLOAD_URL;
  } else {
    process.env.PENOPTA_SYNC_DOWNLOAD_URL = previousDownload;
  }
  if (previousApp === undefined) {
    delete process.env.APP_URL;
  } else {
    process.env.APP_URL = previousApp;
  }
});
