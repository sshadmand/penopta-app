import Link from "next/link";

/** Full Penopta wordmark — black type in light mode, white type in dark mode. */
export function BrandLogo({ className }: { className?: string }) {
  const classes = `h-6 w-auto ${className ?? ""}`;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG wordmark; next/image adds nothing for vectors */}
      <img
        src="/brand/logo-full-black.svg"
        alt="Penopta"
        width={598}
        height={152}
        className={`${classes} dark:hidden`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG wordmark; next/image adds nothing for vectors */}
      <img
        src="/brand/logo-full.svg"
        alt=""
        aria-hidden
        width={598}
        height={152}
        className={`${classes} hidden dark:block`}
      />
    </>
  );
}

/** Standalone icon mark for interstitial / compact contexts. */
export function BrandIcon({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG mark; next/image adds nothing for vectors
    <img
      src="/brand/icon.svg"
      alt=""
      aria-hidden
      width={380}
      height={380}
      className={`h-11 w-11 ${className ?? ""}`}
    />
  );
}

/** Home link wrapping the wordmark — header branding. */
export function BrandHomeLink({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Penopta home"
      className={`inline-flex shrink-0 items-center ${className ?? ""}`}
    >
      <BrandLogo />
    </Link>
  );
}
