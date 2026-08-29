import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import {
  elevation,
  radius,
  spacing,
  toneFor,
  type,
  useTheme,
  type StatusKey,
  type Theme,
} from './theme';

type IconName = keyof typeof Ionicons.glyphMap;

/* ------------------------------- Layout -------------------------------- */

export function Screen({
  children,
  scroll = true,
  padded = true,
  edges = ['top'],
  gap = spacing.lg,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  gap?: number;
}) {
  const theme = useTheme();
  const inner = (
    <View
      style={{
        paddingHorizontal: padded ? spacing.lg : 0,
        paddingTop: padded ? spacing.lg : 0,
        // Clears the tab bar and its elevated centre button.
        paddingBottom: spacing.xxxl * 2.5,
        gap,
      }}
    >
      {children}
    </View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={edges}>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {inner}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{inner}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
  onPress,
  padding = spacing.xl,
  tone,
  raised = 1,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padding?: number;
  tone?: string;
  raised?: 1 | 2;
}) {
  const theme = useTheme();
  const body = (pressed: boolean) => (
    <View
      style={[
        {
          backgroundColor: tone ?? theme.surface,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
          padding,
          gap: spacing.md,
          transform: [{ scale: pressed ? 0.995 : 1 }],
        },
        elevation(theme, raised),
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return body(false);
  return <Pressable onPress={onPress}>{({ pressed }) => body(pressed)}</Pressable>;
}

export function Row({
  children,
  gap = spacing.sm,
  align = 'center',
  justify = 'flex-start',
  wrap = false,
  style,
}: {
  children: ReactNode;
  gap?: number;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  wrap?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: align,
          justifyContent: justify,
          gap,
          flexWrap: wrap ? 'wrap' : 'nowrap',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const theme = useTheme();
  return (
    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginLeft: inset }} />
  );
}

/* -------------------------------- Text --------------------------------- */

type TextProps = { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number };

function makeText(base: TextStyle, colorKey: keyof Theme = 'text') {
  return function Component({ children, style, numberOfLines }: TextProps) {
    const theme = useTheme();
    return (
      <Text numberOfLines={numberOfLines} style={[base, { color: theme[colorKey] as string }, style]}>
        {children}
      </Text>
    );
  };
}

export const Hero = makeText(type.hero);
export const Display = makeText(type.display);
export const Title = makeText(type.title);
export const Heading = makeText(type.heading);
export const Subheading = makeText(type.subheading);
export const Body = makeText(type.body);
export const BodyStrong = makeText(type.bodyStrong);
export const Small = makeText(type.small, 'textSecondary');
export const Tertiary = makeText(type.small, 'textTertiary');

/** All-caps section marker. Used sparingly — mostly above lists on dense screens. */
export function Label({ children, color }: { children: ReactNode; color?: string }) {
  const theme = useTheme();
  return (
    <Text style={[type.label, { color: color ?? theme.textTertiary, textTransform: 'uppercase' }]}>
      {children}
    </Text>
  );
}

export function SectionTitle({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  return (
    <Row justify="space-between" style={{ marginTop: spacing.sm, marginBottom: -spacing.xs }}>
      <Heading>{title}</Heading>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={[type.smallStrong, { color: theme.blue }]}>{action}</Text>
        </Pressable>
      ) : null}
    </Row>
  );
}

/* ------------------------------- Status -------------------------------- */

/** A solid status dot. Always paired with a text label — colour is never the only signal. */
export function Dot({ status, size = 10 }: { status: StatusKey; size?: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: toneFor(theme, status).fg,
      }}
    />
  );
}

export function StatusPill({
  status,
  label,
  icon,
}: {
  status: StatusKey;
  label: string;
  icon?: IconName;
}) {
  const theme = useTheme();
  const tone = toneFor(theme, status, label);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        backgroundColor: tone.bg,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: 5,
        alignSelf: 'flex-start',
      }}
    >
      {icon ? <Ionicons name={icon} size={12} color={tone.fg} /> : <Dot status={status} size={7} />}
      <Text style={[type.smallStrong, { color: tone.fg, fontSize: 12.5 }]}>{label}</Text>
    </View>
  );
}

/**
 * A small caption chip with explicit colours.
 *
 * `StatusPill` is the one to reach for when something has a status. This is for the
 * cases that are labels rather than states — "launch partner", "3 docs" — where the
 * status vocabulary would be misleading.
 */
export function Badge({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
      <Text style={[type.label, { color: fg, fontSize: 11 }]}>{label}</Text>
    </View>
  );
}

/** A bare progress bar with no label. `BarRow` is the labelled version. */
export function Meter({ value, color, max = 100 }: { value: number; color: string; max?: number }) {
  const theme = useTheme();
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max, now: Math.round(value) }}
      style={{ height: 7, borderRadius: radius.pill, backgroundColor: theme.surfaceSunken, overflow: 'hidden' }}
    >
      <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color, borderRadius: radius.pill }} />
    </View>
  );
}

/**
 * The documented-vs-estimated marker.
 *
 * Small and quiet, but present everywhere a derived number sits beside a read one.
 * It is the difference between a record people trust and one they learn to
 * second-guess, so it gets a component rather than being re-styled per screen.
 */
export function ProvenanceTag({ provenance }: { provenance: string }) {
  const theme = useTheme();
  const documented = provenance === 'documented' || provenance === 'contractor';
  return (
    <Text style={[type.small, { color: theme.textTertiary, fontSize: 12 }]}>
      {documented ? 'on record' : provenance === 'unknown' ? 'unknown' : 'estimated'}
    </Text>
  );
}

/* ------------------------------- Controls ------------------------------- */

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  iconRight,
  disabled,
  loading,
  full,
  size = 'md',
  tone,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet' | 'ghost' | 'danger';
  icon?: IconName;
  iconRight?: IconName;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  size?: 'sm' | 'md' | 'lg';
  tone?: string;
}) {
  const theme = useTheme();
  const palette = {
    primary: { bg: tone ?? theme.ink, fg: theme.onInk, border: 'transparent' },
    secondary: { bg: theme.surface, fg: theme.text, border: theme.borderStrong },
    quiet: { bg: theme.surfaceSunken, fg: theme.text, border: 'transparent' },
    ghost: { bg: 'transparent', fg: tone ?? theme.blue, border: 'transparent' },
    danger: { bg: theme.redSoft, fg: theme.red, border: 'transparent' },
  }[variant];

  const metrics = {
    sm: { py: 7, px: spacing.md, font: 13.5, icon: 14 },
    md: { py: spacing.md, px: spacing.xl, font: 15, icon: 17 },
    lg: { py: spacing.lg, px: spacing.xl, font: 16, icon: 19 },
  }[size];

  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inactive) }}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => ({
        backgroundColor: palette.bg,
        borderColor: palette.border,
        borderWidth: variant === 'secondary' ? StyleSheet.hairlineWidth : 0,
        borderRadius: radius.pill,
        paddingVertical: metrics.py,
        paddingHorizontal: metrics.px,
        opacity: inactive ? 0.4 : pressed ? 0.75 : 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        alignSelf: full ? 'stretch' : 'flex-start',
        flex: full ? 1 : undefined,
      })}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : icon ? (
        <Ionicons name={icon} size={metrics.icon} color={palette.fg} />
      ) : null}
      <Text style={{ color: palette.fg, fontSize: metrics.font, fontWeight: '600' }}>{label}</Text>
      {iconRight ? <Ionicons name={iconRight} size={metrics.icon} color={palette.fg} /> : null}
    </Pressable>
  );
}

/**
 * The DIY / Hire pair.
 *
 * Part of the product's identity rather than a styling choice: every task the app
 * raises should immediately offer both ways out of it, so the answer to "what do I
 * do about this" is never just "worry".
 */
export function DiyHire({
  onDiy,
  onHire,
  diyLabel = 'DIY',
  hireLabel = 'Hire',
  diyDisabled,
}: {
  onDiy: () => void;
  onHire: () => void;
  diyLabel?: string;
  hireLabel?: string;
  diyDisabled?: boolean;
}) {
  return (
    <Row gap={spacing.sm}>
      <Button label={diyLabel} size="sm" variant="quiet" onPress={onDiy} disabled={diyDisabled} />
      <Button label={hireLabel} size="sm" variant="secondary" onPress={onHire} />
    </Row>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  hint,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  multiline?: boolean;
  hint?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.smallStrong, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        style={{
          backgroundColor: theme.surfaceSunken,
          borderRadius: radius.md,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          color: theme.text,
          fontSize: 16,
          minHeight: multiline ? 104 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
      {hint ? <Tertiary>{hint}</Tertiary> : null}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected: Boolean(selected) }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 9,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.pill,
        backgroundColor: selected ? theme.ink : theme.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: selected ? theme.ink : theme.borderStrong,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {icon ? (
        <Ionicons name={icon} size={14} color={selected ? theme.onInk : theme.textSecondary} />
      ) : null}
      <Text
        style={{
          fontSize: 13.5,
          fontWeight: selected ? '600' : '500',
          color: selected ? theme.onInk : theme.textSecondary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* ------------------------------ Data views ------------------------------ */

/**
 * The circular home health score.
 *
 * One number, one word. The arc is deliberately unlabelled — no ticks, no scale, no
 * decimals — because the underlying estimate does not support that kind of
 * precision and dressing it up as instrumentation would be a lie about how much
 * the app knows.
 */
export function ScoreRing({
  score,
  size = 148,
  label,
  color,
  caption,
}: {
  score: number;
  size?: number;
  label: string;
  color: string;
  caption?: string;
}) {
  const theme = useTheme();
  const stroke = size >= 120 ? 11 : 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.surfaceSunken} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference * pct} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text
        style={{
          fontSize: size >= 120 ? 40 : 26,
          fontWeight: '600',
          letterSpacing: -1.2,
          color: theme.text,
        }}
      >
        {Math.round(score)}
      </Text>
      <Text style={{ fontSize: size >= 120 ? 14 : 12, fontWeight: '600', color, marginTop: 2 }}>
        {label}
      </Text>
      {caption ? <Tertiary style={{ marginTop: 2 }}>{caption}</Tertiary> : null}
    </View>
  );
}

/** A labelled horizontal bar. Used for per-system condition and spend breakdowns. */
export function BarRow({
  label,
  value,
  max = 100,
  color,
  trailing,
  onPress,
}: {
  label: string;
  value: number;
  max?: number;
  color: string;
  trailing?: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const pct = Math.max(0, Math.min(1, value / max));
  const content = (
    <View style={{ gap: 6 }}>
      <Row justify="space-between">
        <BodyStrong>{label}</BodyStrong>
        <Row gap={spacing.sm}>
          {trailing ? <Small>{trailing}</Small> : null}
          {onPress ? <Ionicons name="chevron-forward" size={15} color={theme.textTertiary} /> : null}
        </Row>
      </Row>
      <View
        style={{
          height: 7,
          borderRadius: radius.pill,
          backgroundColor: theme.surfaceSunken,
          overflow: 'hidden',
        }}
      >
        <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color, borderRadius: radius.pill }} />
      </View>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {content}
    </Pressable>
  );
}

/** A single figure with a caption. Three across reads as a summary strip. */
export function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ fontSize: 21, fontWeight: '600', letterSpacing: -0.5, color: color ?? theme.text }}>
        {value}
      </Text>
      <Tertiary numberOfLines={2}>{label}</Tertiary>
    </View>
  );
}

/** A left-icon / title-subtitle / chevron row. The workhorse list item. */
export function ListRow({
  icon,
  iconColor,
  iconBg,
  title,
  subtitle,
  trailing,
  status,
  onPress,
  chevron = true,
}: {
  icon?: IconName;
  iconColor?: string;
  iconBg?: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  status?: StatusKey;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const theme = useTheme();
  const content = (
    <Row gap={spacing.md} justify="space-between">
      <Row gap={spacing.md} style={{ flex: 1 }}>
        {icon ? (
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: radius.md,
              backgroundColor: iconBg ?? theme.surfaceSunken,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name={icon} size={18} color={iconColor ?? theme.textSecondary} />
          </View>
        ) : status ? (
          <Dot status={status} />
        ) : null}
        <View style={{ flex: 1, gap: 1 }}>
          <BodyStrong numberOfLines={1}>{title}</BodyStrong>
          {subtitle ? <Small numberOfLines={2}>{subtitle}</Small> : null}
        </View>
      </Row>
      <Row gap={spacing.sm}>
        {trailing}
        {chevron && onPress ? (
          <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
        ) : null}
      </Row>
    </Row>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {content}
    </Pressable>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.md }}>
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: radius.pill,
          backgroundColor: theme.surfaceSunken,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={24} color={theme.textSecondary} />
      </View>
      <Heading style={{ textAlign: 'center' }}>{title}</Heading>
      <Small style={{ textAlign: 'center', maxWidth: 320 }}>{body}</Small>
      {action}
    </Card>
  );
}

export function KeyValue({
  label,
  value,
  provenance,
}: {
  label: string;
  value: string;
  provenance?: string;
}) {
  return (
    <Row justify="space-between" align="flex-start" gap={spacing.lg}>
      <Small style={{ flex: 1 }}>{label}</Small>
      <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
        <BodyStrong style={{ textAlign: 'right' }}>{value}</BodyStrong>
        {provenance ? <ProvenanceTag provenance={provenance} /> : null}
      </View>
    </Row>
  );
}

export function Notice({
  tone = 'info',
  icon,
  children,
}: {
  tone?: StatusKey;
  icon?: IconName;
  children: ReactNode;
}) {
  const theme = useTheme();
  const palette = toneFor(theme, tone);
  const resolved: IconName =
    icon ??
    (tone === 'urgent'
      ? 'alert-circle-outline'
      : tone === 'attention'
        ? 'warning-outline'
        : 'information-circle-outline');
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing.md,
        backgroundColor: palette.bg,
        borderRadius: radius.md,
        padding: spacing.lg,
      }}
    >
      <Ionicons name={resolved} size={17} color={palette.fg} style={{ marginTop: 1 }} />
      <Text style={[type.small, { color: palette.fg, flex: 1 }]}>{children}</Text>
    </View>
  );
}

export function Loading({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl }}>
      <ActivityIndicator color={theme.textSecondary} />
      <Small>{label}</Small>
    </Card>
  );
}

/** Thin progress bar with a percentage caption. Used by the guided home scan. */
export function Progress({ value, max = 100 }: { value: number; max?: number }) {
  const theme = useTheme();
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <View
      style={{ height: 8, borderRadius: radius.pill, backgroundColor: theme.surfaceSunken, overflow: 'hidden' }}
    >
      <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: theme.sage }} />
    </View>
  );
}

/**
 * A large tappable option. The scan hub is four of these rather than a menu —
 * "see something, scan it" only works if the entry points are impossible to miss.
 */
export function BigOption({
  icon,
  title,
  subtitle,
  onPress,
  accent,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  accent?: string;
}) {
  const theme = useTheme();
  const color = accent ?? theme.text;
  return (
    <Card onPress={onPress} padding={spacing.xl}>
      <Row gap={spacing.lg}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: radius.md,
            backgroundColor: theme.surfaceSunken,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={23} color={color} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Subheading>{title}</Subheading>
          <Small>{subtitle}</Small>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
      </Row>
    </Card>
  );
}

/**
 * The contextual AI entry point.
 *
 * Deliberately a quiet single line rather than a chat surface. The assistant is
 * useful where a question naturally arises — on the equipment page, on the
 * dashboard — and a persistent chat panel would both crowd those screens and make
 * the product look like a chatbot with a home record bolted on.
 */
export function AskRow({
  prompt,
  onPress,
  title = 'Ask your home',
}: {
  prompt: string;
  onPress: () => void;
  title?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          backgroundColor: theme.blueSoft,
          borderRadius: radius.lg,
          padding: spacing.lg,
        }}
      >
        <Ionicons name="sparkles-outline" size={18} color={theme.blue} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.smallStrong, { color: theme.blue }]}>{title}</Text>
          <Text style={[type.small, { color: theme.blue, opacity: 0.85 }]} numberOfLines={1}>
            “{prompt}”
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.blue} />
      </View>
    </Pressable>
  );
}

/** Sticky action docked to the bottom of a screen. */
export function StickyBar({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: spacing.lg,
        paddingBottom: spacing.xxl,
        backgroundColor: theme.bg,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.border,
      }}
    >
      {children}
    </View>
  );
}
