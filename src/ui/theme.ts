import { useColorScheme } from 'react-native';
import type { HealthStatus, TaskUrgency } from '../core/types';

/**
 * Palette.
 *
 * The status colours are the load-bearing part. They appear on the health
 * dashboard, the maintenance calendar, and the forecast, and they have to mean the
 * same thing in all three or the app teaches people to ignore them. Red is reserved
 * for "act now"; amber for "plan for this"; green for "nothing to do". Nothing is
 * ever coloured for emphasis alone, and every colour is paired with a text label so
 * the app is still readable to someone who cannot distinguish them.
 */

export interface Theme {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  success: string;
  successSoft: string;
  info: string;
  infoSoft: string;
}

const light: Theme = {
  dark: false,
  bg: '#F6F5F1',
  surface: '#FFFFFF',
  surfaceAlt: '#EFEEE8',
  border: '#E0DED6',
  text: '#16211E',
  textMuted: '#5C6560',
  textFaint: '#8A928C',
  accent: '#0F6B4F',
  accentSoft: '#DFF0E7',
  onAccent: '#FFFFFF',
  danger: '#B3261E',
  dangerSoft: '#FBE4E2',
  warning: '#9A6300',
  warningSoft: '#FBEFD6',
  success: '#1B6B3A',
  successSoft: '#DFF0E3',
  info: '#1F5673',
  infoSoft: '#DFEBF3',
};

const dark: Theme = {
  dark: true,
  bg: '#0F1512',
  surface: '#18201C',
  surfaceAlt: '#212A25',
  border: '#2C3630',
  text: '#ECF1ED',
  textMuted: '#9EA9A2',
  textFaint: '#6F7A73',
  accent: '#4CC38A',
  accentSoft: '#162A20',
  onAccent: '#062015',
  danger: '#F2837A',
  dangerSoft: '#301A18',
  warning: '#E3B341',
  warningSoft: '#2E2515',
  success: '#4CC38A',
  successSoft: '#152A20',
  info: '#7FC0E8',
  infoSoft: '#152430',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

export const type = {
  display: { fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.6 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  smallStrong: { fontSize: 13, fontWeight: '600' as const },
  micro: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.4 },
};

export interface StatusTone {
  fg: string;
  bg: string;
  dot: string;
  label: string;
}

export function healthTone(theme: Theme, status: HealthStatus): StatusTone {
  switch (status) {
    case 'good':
      return { fg: theme.success, bg: theme.successSoft, dot: '🟢', label: 'Good' };
    case 'monitor':
      return { fg: theme.success, bg: theme.successSoft, dot: '🟢', label: 'Monitor' };
    case 'aging':
      return { fg: theme.warning, bg: theme.warningSoft, dot: '🟡', label: 'Aging' };
    case 'plan_replacement':
      return { fg: theme.danger, bg: theme.dangerSoft, dot: '🔴', label: 'Plan replacement' };
    case 'unknown':
    default:
      return { fg: theme.textMuted, bg: theme.surfaceAlt, dot: '⚪️', label: 'Unknown' };
  }
}

export function urgencyTone(
  theme: Theme,
  urgency: TaskUrgency,
  criticality: 'safety' | 'high' | 'medium' | 'low',
): StatusTone {
  if (urgency === 'overdue') {
    return { fg: theme.danger, bg: theme.dangerSoft, dot: '🔴', label: 'Overdue' };
  }
  if (urgency === 'due_soon') {
    // A safety item coming due reads red even before it is late.
    return criticality === 'safety'
      ? { fg: theme.danger, bg: theme.dangerSoft, dot: '🔴', label: 'Due now — safety' }
      : { fg: theme.warning, bg: theme.warningSoft, dot: '🟡', label: 'Due soon' };
  }
  if (urgency === 'upcoming') {
    return { fg: theme.success, bg: theme.successSoft, dot: '🟢', label: 'Upcoming' };
  }
  return { fg: theme.textMuted, bg: theme.surfaceAlt, dot: '📅', label: 'Scheduled' };
}

export function scoreTone(theme: Theme, score: number): string {
  if (score >= 80) return theme.success;
  if (score >= 60) return theme.warning;
  return theme.danger;
}

export const CATEGORY_ICON: Record<string, string> = {
  hvac: 'snow-outline',
  water_heater: 'water-outline',
  roof: 'home-outline',
  electrical: 'flash-outline',
  plumbing: 'git-branch-outline',
  appliance: 'cube-outline',
  windows: 'grid-outline',
  exterior: 'leaf-outline',
  flooring: 'layers-outline',
  safety: 'shield-checkmark-outline',
  structure: 'business-outline',
  other: 'ellipsis-horizontal-outline',
};

export const CATEGORY_LABEL: Record<string, string> = {
  hvac: 'Heating & cooling',
  water_heater: 'Water heater',
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
};
