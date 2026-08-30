/**
 * Turn lightweight markdown into a single line of plain prose for previews.
 * Drops emphasis, headings, links, lists, and line breaks.
 */
export function stripMarkdown(markdown: string): string {
  let text = markdown.replace(/\r\n/g, "\n");

  text = text.replace(/```[\s\S]*?```/g, (block) =>
    block.replace(/^```[^\n]*\n?/, "").replace(/```$/, ""),
  );
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  text = text.replace(/^#{1,6}\s+(.+?)\s*#*\s*$/gm, (_, title: string) => {
    const heading = title.trim();
    if (!heading) return "";
    return /:$/.test(heading) ? heading : `${heading}:`;
  });
  text = text.replace(/^\s{0,3}>\s?/gm, "");
  text = text.replace(/^\s*[-*+](?:\s+)/gm, "");
  text = text.replace(/^\s*\d+\.\s+/gm, "");
  text = text.replace(/^\s*[-*_ ]{3,}\s*$/gm, "");
  text = text.replace(/(\*\*|__)([\s\S]*?)\1/g, "$2");
  text = text.replace(/\*([^*\n]+)\*/g, "$1");
  text = text.replace(/~~([\s\S]*?)~~/g, "$1");
  text = text.replace(/[*`#~]/g, "");
  return text.replace(/\s+/g, " ").trim();
}
