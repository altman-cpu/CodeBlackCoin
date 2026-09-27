import React from 'react';

/**
 * Inline icon set — stroke-only, 24×24, currentColor. No icon font, no network
 * request, nothing that can be blocked or fingerprinted.
 */

export type IconName =
  | 'vault' | 'shield' | 'shield-check' | 'shield-off' | 'send' | 'receive' | 'swap' | 'sliders'
  | 'bolt' | 'key' | 'gem' | 'radar' | 'lock' | 'unlock' | 'eye' | 'eye-off' | 'copy' | 'check'
  | 'chevron-right' | 'chevron-down' | 'chevron-left' | 'search' | 'alert' | 'info' | 'x' | 'plus'
  | 'trash' | 'refresh' | 'fingerprint' | 'skull' | 'hourglass' | 'coins' | 'activity' | 'settings'
  | 'book' | 'layers' | 'terminal' | 'flame' | 'snowflake' | 'link' | 'users' | 'clock' | 'cpu'
  | 'arrow-up' | 'arrow-down' | 'arrow-right' | 'filter' | 'target' | 'spark' | 'database' | 'globe'
  | 'heart' | 'grid' | 'zap-off' | 'pause' | 'play' | 'download' | 'upload' | 'scissors' | 'moon';

const P: Record<IconName, React.ReactNode> = {
  vault: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="12" cy="12" r="4" /><path d="M12 8v1M12 15v1M8 12h1M15 12h1" /></>,
  shield: <path d="M12 3l8 3v5.5c0 4.7-3.2 7.6-8 9.5-4.8-1.9-8-4.8-8-9.5V6z" />,
  'shield-check': <><path d="M12 3l8 3v5.5c0 4.7-3.2 7.6-8 9.5-4.8-1.9-8-4.8-8-9.5V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></>,
  'shield-off': <><path d="M12 3l8 3v5.5c0 4.7-3.2 7.6-8 9.5-4.8-1.9-8-4.8-8-9.5V6z" /><path d="M4 4l16 16" /></>,
  send: <><path d="M21 3L3 10.5l7 2.5 2.5 7z" /><path d="M21 3l-8.5 18-2.5-8" /></>,
  receive: <><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M4 20h16" /></>,
  swap: <><path d="M4 8h13l-3.5-3.5" /><path d="M20 16H7l3.5 3.5" /></>,
  sliders: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  bolt: <path d="M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12z" />,
  key: <><circle cx="8" cy="14" r="4" /><path d="M11 11l8-8M17 5l2 2M14 8l2 2" /></>,
  gem: <><path d="M7 3h10l4 6-9 12L3 9z" /><path d="M3 9h18M9 3l3 18 3-18" /></>,
  radar: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 12l6-4" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /></>,
  unlock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 017.5-2" /></>,
  eye: <><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  'eye-off': <><path d="M3 3l18 18" /><path d="M10.6 5.7A9.9 9.9 0 0112 5.5c6.4 0 10 6.5 10 6.5a17 17 0 01-3.4 4.2M6.6 8.2C3.7 10 2 12 2 12s3.6 6.5 10 6.5c1.3 0 2.4-.2 3.5-.6" /><path d="M9.9 9.9a3 3 0 004.2 4.2" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 012-2h8" /></>,
  check: <path d="M20 6L9 17l-5-5" />,
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  'chevron-left': <path d="M15 6l-6 6 6 6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></>,
  alert: <><path d="M12 3l9.5 16.5H2.5z" /><path d="M12 9v5M12 17.2v.1" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.1" /></>,
  x: <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6.5 7l1 13h9l1-13" /></>,
  refresh: <><path d="M20 11a8 8 0 10-1.6 5.6" /><path d="M20 5v6h-6" /></>,
  fingerprint: (
    <>
      <path d="M12 4a8 8 0 00-8 8" /><path d="M12 8a4 4 0 00-4 4v4" />
      <path d="M12 12v8" /><path d="M16 12a4 4 0 00-2-3.5" /><path d="M18 12a6 6 0 00-3-5.2" />
      <path d="M20 12a8 8 0 00-4-6.9" />
    </>
  ),
  skull: (
    <>
      <path d="M12 3a7 7 0 017 7v3l-1.5 2v2a1 1 0 01-1 1h-9a1 1 0 01-1-1v-2L5 13v-3a7 7 0 017-7z" />
      <circle cx="9.5" cy="11" r="1.2" /><circle cx="14.5" cy="11" r="1.2" /><path d="M12 15v2" />
    </>
  ),
  hourglass: <><path d="M6 3h12M6 21h12" /><path d="M7 3v4l5 5 5-5V3" /><path d="M7 21v-4l5-5 5 5v4" /></>,
  coins: <><ellipse cx="9" cy="7" rx="6" ry="3" /><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7" /><path d="M15 10.5c2.6.6 6 .4 6-2.5V7" /></>,
  activity: <path d="M3 12h4l2.5-7 4 14 2.5-7h5" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  book: <><path d="M4 5a2 2 0 012-2h5v18H6a2 2 0 01-2-2z" /><path d="M20 5a2 2 0 00-2-2h-5v18h5a2 2 0 002-2z" /></>,
  layers: <path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5" />,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3M13 15h4" /></>,
  flame: <><path d="M12 22c4 0 6-2.6 6-6 0-4-4-6-4-10 0 0-2 1.4-2 4 0-2-2-3-2-5-3 1.6-4 4.6-4 8 0 5 2 9 6 9z" /></>,
  snowflake: <><path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" /><path d="M9 5l3-2 3 2M9 19l3 2 3-2" /></>,
  link: <><path d="M9 15l6-6" /><path d="M11 6l1.5-1.5a4 4 0 116 6L17 12" /><path d="M13 18l-1.5 1.5a4 4 0 11-6-6L7 12" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0112 0" /><path d="M16 5.5a3.2 3.2 0 010 5.6M17.5 20a6 6 0 00-2-4.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></>,
  'arrow-up': <><path d="M12 20V4" /><path d="M6 10l6-6 6 6" /></>,
  'arrow-down': <><path d="M12 4v16" /><path d="M6 14l6 6 6-6" /></>,
  'arrow-right': <><path d="M4 12h16" /><path d="M14 6l6 6-6 6" /></>,
  filter: <path d="M3 5h18l-7 8v6l-4-2v-4z" />,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></>,
  spark: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z" />,
  database: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.5 3.8 5.6 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3z" /></>,
  heart: <path d="M12 20s-7-4.4-7-9.3A4 4 0 0112 8a4 4 0 017 2.7C19 15.6 12 20 12 20z" />,
  grid: <><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></>,
  'zap-off': <><path d="M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12z" /><path d="M3 3l18 18" /></>,
  pause: <><rect x="7" y="5" width="3.5" height="14" rx="1" /><rect x="13.5" y="5" width="3.5" height="14" rx="1" /></>,
  play: <path d="M7 4.5l12 7.5-12 7.5z" />,
  download: <><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M4 20h16" /></>,
  upload: <><path d="M12 21V9" /><path d="M7 13l5-5 5 5" /><path d="M4 4h16" /></>,
  scissors: <><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><path d="M8.2 7.6L20 18M8.2 16.4L20 6" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />,
};

export function Icon({
  name,
  size = 16,
  className,
  strokeWidth = 1.8,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      style={{ flex: 'none' }}
    >
      {P[name]}
    </svg>
  );
}
