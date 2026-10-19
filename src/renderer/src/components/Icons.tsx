/**
 * RESALEVAULT - Iconografia.
 *
 * Trazos propios en SVG (sin dependencias ni fuentes de iconos): pesan poco,
 * heredan el color del texto y no requieren peticiones externas, algo que la
 * politica de seguridad de contenido agradece.
 */

import type { ReactNode } from 'react'

export interface IconProps {
  size?: number
  className?: string
}

function Svg({ size = 16, className, children }: IconProps & { children: ReactNode }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const IconDashboard = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="4.5" rx="1.5" />
    <rect x="13.5" y="10.5" width="7.5" height="10.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </Svg>
)

export const IconBox = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M20.5 7.5 12 3 3.5 7.5v9L12 21l8.5-4.5z" />
    <path d="M3.5 7.5 12 12l8.5-4.5" />
    <path d="M12 12v9" />
  </Svg>
)

export const IconPurchases = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.3" />
    <path d="M6.2 7.5h14.3l-1.6 6.5H7.4" />
    <circle cx="9.5" cy="20" r="1.2" />
    <circle cx="17.5" cy="20" r="1.2" />
  </Svg>
)

export const IconOrders = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M6 2.5h9l4 4V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z" />
    <path d="M14.5 2.5V7h4.5" />
    <path d="M8.5 12h7M8.5 16h5" />
  </Svg>
)

export const IconPicking = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <rect x="4" y="3.5" width="16" height="17" rx="2" />
    <path d="M9 3.5h6v2.5H9z" />
    <path d="m8.5 13 2.2 2.2 4.3-4.4" />
  </Svg>
)

export const IconShipping = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M21.5 3 11 13.5" />
    <path d="M21.5 3l-6.8 18-3.7-7.5L3.5 9.8z" />
  </Svg>
)

export const IconSparkles = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M12 3.5 13.8 9l5.5 1.8-5.5 1.8L12 18l-1.8-5.4L4.7 10.8 10.2 9z" />
    <path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
  </Svg>
)

export const IconIntelligence = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M9 18.5h6" />
    <path d="M10 21.5h4" />
    <path d="M12 2.5a6 6 0 0 0-3.5 10.9V16h7v-2.6A6 6 0 0 0 12 2.5z" />
  </Svg>
)

export const IconAnalytics = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <path d="M8 20v-7M12.5 20V8M17 20v-4.5" />
  </Svg>
)

export const IconCategories = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <rect x="3" y="3.5" width="7" height="6" rx="1.5" />
    <rect x="14" y="14.5" width="7" height="6" rx="1.5" />
    <rect x="3" y="14.5" width="7" height="6" rx="1.5" />
    <path d="M6.5 9.5v5M6.5 14.5h7.5v-6" />
  </Svg>
)

export const IconLocations = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M12 21.5s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z" />
    <circle cx="12" cy="10.5" r="2.5" />
  </Svg>
)

export const IconImportExport = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M3.5 8.5h13l-3.5-3.5" />
    <path d="M20.5 15.5h-13l3.5 3.5" />
  </Svg>
)

export const IconSettings = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
  </Svg>
)

export const IconLicense = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <circle cx="8" cy="14.5" r="4.5" />
    <path d="m11.5 11.5 8-8M17 5.5l2 2M15 7.5l2 2" />
  </Svg>
)

export const IconSearch = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 4.5 4.5" />
  </Svg>
)

export const IconPlus = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const IconEdit = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </Svg>
)

export const IconTrash = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M4 6.5h16" />
    <path d="M9 6.5V4.5h6v2" />
    <path d="M6.5 6.5 7.5 20a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1l1-13.5" />
    <path d="M10.5 10.5v6M13.5 10.5v6" />
  </Svg>
)

export const IconArchive = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="4.5" rx="1" />
    <path d="M5 8.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5" />
    <path d="M10 13h4" />
  </Svg>
)

export const IconRestore = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3.5 4.5V11h6.5" />
  </Svg>
)

export const IconClose = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
)

export const IconMinimize = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
)

export const IconMaximize = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <rect x="5" y="5" width="14" height="14" rx="1" />
  </Svg>
)

export const IconSun = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
  </Svg>
)

export const IconMoon = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </Svg>
)

export const IconGlobe = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17" />
    <path d="M12 3.5c2.2 2.4 3.4 5.4 3.4 8.5s-1.2 6.1-3.4 8.5c-2.2-2.4-3.4-5.4-3.4-8.5S9.8 5.9 12 3.5z" />
  </Svg>
)

export const IconCheck = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Svg>
)

export const IconAlert = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M12 3.5 21 20H3z" />
    <path d="M12 9.5v4.5M12 17h.01" />
  </Svg>
)

export const IconClock = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
)

export const IconImage = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m5 17 4.5-4.5L13 16l3-2.5 3.5 3.5" />
  </Svg>
)

export const IconTag = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M20.5 12.5 12.5 20.5a1.6 1.6 0 0 1-2.3 0l-6.7-6.7a1.6 1.6 0 0 1-.5-1.2V5a1.5 1.5 0 0 1 1.5-1.5h7.6c.4 0 .9.2 1.2.5l6.7 6.7a1.6 1.6 0 0 1 0 2.3z" />
    <circle cx="8" cy="8" r="1.2" />
  </Svg>
)

export const IconChevronLeft = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="m14.5 5-7 7 7 7" />
  </Svg>
)

export const IconChevronRight = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="m9.5 5 7 7-7 7" />
  </Svg>
)

export const IconFilter = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M3.5 5.5h17l-6.5 7.5V20l-4-2v-5z" />
  </Svg>
)

export const IconRefresh = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
    <path d="M20.5 4.5V11H14" />
  </Svg>
)

export const IconExternal = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M14 4.5h5.5V10" />
    <path d="M19.5 4.5 11 13" />
    <path d="M18 14.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4.5" />
  </Svg>
)

/** Shipping Tracker: paquete con lupa. */
export const IconTracker = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M20.5 7.5 12 3 3.5 7.5v9L12 21l4-2.1" />
    <path d="M3.5 7.5 12 12l8.5-4.5" />
    <path d="M12 12v6.5" />
    <circle cx="17.5" cy="16.5" r="3" />
    <path d="m19.8 18.8 2.2 2.2" />
  </Svg>
)
