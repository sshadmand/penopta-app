/** Official Model Context Protocol mark (black on light wells). */
export default function Mcp({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- brand asset, sized via className
    <img
      src="/brand/mcp.png"
      alt=""
      aria-hidden
      className={["size-5 object-contain", className].filter(Boolean).join(" ")}
    />
  );
}
