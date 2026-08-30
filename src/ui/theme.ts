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

  /*
   * The brand marks, fixed across both themes.
   *
   * Everything above is a role that flips between light and dark; these three
   * are the logo's own colours and must not. A mark that changes hue with the
   * OS setting is a different mark.
   */
  brandNavy: string;
  brandSage: string;
  /** The sage lifted enough to hold on the navy hero. */
  brandSageLight: string;
  /** The scan button. The only place the sage is a fill rather than an accent. */
  scanGreen: string;

  shadowAmbient: string;
  shadowKey: string;
}

const BRAND_NAVY = '#1B2A3E';
const BRAND_SAGE = '#6F7B5F';
const BRAND_SAGE_LIGHT = '#9DAC88';

const light: Theme = {
  dark: false,
  bg: '#FCF8F3',
  bgAlt: '#F6F1EA',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#F4EFE8',
  glass: 'rgba(255,255,255,0.74)',
  hairline: 'rgba(27,42,62,0.07)',
  border: 'rgba(27,42,62,0.12)',
  text: '#16222F',
  textSecondary: '#5A6675',
  textTertiary: '#95A0AC',
  // Sage is the brand olive, darkened just enough to pass as body-adjacent text.
  sage: '#5C6A4C',
  sageSoft: '#EBEEE4',
  sageDeep: '#46543A',
  amber: '#A9741A',
  amberSoft: '#FAEEDA',
  red: '#B0372B',
  redSoft: '#FBE8E5',
  blue: '#31607F',
  blueSoft: '#E9F0F5',
  // The hero and every primary fill: the navy off the logo, deepened.
  ink: '#12202E',
  inkElevated: '#1B2A3E',
  onInk: '#FFFFFF',
  shadowAmbient: 'rgba(18,32,46,1)',
  shadowKey: 'rgba(18,32,46,1)',
  brandNavy: BRAND_NAVY,
  brandSage: BRAND_SAGE,
  brandSageLight: BRAND_SAGE_LIGHT,
  scanGreen: '#587052',
};

const dark: Theme = {
  dark: true,
  bg: '#07131E',
  bgAlt: '#0A1826',
  // In dark mode elevation is carried by lightness, not shadow — shadows are
  // invisible on a near-black ground, so each layer steps up instead.
  surface: '#0F1E2C',
  surfaceRaised: '#16283A',
  surfaceSunken: '#0B1926',
  glass: 'rgba(15,30,44,0.74)',
  hairline: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)',
  text: '#E9EEF3',
  textSecondary: '#9AA8B6',
  textTertiary: '#68788A',
  sage: '#A8BA92',
  sageSoft: '#1B2619',
  sageDeep: '#C0CFAC',
  amber: '#D8A34F',
  amberSoft: '#2A2113',
  red: '#E58A81',
  redSoft: '#2E1A18',
  blue: '#7FB3D6',
  blueSoft: '#12242F',
  ink: '#E9EEF3',
  inkElevated: '#D6DEE6',
  onInk: '#07131E',
  shadowAmbient: 'rgba(0,0,0,1)',
  shadowKey: 'rgba(0,0,0,1)',
  brandNavy: BRAND_NAVY,
  brandSage: BRAND_SAGE,
  brandSageLight: BRAND_SAGE_LIGHT,
  scanGreen: '#63805B',
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
  // The hero is the brand navy, deepening downward so the score ring at the top
  // sits on the lighter end of it.
  return theme.dark
    ? (['#12283C', '#0B1A28', '#07131E'] as const)
    : (['#22394F', '#132434', '#071624'] as const);
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
/**
 * `short` is for places with a tile's worth of room rather than a row's —
 * "Planning recommended" truncates to "Planning re…", which reads as broken
 * text rather than as a status.
 */
export function healthStatus(status: HealthStatus): {
  key: StatusKey;
  label: string;
  short: string;
} {
  switch (status) {
    case 'good':
      return { key: 'good', label: 'Good', short: 'Good' };
    case 'monitor':
      return { key: 'good', label: 'Aging normally', short: 'Good' };
    case 'aging':
      return { key: 'attention', label: 'Needs attention', short: 'Plan ahead' };
    case 'plan_replacement':
      return { key: 'urgent', label: 'Planning recommended', short: 'Attention' };
    default:
      return { key: 'neutral', label: 'Not enough info', short: 'Unknown' };
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
/*
 * Fair is amber, not green.
 *
 * It used to share the 'good' tone, which put the word FAIR in reassuring sage
 * on a house with several systems near the end of their life. A band exists to
 * be read at a glance and colour is most of that reading — if "Fair" looks the
 * same as "Good", the band has told the owner nothing.
 */
export function scoreBand(score: number): { key: StatusKey; label: string } {
  if (score >= 80) return { key: 'good', label: 'Good' };
  if (score >= 65) return { key: 'attention', label: 'Fair' };
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
