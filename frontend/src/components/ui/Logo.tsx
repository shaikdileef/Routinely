interface LogoMarkProps {
  size?: number;
}

/**
 * The Routinely mark: a loop that comes back around (a routine, every day) closing on a
 * check (done). Drawn in currentColor so it sits on the themed tile in any palette.
 * public/favicon.svg uses the same paths.
 */
export function LogoMark({ size = 20 }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19.52 14.74A8 8 0 1 1 18.13 6.86" strokeWidth="2.2" />
      <path d="M14.4 6.3 18.13 6.86 18.3 3.1" strokeWidth="2.2" />
      <path d="M8.6 12.3 11.1 14.7 15.6 9.7" strokeWidth="2.5" />
    </svg>
  );
}
