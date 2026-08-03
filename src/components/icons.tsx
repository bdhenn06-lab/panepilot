import type { SVGProps } from 'react';

/* Minimal tabler-style stroke icons, inlined so nothing loads from a CDN. */

function base(props: SVGProps<SVGSVGElement>) {
  return {
    xmlns: 'http://www.w3.org/2000/svg',
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...props,
  };
}

export const IconWind = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 8h8.5a2.5 2.5 0 1 0 -2.34 -3.24" />
    <path d="M3 12h15.5a2.5 2.5 0 1 1 -2.34 3.24" />
    <path d="M4 16h5.5a2.5 2.5 0 1 1 -2.34 3.24" />
  </svg>
);

export const IconMail = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6l9 -6" />
  </svg>
);

export const IconPhone = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2" />
  </svg>
);

export const IconFile = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
    <path d="M9 12h6" />
    <path d="M9 16h6" />
  </svg>
);

export const IconMap = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 7l6 -3l6 3l6 -3v13l-6 3l-6 -3l-6 3v-13" />
    <path d="M9 4v13" />
    <path d="M15 7v13" />
  </svg>
);

export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 12l5 5l10 -10" />
  </svg>
);

export const IconRoute = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="6" cy="19" r="2" />
    <circle cx="18" cy="5" r="2" />
    <path d="M12 19h4.5a3.5 3.5 0 0 0 0 -7h-8a3.5 3.5 0 0 1 0 -7h3.5" />
  </svg>
);

export const IconRefresh = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
    <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
  </svg>
);

export const IconAlarm = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="13" r="7" />
    <path d="M12 10v3l2 2" />
    <path d="M7 4l-2.75 2" />
    <path d="M17 4l2.75 2" />
  </svg>
);

export const IconUpload = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
    <path d="M7 9l5 -5l5 5" />
    <path d="M12 4v12" />
  </svg>
);

export const IconDownload = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
    <path d="M7 11l5 5l5 -5" />
    <path d="M12 4v12" />
  </svg>
);

export const IconChevronDown = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 9l6 6l6 -6" />
  </svg>
);

export const IconLogout = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" />
    <path d="M9 12h12l-3 -3" />
    <path d="M18 15l3 -3" />
  </svg>
);

export const IconUsers = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="9" cy="7" r="4" />
    <path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    <path d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
  </svg>
);

export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 7h16" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
    <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
  </svg>
);

export const IconGauge = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 14l3.5 -3.5" />
    <circle cx="12" cy="14" r="1" />
    <path d="M4 18a9 9 0 1 1 16 0" />
  </svg>
);

export const IconTarget = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </svg>
);

export const IconClock = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const IconBuilding = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 21h18" />
    <path d="M5 21v-16a1 1 0 0 1 1 -1h7a1 1 0 0 1 1 1v16" />
    <path d="M14 9h4a1 1 0 0 1 1 1v11" />
    <path d="M8 8h2" />
    <path d="M8 12h2" />
    <path d="M8 16h2" />
  </svg>
);

export const IconSliders = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 6h10" />
    <path d="M18 6h2" />
    <path d="M4 12h4" />
    <path d="M12 12h8" />
    <path d="M4 18h10" />
    <path d="M18 18h2" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="16" cy="18" r="2" />
  </svg>
);
