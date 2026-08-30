/** Escape text for embedding in HTML email. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(escaped: string): string {
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

/**
 * Lightweight markdown → HTML for weekly digest emails.
 * Handles headings, bullets, paragraphs, bold, and inline code.
 */
export function summaryMarkdownToEmailHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const tag =
        heading[1]!.length === 1 ? "h2" : heading[1]!.length === 2 ? "h3" : "h4";
      out.push(
        `<${tag} style="margin:1.1em 0 0.4em;font-size:${
          tag === "h2" ? "16px" : "14px"
        };">${inlineMarkdown(escapeHtml(heading[2]!.trim()))}</${tag}>`,
      );
      i += 1;
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i] ?? "")) {
        const item = (lines[i] ?? "").replace(/^\s*[-*+]\s+/, "");
        items.push(
          `<li style="margin:0.25em 0;">${inlineMarkdown(escapeHtml(item))}</li>`,
        );
        i += 1;
      }
      out.push(
        `<ul style="margin:0.4em 0 0.8em;padding-left:1.2em;">${items.join("")}</ul>`,
      );
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() &&
      !/^(#{1,3})\s+/.test(lines[i] ?? "") &&
      !/^\s*[-*+]\s+/.test(lines[i] ?? "")
    ) {
      para.push(lines[i] ?? "");
      i += 1;
    }
    out.push(
      `<p style="margin:0.5em 0;">${inlineMarkdown(escapeHtml(para.join(" ")))}</p>`,
    );
  }

  return out.join("\n");
}
