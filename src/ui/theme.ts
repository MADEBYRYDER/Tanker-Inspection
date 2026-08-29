import { Platform, useColorScheme } from 'react-native';
import type { HealthStatus, TaskUrgency } from '../core/types';

/**
 * The design system.
 *
 * The house is the hero, not the software — which rules out the visual language
 * apps normally use to signal intelligence: neon gradients, glowing accents, a chat
 * bubble on every screen. Someone deciding whether to trust a $9,000 replacement
 * warning reads that as marketing.
 *
 * But restraint is not the same as flatness. Premium comes from depth, hierarchy,
 * and material: layered shadows rather than borders, tonal gradients rather than
 * flat fills, one dramatic focal moment per screen rather than uniform cards, and
 * numbers set large in tabular figures. Colour still carries status and nothing
 * else, and red is rare enough that it means something when it appears.
 */

export interface Theme {
  dark: boolean;

  /** Page ground. Warm, never clinical white. */
  bg: string;
  /** A second ground tone for banded sections. */
  bgAlt: string;
  /** Cards. */
  surface: string;
  /** Cards that sit on top of other cards. */
  surfaceRaised: string;
  /** Inset wells — inputs, muted chips, track backgrounds. */
  surfaceSunken: string;
  /** Translucent fill for glass surfaces over content. */
  glass: string;

  /** Hairlines. Barely visible; elevation does the separating. */
  hairline: string;
  border: string;

  text: string;
  textSecondary: string;
  textTertiary: string;

  /** Healthy. Muted sage — reassuring, never congratulatory. */
  sage: string;
  sageSoft: string;
  sageDeep: string;
  /** Needs attention. */
  amber: string;
  amberSoft: string;
  /** Genuinely urgent only. */
  red: string;
  redSoft: string;
  /** Informational and AI. Deliberately quiet. */
  blue: string;
  blueSoft: string;

  /** Primary action fill and the hero gradient base. */
  ink: string;
  inkElevated: string;
  onInk: string;

  shadowAmbient: string;
  shadowKey: string;
}

const light: Theme = {
  dark: false,
  bg: '#F7F6F2',
  bgAlt: '#F1EFE9',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#F2F0EB',
  glass: 'rgba(255,255,255,0.72)',
  hairline: 'rgba(28,28,30,0.06)',
  border: 'rgba(28,28,30,0.10)',
  text: '#15171A',
  textSecondary: '#5F6570',
  textTertiary: '#9AA0A8',
  sage: '#3F7A5E',
  sageSoft: '#E6F0E9',
  sageDeep: '#2A5A44',
  amber: '#9A6612',
  amberSoft: '#FAEFDC',
  red: '#AE3B31',
  redSoft: '#FBEAE7',
  blue: '#2F6285',
  blueSoft: '#E8F0F6',
  ink: '#18231D',
  inkElevated: '#243228',
  onInk: '#FFFFFF',
  shadowAmbient: 'rgba(21,23,26,1)',
  shadowKey: 'rgba(21,23,26,1)',
};

const dark: Theme = {
  dark: true,
  bg: '#0D100E',
  bgAlt: '#111512',
  // In dark mode elevation is carried by lightness, not shadow — shadows are
  // invisible on a near-black ground, so each layer steps up instead.
  surface: '#171B18',
  surfaceRaised: '#1E2320',
  surfaceSunken: '#121614',
  glass: 'rgba(23,27,24,0.72)',
  hairline: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.11)',
  text: '#ECEFEC',
  textSecondary: '#9DA5A0',
  textTertiary: '#6B7370',
  sage: '#79BE97',
  sageSoft: '#17281F',
  sageDeep: '#9BD4B2',
  amber: '#DEAE5C',
  amberSoft: '#2A2317',
  red: '#E58A81',
  redSoft: '#2C1B19',
  blue: '#84B4D4',
  blueSoft: '#15232C',
  ink: '#EDF0ED',
  inkElevated: '#DDE2DE',
  onInk: '#0D100E',
  shadowAmbient: 'rgba(0,0,0,1)',
  shadowKey: 'rgba(0,0,0,1)',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 30,
  xxxl: 44,
} as const;

/** Softer, larger radii than a utility app would use. Corners read as expensive. */
export const radius = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  xxl: 34,
  pill: 999,
} as const;

/**
 * Type scale.
 *
 * The system font is the point — SF Pro on iOS, Roboto on Android. A custom
 * typeface is the fastest way to make a utility app feel like a brand exercise.
 * What does the work instead is range: a 56px score against 12px labels, with
 * tight negative tracking on everything large.
 */
export const type = {
  mega: { fontSize: 56, fontWeight: '700' as const, letterSpacing: -2.4 },
  hero: { fontSize: 40, fontWeight: '700' as const, letterSpacing: -1.5 },
  display: { fontSize: 30, fontWeight: '700' as const, letterSpacing: -1 },
  title: { fontSize: 25, fontWeight: '700' as const, letterSpacing: -0.7 },
  heading: { fontSize: 18.5, fontWeight: '600' as const, letterSpacing: -0.4 },
  subheading: { fontSize: 16, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 15.5, fontWeight: '400' as const, lineHeight: 22.5 },
  bodyStrong: { fontSize: 15.5, fontWeight: '600' as const, letterSpacing: -0.1 },
  small: { fontSize: 13.5, fontWeight: '400' as const, lineHeight: 19.5 },
  smallStrong: { fontSize: 13.5, fontWeight: '600' as const },
  label: { fontSize: 11.5, fontWeight: '700' as const, letterSpacing: 0.8 },
};

/** Figures line up in columns. Essential anywhere numbers stack. */
export const tabular = Platform.select({
  ios: { fontVariant: ['tabular-nums' as const] },
  default: { fontVariant: ['tabular-nums' as const] },
});

/**
 * Two-layer shadow: a wide soft ambient plus a tighter key.
 *
 * A single shadow reads as a drop shadow; two read as an object resting on a
 * surface. On dark grounds shadows are invisible, so elevation there comes from
 * the surface tokens instead and these collapse to almost nothing.
 */
export function elevation(theme: Theme, level: 0 | 1 | 2 | 3 = 1) {
  if (level === 0) return {};
  if (theme.dark) {
    return {
      shadowColor: theme.shadowKey,
      shadowOpacity: 0.4,
      shadowRadius: level * 8,
      shadowOffset: { width: 0, height: level * 2 },
      elevation: level,
    };
  }
  const spec = {
    1: { opacity: 0.05, radius: 12, y: 3 },
    2: { opacity: 0.07, radius: 24, y: 8 },
    3: { opacity: 0.1, radius: 40, y: 16 },
  }[level];
  return {
    shadowColor: theme.shadowKey,
    shadowOpacity: spec.opacity,
    shadowRadius: spec.radius,
    shadowOffset: { width: 0, height: spec.y },
    elevation: level * 3,
  };
}

/* -------------------------------------------------------------------------
 * Gradients
 * ---------------------------------------------------------------------- */

export type GradientStops = readonly [string, string, ...string[]];

/**
 * The dashboard hero. A deep tonal green rather than a brand gradient — it reads
 * as material (a dark surface catching light) rather than as decoration.
 */
export function heroGradient(theme: Theme): GradientStops {
  return theme.dark
    ? (['#1B2620', '#141A16', '#0F1411'] as const)
    : (['#2C4034', '#1E2C24', '#18231D'] as const);
}

/** A soft tint behind an icon or tile, derived from a status colour. */
export function tintGradient(theme: Theme, key: StatusKey): GradientStops {
  const tone = toneFor(theme, key);
  return [tone.bg, theme.dark ? theme.surface : '#FFFFFF'] as const;
}

/** Ring stroke gradient — brighter at the leading edge so the arc has direction. */
export function ringGradient(theme: Theme, key: StatusKey): [string, string] {
  switch (key) {
    case 'good':
      return [theme.sageDeep, theme.sage];
    case 'attention':
      return [theme.amber, theme.dark ? '#EFC77E' : '#C58A2B'];
    case 'urgent':
      return [theme.red, theme.dark ? '#F0A79F' : '#C9564B'];
    default:
      return [theme.textTertiary, theme.textSecondary];
  }
}

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
 * Health status → status key and the words shown to the owner.
 *
 * The labels avoid arithmetic. "Planning recommended" tells someone what to do;
 * "42.3% health" invites them to argue with a number the app cannot defend to that
 * precision.
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
      return { key: 'neutral', label: 'Not enough info' };
  }
}

export function urgencyStatus(
  urgency: TaskUrgency,
  criticality: 'safety' | 'high' | 'medium' | 'low',
): { key: StatusKey; label: string } {
  if (urgency === 'overdue') {
    return { key: 'urgent', label: criticality === 'safety' ? 'Overdue — safety' : 'Overdue' };
  }
  if (urgency === 'due_soon') {
    // Amber, not red, even for safety work. Red is for things that are wrong now;
    // a detector test due in three days is a plan, and spending red on it is how a
    // colour stops meaning anything.
    return { key: 'attention', label: criticality === 'safety' ? 'Due now — safety' : 'Due soon' };
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

/** Motion. Short, spring-like, never showy. */
export const motion = {
  fast: 180,
  base: 320,
  slow: 620,
  /** Stagger between list items entering. */
  stagger: 55,
} as const;
