import { useColorScheme } from 'react-native';
import type { HealthStatus, TaskUrgency } from '../core/types';

/**
 * The design system.
 *
 * The house is the hero, not the software. That rules out the visual language
 * software usually reaches for to signal intelligence — gradients, glows, saturated
 * accent colours, a chat bubble on every screen. A homeowner deciding whether to
 * trust a $9,000 replacement warning reads that styling as marketing, and marketing
 * is the opposite of what this product is selling.
 *
 * So: warm off-white ground, near-black text, generous space, and colour used only
 * to carry status. Red is reserved for things that are genuinely urgent. If it
 * appears on a screen it should mean something, which means it has to be rare.
 */

export interface Theme {
  dark: boolean;

  /** Page ground. Warm, not clinical white. */
  bg: string;
  /** Cards sit above the ground. */
  surface: string;
  /** Inset areas inside a card — inputs, wells, muted chips. */
  surfaceSunken: string;
  /** Hairline borders. Barely there by design; elevation does the separating. */
  border: string;
  borderStrong: string;

  text: string;
  textSecondary: string;
  textTertiary: string;

  /** Healthy. Muted sage — reassuring rather than congratulatory. */
  sage: string;
  sageSoft: string;
  /** Needs attention, not alarming. */
  amber: string;
  amberSoft: string;
  /** Genuinely urgent only. */
  red: string;
  redSoft: string;
  /** Informational and AI actions. Deliberately quiet. */
  blue: string;
  blueSoft: string;

  /** Primary action fill. */
  ink: string;
  onInk: string;

  shadow: string;
}

const light: Theme = {
  dark: false,
  bg: '#FAF9F6',
  surface: '#FFFFFF',
  surfaceSunken: '#F4F2EE',
  border: '#EBE8E2',
  borderStrong: '#DDD9D1',
  text: '#1B1B1D',
  textSecondary: '#6B6B70',
  textTertiary: '#9B9BA0',
  sage: '#4F7D62',
  sageSoft: '#EAF1EC',
  amber: '#A87322',
  amberSoft: '#FAF0DF',
  red: '#B04338',
  redSoft: '#FBECEA',
  blue: '#3E6E93',
  blueSoft: '#EBF2F7',
  ink: '#1F2A24',
  onInk: '#FFFFFF',
  shadow: '#1B1B1D',
};

const dark: Theme = {
  dark: true,
  bg: '#131513',
  surface: '#1C1F1D',
  surfaceSunken: '#252926',
  border: '#2C312E',
  borderStrong: '#3A403C',
  text: '#EDEFEC',
  textSecondary: '#A0A6A2',
  textTertiary: '#71776F',
  sage: '#7FB394',
  sageSoft: '#1B2A21',
  amber: '#D6A34E',
  amberSoft: '#2C2517',
  red: '#E08079',
  redSoft: '#2E1C1A',
  blue: '#7FAECE',
  blueSoft: '#17242D',
  ink: '#EDEFEC',
  onInk: '#131513',
  shadow: '#000000',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

/** 4pt base. Home screens breathe; dense screens step down, never below `sm`. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 32,
  xxxl: 44,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  pill: 999,
} as const;

/**
 * Type scale. The system font is the point — SF Pro on iOS, Roboto on Android —
 * because a custom typeface is the fastest way to make a utility app feel like a
 * brand exercise.
 */
export const type = {
  hero: { fontSize: 44, fontWeight: '600' as const, letterSpacing: -1.4 },
  display: { fontSize: 32, fontWeight: '600' as const, letterSpacing: -0.8 },
  title: { fontSize: 26, fontWeight: '600' as const, letterSpacing: -0.5 },
  heading: { fontSize: 19, fontWeight: '600' as const, letterSpacing: -0.3 },
  subheading: { fontSize: 16, fontWeight: '600' as const, letterSpacing: -0.1 },
  body: { fontSize: 15.5, fontWeight: '400' as const, lineHeight: 22 },
  bodyStrong: { fontSize: 15.5, fontWeight: '500' as const },
  small: { fontSize: 13.5, fontWeight: '400' as const, lineHeight: 19 },
  smallStrong: { fontSize: 13.5, fontWeight: '600' as const },
  label: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.6 },
};

/** A soft, low-contrast lift. Cards should feel placed, not cut out. */
export const elevation = (theme: Theme, level: 1 | 2 = 1) => ({
  shadowColor: theme.shadow,
  shadowOpacity: theme.dark ? 0.3 : level === 1 ? 0.045 : 0.09,
  shadowRadius: level === 1 ? 10 : 20,
  shadowOffset: { width: 0, height: level === 1 ? 2 : 6 },
  elevation: level === 1 ? 1 : 4,
});

/* -------------------------------------------------------------------------
 * Status
 * ---------------------------------------------------------------------- */

export type StatusKey = 'good' | 'attention' | 'urgent' | 'neutral' | 'info';

export interface Tone {
  fg: string;
  bg: string;
  label: string;
}

export function toneFor(theme: Theme, key: StatusKey, label?: string): Tone {
  switch (key) {
    case 'good':
      return { fg: theme.sage, bg: theme.sageSoft, label: label ?? 'Good' };
    case 'attention':
      return { fg: theme.amber, bg: theme.amberSoft, label: label ?? 'Needs attention' };
    case 'urgent':
      return { fg: theme.red, bg: theme.redSoft, label: label ?? 'Urgent' };
    case 'info':
      return { fg: theme.blue, bg: theme.blueSoft, label: label ?? 'Info' };
    default:
      return { fg: theme.textSecondary, bg: theme.surfaceSunken, label: label ?? 'Unknown' };
  }
}

/**
 * Health status → status key and the plain-language label shown to the owner.
 *
 * The labels avoid arithmetic. "Planning recommended" tells someone what to do;
 * "42.3% health" invites them to argue with a number the app cannot actually
 * defend to that precision.
 */
export function healthStatus(status: HealthStatus): { key: StatusKey; label: string } {
  switch (status) {
    case 'good':
      return { key: 'good', label: 'Good' };
    case 'monitor':
      return { key: 'good', label: 'Aging normally' };
    case 'aging':
      return { key: 'attention', label: 'Needs attention' };
    case 'plan_replacement':
      return { key: 'urgent', label: 'Planning recommended' };
    default:
      return { key: 'neutral', label: 'Not enough information' };
  }
}

export function urgencyStatus(
  urgency: TaskUrgency,
  criticality: 'safety' | 'high' | 'medium' | 'low',
): { key: StatusKey; label: string } {
  if (urgency === 'overdue') return { key: 'urgent', label: 'Overdue' };
  if (urgency === 'due_soon') {
    // A safety item coming due reads urgent before it is late; nothing else does.
    return criticality === 'safety'
      ? { key: 'urgent', label: 'Due now' }
      : { key: 'attention', label: 'Due soon' };
  }
  if (urgency === 'upcoming') return { key: 'neutral', label: 'Upcoming' };
  return { key: 'neutral', label: 'Scheduled' };
}

/** Overall score → band. Deliberately coarse; the number is not that precise. */
export function scoreBand(score: number): { key: StatusKey; label: string } {
  if (score >= 80) return { key: 'good', label: 'Good' };
  if (score >= 65) return { key: 'good', label: 'Fair' };
  if (score >= 50) return { key: 'attention', label: 'Needs attention' };
  return { key: 'urgent', label: 'Planning needed' };
}

export function scoreColor(theme: Theme, score: number): string {
  return toneFor(theme, scoreBand(score).key).fg;
}

/* -------------------------------------------------------------------------
 * Categories
 * ---------------------------------------------------------------------- */

export const CATEGORY_LABEL: Record<string, string> = {
  hvac: 'HVAC',
  water_heater: 'Water Heater',
  roof: 'Roof',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  appliance: 'Appliances',
  windows: 'Windows',
  exterior: 'Exterior',
  flooring: 'Flooring',
  safety: 'Safety',
  structure: 'Structure',
  other: 'Other',
  unassigned: 'Not linked',
};

/** Thin line icons only — Ionicons' outline set. */
export const CATEGORY_ICON: Record<string, string> = {
  hvac: 'thermometer-outline',
  water_heater: 'water-outline',
  roof: 'home-outline',
  electrical: 'flash-outline',
  plumbing: 'git-branch-outline',
  appliance: 'cube-outline',
  windows: 'browsers-outline',
  exterior: 'leaf-outline',
  flooring: 'layers-outline',
  safety: 'shield-outline',
  structure: 'business-outline',
  other: 'ellipsis-horizontal-outline',
};

export function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
