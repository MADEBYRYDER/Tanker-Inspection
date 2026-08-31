import { Feather, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { Enter, Touchable, useCountUp, useReveal } from './motion';
import { fonts,
  elevation,
  heroGradient,
  radius,
  ringGradient,
  spacing,
  tabular,
  toneFor,
  type,
  useTheme,
  type StatusKey,
  type Theme,
} from './theme';

type IconName = keyof typeof Ionicons.glyphMap;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/* ------------------------------- Layout -------------------------------- */

export function Screen({
  children,
  scroll = true,
  padded = true,
  edges = ['top'],
  gap = spacing.xl,
  bleedTop = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  gap?: number;
  /** Let a hero header run to the very top of the screen. */
  bleedTop?: boolean;
}) {
  const theme = useTheme();
  const inner = (
    <View
      style={{
        paddingHorizontal: padded ? spacing.lg : 0,
        paddingTop: bleedTop ? 0 : padded ? spacing.lg : 0,
        // Clears the tab bar and its elevated centre button.
        paddingBottom: spacing.xxxl * 2.6,
        gap,
      }}
    >
      {children}
    </View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={bleedTop ? [] : edges}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
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
  onPress,
  padding = spacing.xl,
  tone,
  raised = 1,
  bordered = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padding?: number;
  tone?: string;
  raised?: 0 | 1 | 2 | 3;
  bordered?: boolean;
}) {
  const theme = useTheme();
  return (
    <Touchable
      onPress={onPress}
      style={[
        {
          backgroundColor: tone ?? theme.surface,
          borderRadius: radius.lg,
          borderWidth: bordered ? StyleSheet.hairlineWidth : 0,
          borderColor: theme.hairline,
          padding,
          gap: spacing.md,
          overflow: 'hidden',
        },
        elevation(theme, raised),
        style,
      ]}
    >
      {children}
    </Touchable>
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

export function Divider({ inset = 0 }: { inset?: number }) {
  const theme = useTheme();
  return (
    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: inset }} />
  );
}

export { Enter, Touchable };

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

export const Mega = makeText(type.mega);
export const Hero = makeText(type.hero);
export const Display = makeText(type.display);
export const Title = makeText(type.title);
export const Heading = makeText(type.heading);
export const Subheading = makeText(type.subheading);
export const Body = makeText(type.body);
export const BodyStrong = makeText(type.bodyStrong);
export const Small = makeText(type.small, 'textSecondary');
export const Tertiary = makeText(type.small, 'textTertiary');

export function Label({ children, color }: { children: ReactNode; color?: string }) {
  const theme = useTheme();
  return (
    <Text style={[type.label, { color: color ?? theme.textTertiary, textTransform: 'uppercase' }]}>
      {children}
    </Text>
  );
}

/**
 * A section heading.
 *
 * Set as a small letterspaced cap line rather than a large serif heading. The
 * serif is reserved for things that title a *screen* — a run of big serif
 * headings down a scrolling page competes with the content under each one, and
 * the reader ends up navigating headings instead of reading rows. A cap line
 * labels without shouting.
 */
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
    <Row justify="space-between" style={{ marginBottom: -spacing.xs }}>
      <Text style={[type.label, { color: theme.textTertiary, flex: 1 }]} numberOfLines={1}>
        {title.toUpperCase()}
      </Text>
      {action ? (
        <Touchable onPress={onAction} haptic="none" scaleTo={0.94}>
          <Row gap={2}>
            <Text style={[type.smallStrong, { color: theme.blue }]}>{action}</Text>
            <Ionicons name="chevron-forward" size={13} color={theme.blue} />
          </Row>
        </Touchable>
      ) : null}
    </Row>
  );
}

/* ------------------------------- Status -------------------------------- */

export function Dot({ status, size = 9 }: { status: StatusKey; size?: number }) {
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
  solid = false,
}: {
  status: StatusKey;
  label: string;
  icon?: IconName;
  solid?: boolean;
}) {
  const theme = useTheme();
  const tone = toneFor(theme, status, label);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: solid ? tone.fg : tone.bg,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        alignSelf: 'flex-start',
      }}
    >
      {icon ? (
        <Ionicons name={icon} size={12} color={solid ? theme.surface : tone.fg} />
      ) : (
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: solid ? theme.surface : tone.fg,
          }}
        />
      )}
      <Text
        style={{
          fontSize: 12.5,
          fontFamily: fonts.sans[600],
          letterSpacing: -0.1,
          color: solid ? theme.surface : tone.fg,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/** An icon in a tinted, softly gradiented container. The app's signature detail. */
export function IconTile({
  icon,
  status = 'neutral',
  size = 44,
  family = 'ionicons',
}: {
  icon: IconName;
  status?: StatusKey;
  size?: number;
  /** Category icons come from Feather; the rest of the app's glyphs are Ionicons. */
  family?: 'ionicons' | 'feather';
}) {
  const theme = useTheme();
  const tone = toneFor(theme, status);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tone.bg,
      }}
    >
      <LinearGradient
        colors={[tone.bg, theme.dark ? theme.surfaceSunken : '#FFFFFF']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {family === 'feather' ? (
        <Feather name={icon as never} size={size * 0.45} color={tone.fg} />
      ) : (
        <Ionicons name={icon} size={size * 0.45} color={tone.fg} />
      )}
    </View>
  );
}

/**
 * A picture of the building, wherever a property is named.
 *
 * Falls back to the property-type tile rather than to a grey rectangle with a
 * camera on it. Most homes will not have a photo for a long time — asking for
 * one is not part of setup, deliberately — and a list of empty placeholders
 * reads as a list of things you have failed to do. The tile is a finished state
 * that happens to become a photograph if you give it one.
 */
export function HomePhoto({
  photoUri,
  icon,
  status = 'neutral',
  size = 44,
}: {
  photoUri?: string;
  /** The property-type glyph, shown when there is no photograph. */
  icon: IconName;
  status?: StatusKey;
  size?: number;
}) {
  const theme = useTheme();
  if (!photoUri) return <IconTile icon={icon} status={status} size={size} />;
  return (
    <Image
      source={{ uri: photoUri }}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        // A hairline keeps a photograph that runs pale at the edges from
        // bleeding into the card behind it.
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.border,
        backgroundColor: theme.surfaceSunken,
      }}
      contentFit="cover"
      transition={160}
      accessibilityLabel="Photo of this home"
    />
  );
}

/** The documented-vs-estimated marker. Quiet, but present wherever it matters. */
export function ProvenanceTag({ provenance }: { provenance: string }) {
  const theme = useTheme();
  const documented = provenance === 'documented' || provenance === 'contractor';
  return (
    <Text style={[type.small, { color: theme.textTertiary, fontSize: 12 }]}>
      {documented ? 'on record' : provenance === 'unknown' ? 'unknown' : 'estimated'}
    </Text>
  );
}

export function Badge({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 }}>
      <Text style={[type.label, { color: fg, fontSize: 11 }]}>{label}</Text>
    </View>
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
    secondary: { bg: theme.surface, fg: theme.text, border: theme.border },
    quiet: { bg: theme.surfaceSunken, fg: theme.text, border: 'transparent' },
    ghost: { bg: 'transparent', fg: tone ?? theme.blue, border: 'transparent' },
    danger: { bg: theme.redSoft, fg: theme.red, border: 'transparent' },
  }[variant];

  const metrics = {
    sm: { py: 9, px: spacing.lg, font: 13.5, icon: 15 },
    md: { py: 14, px: spacing.xl, font: 15, icon: 17 },
    lg: { py: 17, px: spacing.xl, font: 16.5, icon: 19 },
  }[size];

  const inactive = disabled || loading;

  return (
    <Touchable
      onPress={inactive ? undefined : onPress}
      scaleTo={0.965}
      haptic={variant === 'primary' ? 'medium' : 'light'}
      style={[
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: variant === 'secondary' ? StyleSheet.hairlineWidth : 0,
          borderRadius: radius.pill,
          paddingVertical: metrics.py,
          paddingHorizontal: metrics.px,
          opacity: inactive ? 0.38 : 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          alignSelf: full ? 'stretch' : 'flex-start',
          flex: full ? 1 : undefined,
        },
        variant === 'primary' && !inactive ? elevation(theme, 1) : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : icon ? (
        <Ionicons name={icon} size={metrics.icon} color={palette.fg} />
      ) : null}
      <Text style={{ color: palette.fg, fontSize: metrics.font, fontFamily: fonts.sans[600], letterSpacing: -0.2 }}>
        {label}
      </Text>
      {iconRight ? <Ionicons name={iconRight} size={metrics.icon} color={palette.fg} /> : null}
    </Touchable>
  );
}

/** The DIY / Hire pair — every task offers both ways out of it. */
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
  keyboardType?: 'default' | 'numeric' | 'decimal-pad' | 'phone-pad' | 'email-address';
  multiline?: boolean;
  hint?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 7 }}>
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
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.hairline,
          paddingHorizontal: spacing.lg,
          paddingVertical: 14,
          color: theme.text,
          fontSize: 16,
          minHeight: multiline ? 110 : undefined,
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
    <Touchable onPress={onPress} scaleTo={0.94} accessibilityLabel={label}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 10,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.pill,
          backgroundColor: selected ? theme.ink : theme.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: selected ? theme.ink : theme.border,
        }}
      >
        {icon ? (
          <Ionicons name={icon} size={14} color={selected ? theme.onInk : theme.textSecondary} />
        ) : null}
        <Text
          style={{
            fontSize: 13.5,
            fontFamily: fonts.sans[600],
            letterSpacing: -0.1,
            color: selected ? theme.onInk : theme.textSecondary,
          }}
        >
          {label}
        </Text>
      </View>
    </Touchable>
  );
}

/* ------------------------------ Data views ------------------------------ */

/**
 * The health score ring.
 *
 * A gradient stroke that sweeps and fills on mount, with the number counting up
 * behind it. One number, one word, no ticks and no decimals — the arc gives the
 * figure weight without implying an instrument-grade measurement the underlying
 * lifespan tables cannot support.
 */
export function ScoreRing({
  score,
  size = 148,
  label,
  status,
  onDark = false,
}: {
  score: number;
  size?: number;
  label: string;
  status: StatusKey;
  onDark?: boolean;
}) {
  const theme = useTheme();
  const [from, to] = ringGradient(theme, status);
  const tone = toneFor(theme, status);
  const stroke = size >= 130 ? 12 : size >= 100 ? 9 : 7;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const target = Math.max(0, Math.min(100, score)) / 100;

  const progress = useReveal();
  const counted = useCountUp(score);

  const numberColor = onDark ? '#FFFFFF' : theme.text;
  const labelColor = onDark ? (theme.dark ? tone.fg : '#FFFFFF') : tone.fg;
  const trackColor = onDark ? 'rgba(255,255,255,0.14)' : theme.surfaceSunken;

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(score) }}
      accessibilityLabel={`Home health ${Math.round(score)} out of 100, ${label}`}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>
          <SvgGradient id={`ring-${status}-${size}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </SvgGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#ring-${status}-${size})`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={progress.interpolate({
            inputRange: [0, 1],
            outputRange: [circumference, circumference * (1 - target)],
          })}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text
        style={[
          {
            fontSize: size >= 130 ? 46 : size >= 100 ? 34 : 24,
            fontFamily: fonts.sans[700],
            letterSpacing: size >= 130 ? -2 : -1.2,
            color: numberColor,
          },
          tabular,
        ]}
      >
        {Math.round(counted)}
      </Text>
      <Text
        style={{
          fontSize: size >= 130 ? 13.5 : 11.5,
          fontFamily: fonts.sans[700],
          letterSpacing: 0.3,
          color: labelColor,
          marginTop: 1,
        }}
      >
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

/** A labelled bar that fills on mount. Per-system condition, spend breakdowns. */
export function BarRow({
  label,
  value,
  max = 100,
  color,
  trailing,
  onPress,
  index = 0,
}: {
  label: string;
  value: number;
  max?: number;
  color: string;
  trailing?: string;
  onPress?: () => void;
  index?: number;
}) {
  const theme = useTheme();
  const progress = useReveal(600, Math.min(index, 8) * 45);
  const pct = Math.max(0, Math.min(1, value / max));

  return (
    <Touchable onPress={onPress} scaleTo={0.99} haptic="light">
      <View style={{ gap: 8 }}>
        <Row justify="space-between" gap={spacing.md}>
          <BodyStrong numberOfLines={1} style={{ flex: 1 }}>
            {label}
          </BodyStrong>
          <Row gap={6}>
            {trailing ? <Small>{trailing}</Small> : null}
            {onPress ? <Ionicons name="chevron-forward" size={14} color={theme.textTertiary} /> : null}
          </Row>
        </Row>
        <View
          style={{
            height: 8,
            borderRadius: radius.pill,
            backgroundColor: theme.surfaceSunken,
            overflow: 'hidden',
          }}
        >
          <Animated.View
            style={{
              width: progress.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', `${pct * 100}%`],
              }),
              height: '100%',
              backgroundColor: color,
              borderRadius: radius.pill,
            }}
          />
        </View>
      </View>
    </Touchable>
  );
}

export function Meter({ value, color, max = 100 }: { value: number; color: string; max?: number }) {
  const theme = useTheme();
  const progress = useReveal(600);
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: theme.surfaceSunken, overflow: 'hidden' }}>
      <Animated.View
        style={{
          width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${pct * 100}%`] }),
          height: '100%',
          backgroundColor: color,
          borderRadius: radius.pill,
        }}
      />
    </View>
  );
}

export function Progress({ value, max = 100 }: { value: number; max?: number }) {
  const theme = useTheme();
  return <Meter value={value} max={max} color={theme.sage} />;
}

/**
 * A bento tile — one big figure, one caption, optional icon and trend.
 *
 * Sized to sit two or three across. A grid of these reads as a dashboard; the same
 * numbers in a list read as a settings screen.
 */
export function Tile({
  value,
  label,
  icon,
  status = 'neutral',
  onPress,
  footnote,
  wide = false,
}: {
  value: string;
  label: string;
  icon?: IconName;
  status?: StatusKey;
  onPress?: () => void;
  footnote?: string;
  wide?: boolean;
}) {
  const theme = useTheme();
  const tone = toneFor(theme, status);
  return (
    <Touchable
      onPress={onPress}
      style={[
        {
          flex: wide ? undefined : 1,
          minWidth: wide ? '100%' : undefined,
          backgroundColor: theme.surface,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.hairline,
          padding: spacing.lg,
          gap: spacing.sm,
        },
        elevation(theme, 1),
      ]}
    >
      {icon ? (
        <Row justify="space-between">
          <IconTile icon={icon} status={status} size={32} />
          {onPress ? <Ionicons name="chevron-forward" size={14} color={theme.textTertiary} /> : null}
        </Row>
      ) : null}
      <View style={{ gap: 1 }}>
        <Text
          style={[
            { fontSize: 24, fontFamily: fonts.sans[700], letterSpacing: -0.9, color: status === 'neutral' ? theme.text : tone.fg },
            tabular,
          ]}
          numberOfLines={1}
        >
          {value}
        </Text>
        <Tertiary numberOfLines={2}>{label}</Tertiary>
      </View>
      {footnote ? <Tertiary numberOfLines={1}>{footnote}</Tertiary> : null}
    </Touchable>
  );
}

/** Three small figures in a row, inside a card. */
export function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text
        style={[
          { fontSize: 21, fontFamily: fonts.sans[700], letterSpacing: -0.6, color: color ?? theme.text },
          tabular,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Tertiary numberOfLines={2}>{label}</Tertiary>
    </View>
  );
}

export function ListRow({
  icon,
  iconStatus,
  title,
  subtitle,
  trailing,
  status,
  onPress,
  chevron = true,
}: {
  icon?: IconName;
  iconStatus?: StatusKey;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  status?: StatusKey;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const theme = useTheme();
  return (
    <Touchable onPress={onPress} scaleTo={0.99}>
      <Row gap={spacing.md} justify="space-between">
        <Row gap={spacing.md} style={{ flex: 1 }}>
          {icon ? (
            <IconTile icon={icon} status={iconStatus ?? 'neutral'} size={38} />
          ) : status ? (
            <Dot status={status} />
          ) : null}
          <View style={{ flex: 1, gap: 2 }}>
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
    </Touchable>
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
  return (
    <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.lg }} raised={1}>
      <IconTile icon={icon} status="neutral" size={58} />
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

/**
 * The dashboard hero.
 *
 * A dark gradient panel running to the top edge, with the score sitting on it. One
 * strong focal moment gives the screen a top; without it a dashboard is just a
 * stack of equally-weighted cards, which is what makes utility apps feel flat.
 */
export function HeroPanel({
  children,
  style,
  bleed = spacing.lg,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Negative inset that cancels the screen's horizontal padding. */
  bleed?: number;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          overflow: 'hidden',
          borderBottomLeftRadius: radius.xxl,
          borderBottomRightRadius: radius.xxl,
          // Runs edge to edge. A hero with a margin around it is just a dark card.
          marginHorizontal: -bleed,
        },
        style,
      ]}
    >
      <LinearGradient
        colors={heroGradient(theme)}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* A soft highlight along the top edge, so the panel reads as a lit surface. */}
      <LinearGradient
        colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 120 }}
      />
      <SafeAreaView edges={['top']}>
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
          {children}
        </View>
      </SafeAreaView>
    </View>
  );
}

/** A large tappable option. The scan hub is four of these rather than a menu. */
export function BigOption({
  icon,
  title,
  subtitle,
  onPress,
  status = 'neutral',
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  status?: StatusKey;
}) {
  const theme = useTheme();
  return (
    <Card onPress={onPress} padding={spacing.lg} raised={1}>
      <Row gap={spacing.lg}>
        <IconTile icon={icon} status={status} size={50} />
        <View style={{ flex: 1, gap: 3 }}>
          <Subheading>{title}</Subheading>
          <Small numberOfLines={2}>{subtitle}</Small>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
      </Row>
    </Card>
  );
}

/**
 * The contextual AI entry point.
 *
 * One quiet row, never a chat surface. The assistant is useful where a question
 * naturally arises; a persistent panel would crowd every screen and make the
 * product look like a chatbot with a home record bolted on.
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
    <Touchable onPress={onPress} scaleTo={0.985}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          backgroundColor: theme.blueSoft,
          borderRadius: radius.lg,
          padding: spacing.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.hairline,
        }}
      >
        <IconTile icon="sparkles-outline" status="info" size={38} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.smallStrong, { color: theme.blue }]}>{title}</Text>
          <Text style={[type.small, { color: theme.blue, opacity: 0.85 }]} numberOfLines={1}>
            “{prompt}”
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.blue} />
      </View>
    </Touchable>
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
        backgroundColor: theme.surface,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.hairline,
        ...elevation(theme, 3),
      }}
    >
      {children}
    </View>
  );
}

/**
 * Underlined segmented tabs.
 *
 * Chips and underlined tabs both switch a filter, but they carry different
 * promises: a chip row reads as optional refinement you can leave alone, an
 * underlined bar reads as "the screen has these modes and you are in one of
 * them". These screens are the second kind — there is no unfiltered state, so
 * the control should not look like one.
 *
 * Scrolls horizontally rather than compressing, because a label truncated to
 * "Inspecti…" costs more than a little sideways movement.
 */
export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.xl }}
      style={{ borderBottomWidth: 1, borderBottomColor: theme.hairline }}
    >
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Touchable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityLabel={option.label}
            scaleTo={0.98}
            style={{
              paddingBottom: 10,
              borderBottomWidth: 2,
              // Transparent rather than absent, so the row does not shift by two
              // pixels as the selection moves.
              borderBottomColor: active ? theme.text : 'transparent',
            }}
          >
            <Text
              style={[
                type.bodyStrong,
                { color: active ? theme.text : theme.textTertiary },
              ]}
            >
              {option.label}
            </Text>
          </Touchable>
        );
      })}
    </ScrollView>
  );
}
