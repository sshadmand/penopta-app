import { readFileSync } from "node:fs";

import type { NextConfig } from "next";

const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as {
  version: string;
};

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  // OAuth discovery documents live at well-known paths; map them to the API
  // routes that build them (App Router dot-directories are unreliable).
  async redirects() {
    return [
      {
        source: "/agent-work",
        destination: "/feed",
        permanent: true,
      },
      {
        source: "/stats",
        destination: "/settings/stats",
        permanent: true,
      },
      {
        source: "/integrations/:path*",
        destination: "/settings/integrations/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/.well-known/apple-app-site-association",
        destination: "/api/well-known/apple-app-site-association",
      },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/oauth/metadata/authorization-server",
      },
      {
        source: "/.well-known/oauth-authorization-server/:path*",
        destination: "/api/oauth/metadata/authorization-server",
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/oauth/metadata/protected-resource",
      },
      {
        source: "/.well-known/oauth-protected-resource/:path*",
        destination: "/api/oauth/metadata/protected-resource",
      },
      {
        source: "/install-sync.sh",
        destination: "/api/install-sync",
      },
      {
        source: "/downloads/Penopta-Sync.json",
        destination: "/api/downloads/penopta-sync",
      },
    ];
  },
};

export default nextConfig;
