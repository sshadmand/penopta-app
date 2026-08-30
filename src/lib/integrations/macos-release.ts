import { getPublicAppUrl } from "@/lib/integrations/providers";

export type PenoptaSyncRelease = {
  version: string;
  build: number;
  /** MD5 of the published .app contents; used by Mac-repo `scripts/publish.sh`. */
  contentMd5?: string;
  downloadPath?: string;
  downloadUrl?: string;
  notes?: string;
  publishedAt?: string;
};

export const MACOS_SYNC_FLOATING_TAG = "macos-sync";
export const MACOS_SYNC_JSON_ASSET = "Penopta-Sync.json";
export const MACOS_SYNC_DMG_ASSET = "Penopta-Sync.dmg";
export const DEFAULT_MACOS_SYNC_GITHUB_REPO = "sshadmand/penopta-app";

/** Public website repo that hosts macOS GitHub Releases. */
export function macosSyncGithubRepo(): string {
  return (
    process.env.PENOPTA_SYNC_GITHUB_REPO?.trim() ||
    DEFAULT_MACOS_SYNC_GITHUB_REPO
  );
}

export function macosSyncGithubAssetUrl(
  tag: string,
  asset: string,
  repo: string = macosSyncGithubRepo(),
): string {
  return `https://github.com/${repo}/releases/download/${tag}/${asset}`;
}

/** Floating current-pointer JSON. Override with `PENOPTA_SYNC_MANIFEST_URL`. */
export function macosSyncGithubManifestUrl(): string {
  const explicit = process.env.PENOPTA_SYNC_MANIFEST_URL?.trim();
  if (explicit) return explicit;
  return macosSyncGithubAssetUrl(
    MACOS_SYNC_FLOATING_TAG,
    MACOS_SYNC_JSON_ASSET,
  );
}

export function macosSyncGithubDmgUrl(): string {
  return macosSyncGithubAssetUrl(MACOS_SYNC_FLOATING_TAG, MACOS_SYNC_DMG_ASSET);
}

export function parsePenoptaSyncRelease(
  value: unknown,
): PenoptaSyncRelease | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<PenoptaSyncRelease>;
  if (
    typeof parsed.version !== "string" ||
    !parsed.version.trim() ||
    typeof parsed.build !== "number" ||
    !Number.isInteger(parsed.build) ||
    parsed.build < 1
  ) {
    return null;
  }
  const release: PenoptaSyncRelease = {
    version: parsed.version.trim(),
    build: parsed.build,
  };
  if (typeof parsed.contentMd5 === "string") {
    release.contentMd5 = parsed.contentMd5;
  }
  if (typeof parsed.downloadPath === "string") {
    release.downloadPath = parsed.downloadPath;
  }
  if (typeof parsed.downloadUrl === "string") {
    release.downloadUrl = parsed.downloadUrl;
  }
  if (typeof parsed.notes === "string") {
    release.notes = parsed.notes;
  }
  if (typeof parsed.publishedAt === "string") {
    release.publishedAt = parsed.publishedAt;
  }
  return release;
}

/**
 * Prefer `PENOPTA_SYNC_DOWNLOAD_URL`, then the manifest `downloadUrl`
 * (versioned GitHub Release asset), then `downloadPath` on this origin
 * (legacy), then the floating GitHub DMG.
 */
export function getPenoptaSyncDownloadUrl(
  release?: PenoptaSyncRelease | null,
): string {
  const explicit = process.env.PENOPTA_SYNC_DOWNLOAD_URL?.trim();
  if (explicit) return explicit;
  const absolute = release?.downloadUrl?.trim();
  if (absolute) return absolute;
  const downloadPath = release?.downloadPath?.trim();
  if (downloadPath) {
    const normalized = downloadPath.startsWith("/")
      ? downloadPath
      : `/${downloadPath}`;
    return `${getPublicAppUrl()}${normalized}`;
  }
  return macosSyncGithubDmgUrl();
}

/** Soft-update manifest URL the Mac app already hits. */
export function getPenoptaSyncManifestUrl(): string {
  return `${getPublicAppUrl()}/downloads/Penopta-Sync.json`;
}

const MANIFEST_REVALIDATE_SECONDS = 60;

/** Latest published macOS app version from the floating GitHub release JSON. */
export async function getPenoptaSyncRelease(): Promise<PenoptaSyncRelease | null> {
  try {
    const res = await fetch(macosSyncGithubManifestUrl(), {
      headers: {
        Accept: "application/json, application/octet-stream",
        "User-Agent": "penopta-app",
      },
      next: { revalidate: MANIFEST_REVALIDATE_SECONDS },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return parsePenoptaSyncRelease(await res.json());
  } catch {
    return null;
  }
}
