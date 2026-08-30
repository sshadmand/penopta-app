export default function Gemini({ className }: { className?: string }) {
  return (
    <svg
      className={["size-5 fill-white", className].filter(Boolean).join(" ")}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Gemini</title>
      <path d="M12 0C12 6.627 17.373 12 24 12C17.373 12 12 17.373 12 24C12 17.373 6.627 12 0 12C6.627 12 12 6.627 12 0Z" />
    </svg>
  );
}
