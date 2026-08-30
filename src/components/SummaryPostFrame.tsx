/** Card chrome for a project summary (not a chat bubble). */
export function SummaryPostFrame({
  header,
  children,
  meta,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  meta?: string | null;
}) {
  return (
    <article className="w-full overflow-hidden rounded-lg border border-border bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        {header}
      </header>
      <div className="px-3 py-2.5 text-sm leading-relaxed text-foreground">
        {children}
      </div>
      {meta ? (
        <p className="border-t border-border px-3 py-1.5 text-xs text-muted">
          {meta}
        </p>
      ) : null}
    </article>
  );
}
