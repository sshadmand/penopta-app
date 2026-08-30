import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mt-3 text-base font-semibold text-inherit first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-3 text-[15px] font-semibold text-inherit first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-2.5 text-sm font-semibold text-inherit first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-2 text-sm font-semibold text-inherit first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="mt-2 text-sm leading-relaxed first:mt-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mt-2 list-disc space-y-1 pl-5 first:mt-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-2 list-decimal space-y-1 pl-5 first:mt-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-inherit">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium underline underline-offset-2 hover:opacity-90"
    >
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const isBlock = Boolean(className?.includes("language-"));
    if (isBlock) {
      return (
        <code className="font-mono text-[12px] leading-relaxed">{children}</code>
      );
    }
    return (
      <code className="rounded bg-foreground/5 px-1 py-0.5 font-mono text-[12px]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mt-2 overflow-x-auto rounded-lg bg-foreground/5 px-3 py-2 first:mt-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-2 border-l-2 border-border pl-3 text-muted first:mt-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,
};

/** Renders assistant chat text with lightweight markdown. */
export function ChatMarkdown({ children }: { children: string }) {
  return (
    <div className="chat-markdown min-w-0 wrap-anywhere text-sm leading-relaxed *:last:mb-0">
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  );
}
