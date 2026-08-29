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
import { radius, spacing, type, useTheme, type Theme } from './theme';

/* ------------------------------- Layout -------------------------------- */

export function Screen({
  children,
  scroll = true,
  padded = true,
  edges = ['top'],
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}) {
  const theme = useTheme();
  const inner = (
    <View style={{ padding: padded ? spacing.lg : 0, paddingBottom: spacing.xxl * 2, gap: spacing.lg }}>
      {children}
    </View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={edges}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
        >
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
  tone,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const body = (
    <View
      style={[
        {
          backgroundColor: tone ?? theme.surface,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
          padding: spacing.lg,
          gap: spacing.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  );
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

export const Display = makeText(type.display);
export const Title = makeText(type.title);
export const Heading = makeText(type.heading);
export const Body = makeText(type.body);
export const BodyStrong = makeText(type.bodyStrong);
export const Muted = makeText(type.small, 'textMuted');
export const Faint = makeText(type.small, 'textFaint');

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <Row justify="space-between" style={{ marginTop: spacing.sm }}>
      <Heading>{title}</Heading>
      {action}
    </Row>
  );
}

/* ------------------------------- Controls ------------------------------- */

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  full,
  tone,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  tone?: string;
}) {
  const theme = useTheme();
  const palette = {
    primary: { bg: tone ?? theme.accent, fg: theme.onAccent, border: 'transparent' },
    secondary: { bg: theme.surface, fg: theme.text, border: theme.border },
    ghost: { bg: 'transparent', fg: tone ?? theme.accent, border: 'transparent' },
    danger: { bg: theme.dangerSoft, fg: theme.danger, border: 'transparent' },
  }[variant];

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
        borderRadius: radius.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        opacity: inactive ? 0.45 : pressed ? 0.8 : 1,
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
        <Ionicons name={icon} size={17} color={palette.fg} />
      ) : null}
      <Text style={[type.bodyStrong, { color: palette.fg }]}>{label}</Text>
    </Pressable>
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
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.smallStrong, { color: theme.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textFaint}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        style={{
          backgroundColor: theme.surfaceAlt,
          borderRadius: radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          color: theme.text,
          fontSize: 15,
          minHeight: multiline ? 96 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
      {hint ? <Faint>{hint}</Faint> : null}
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
  icon?: keyof typeof Ionicons.glyphMap;
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
        gap: spacing.xs,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        backgroundColor: selected ? theme.accentSoft : theme.surfaceAlt,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: selected ? theme.accent : theme.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {icon ? <Ionicons name={icon} size={14} color={selected ? theme.accent : theme.textMuted} /> : null}
      <Text style={[type.small, { color: selected ? theme.accent : theme.textMuted, fontWeight: selected ? '600' : '400' }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Badge({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: radius.sm,
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
      }}
    >
      <Text style={[type.micro, { color: fg, textTransform: 'uppercase' }]}>{label}</Text>
    </View>
  );
}

/**
 * The documented-vs-estimated marker.
 *
 * This appears everywhere a number derived from a lifespan table sits next to one
 * read off a nameplate. Keeping it as one component means the distinction is made
 * the same way on every screen — which is the difference between a record people
 * trust and one they learn to second-guess.
 */
export function ProvenanceTag({ provenance }: { provenance: string }) {
  const theme = useTheme();
  const documented = provenance === 'documented' || provenance === 'contractor';
  return (
    <Badge
      label={documented ? 'documented' : provenance === 'unknown' ? 'unknown' : 'estimated'}
      fg={documented ? theme.success : theme.textMuted}
      bg={documented ? theme.successSoft : theme.surfaceAlt}
    />
  );
}

export function Divider() {
  const theme = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border }} />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Card style={{ alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.md }}>
      <Ionicons name={icon} size={34} color={theme.textFaint} />
      <Heading style={{ textAlign: 'center' }}>{title}</Heading>
      <Muted style={{ textAlign: 'center' }}>{body}</Muted>
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
    <Row justify="space-between" align="flex-start" gap={spacing.md}>
      <Muted style={{ flex: 1 }}>{label}</Muted>
      <Row gap={spacing.xs} style={{ flexShrink: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <BodyStrong style={{ textAlign: 'right' }}>{value}</BodyStrong>
        {provenance ? <ProvenanceTag provenance={provenance} /> : null}
      </Row>
    </Row>
  );
}

/** Horizontal 0–100 meter used for the health score and per-component condition. */
export function Meter({ value, color }: { value: number; color: string }) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      style={{ height: 8, borderRadius: radius.pill, backgroundColor: theme.surfaceAlt, overflow: 'hidden' }}
    >
      <View style={{ width: `${clamped}%`, height: '100%', backgroundColor: color, borderRadius: radius.pill }} />
    </View>
  );
}

export function Notice({
  tone = 'info',
  icon = 'information-circle-outline',
  children,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  icon?: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
}) {
  const theme = useTheme();
  const palette = {
    info: { fg: theme.info, bg: theme.infoSoft },
    warning: { fg: theme.warning, bg: theme.warningSoft },
    danger: { fg: theme.danger, bg: theme.dangerSoft },
    success: { fg: theme.success, bg: theme.successSoft },
  }[tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing.sm,
        backgroundColor: palette.bg,
        borderRadius: radius.md,
        padding: spacing.md,
      }}
    >
      <Ionicons name={icon} size={17} color={palette.fg} style={{ marginTop: 1 }} />
      <Text style={[type.small, { color: palette.fg, flex: 1, lineHeight: 19 }]}>{children}</Text>
    </View>
  );
}

export function Loading({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
      <ActivityIndicator color={theme.accent} />
      <Muted>{label}</Muted>
    </Card>
  );
}
