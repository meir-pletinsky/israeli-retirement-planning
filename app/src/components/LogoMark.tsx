import { useId } from "react";

interface LogoMarkProps {
  size?: number;
  className?: string;
}

/** App mark: a pomegranate with a golden crown on a sea-blue tile. Decorative; the app name is always shown next to it. */
export function LogoMark({ size = 32, className }: LogoMarkProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const sea = `${uid}-sea`;
  const gold = `${uid}-gold`;
  const fruit = `${uid}-fruit`;

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
      data-testid="logo-mark"
    >
      <defs>
        <linearGradient id={sea} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0ea5c9" />
          <stop offset="1" stopColor="#075985" />
        </linearGradient>
        <linearGradient id={gold} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id={fruit} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fb7185" />
          <stop offset="1" stopColor="#be123c" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${sea})`} />
      <circle cx="32" cy="38" r="18" fill={`url(#${fruit})`} />
      <path
        d="M24 26L25 13.500 30 19.500 32 11 34 19.500 39 13.500 40 26z"
        fill={`url(#${gold})`}
        stroke={`url(#${gold})`}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M20.500 38a12 12 0 0 1 6-10.500"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        opacity=".5"
      />
    </svg>
  );
}
