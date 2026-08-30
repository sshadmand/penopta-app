/** Meta prefix for cron-posted daily project summaries (`Daily summary · YYYY-MM-DD …`). */
export const DAILY_SUMMARY_META_START = "Daily summary · ";
/** Meta prefix for on-demand `/summary` posts (`last 24h · …`). */
export const MANUAL_SUMMARY_META_START = "last ";

/** True for daily cron summaries and on-demand `/summary` replies. */
export function isSummaryChatMeta(meta: string | null | undefined): boolean {
  if (!meta) return false;
  return (
    meta.startsWith(DAILY_SUMMARY_META_START) ||
    meta.startsWith(MANUAL_SUMMARY_META_START)
  );
}
