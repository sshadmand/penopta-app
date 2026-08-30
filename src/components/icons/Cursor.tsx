export default function Cursor({ className }: { className?: string }) {
  return (
    // Brand glyph (white on transparent) — matches Penopta Sync menu tile.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/cursor.png"
      srcSet="/icons/cursor.png 1x, /icons/cursor@2x.png 2x"
      alt=""
      aria-hidden
      className={["size-5 object-contain", className].filter(Boolean).join(" ")}
    />
  );
}
