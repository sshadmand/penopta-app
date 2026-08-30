const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

const banner = `
  ____                        _
 |  _ \\ ___ _ __   ___  _ __ | |_ __ _
 | |_) / _ \\ '_ \\ / _ \\| '_ \\| __/ _\` |
 |  __/  __/ | | | (_) | |_) | || (_| |
 |_|   \\___|_| |_|\\___/| .__/ \\__\\__,_|
                       |_|
`;

console.log(
  `%c${banner}%c  v${version}`,
  "font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: #0f172a; font-weight: 600;",
  "font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: #64748b;",
);
