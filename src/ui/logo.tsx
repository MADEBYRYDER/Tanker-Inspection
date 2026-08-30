import { Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { fonts, type, useTheme } from './theme';

/**
 * The Dwella mark.
 *
 * A house whose right wall is missing, closed instead by a sage arc — so the
 * silhouette reads as both a house and a D. Drawn rather than shipped as a
 * bitmap: it appears at 20px in a tab bar and at 96px on the onboarding screen,
 * it has to sit on a dark hero and on paper, and a PNG would either blur at one
 * end or carry the wrong colour at the other.
 *
 * Both colours are props with brand defaults, because the mark is used on the
 * navy hero (where the house has to become paper-coloured) as well as on light
 * ground. Nothing else about it changes between those uses.
 */
export function DwellaMark({
  size = 28,
  house,
  arc,
}: {
  size?: number;
  /** Defaults to brand navy; pass the paper tone when placing it on the hero. */
  house?: string;
  arc?: string;
}) {
  const theme = useTheme();
  const stroke = house ?? theme.brandNavy;
  const bowl = arc ?? theme.brandSage;

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      {/* Chimney, behind the roofline so the slope cuts across it. */}
      <Rect x="45.5" y="12" width="6.6" height="15" rx="2.4" fill={stroke} />
      {/* Roof. */}
      <Path
        d="M6 28.5 L32 7.5 L58 28.5"
        stroke={stroke}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Left wall and floor — the stem and foot of the D. */}
      <Path
        d="M13 25 L13 52.5 L34 52.5"
        stroke={stroke}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* The bowl. Starts under the eaves and lands on the floor line. */}
      <Path
        d="M45.5 27 A 15.5 15.5 0 0 1 34.5 52.5"
        stroke={bowl}
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      {/* Four-pane window. */}
      <Rect x="24.5" y="27.5" width="7.2" height="7.2" rx="1.6" fill={stroke} />
      <Rect x="34.3" y="27.5" width="7.2" height="7.2" rx="1.6" fill={stroke} />
      <Rect x="24.5" y="37.3" width="7.2" height="7.2" rx="1.6" fill={stroke} />
      <Rect x="34.3" y="37.3" width="7.2" height="7.2" rx="1.6" fill={stroke} />
    </Svg>
  );
}

/**
 * Mark plus wordmark.
 *
 * The tagline is optional because it stops being legible below about 15px of
 * cap height, and a tagline nobody can read is just noise under a logo.
 */
export function DwellaLockup({
  size = 'md',
  onDark = false,
  tagline = true,
}: {
  size?: 'sm' | 'md' | 'lg';
  onDark?: boolean;
  tagline?: boolean;
}) {
  const theme = useTheme();
  const scale = size === 'lg' ? 1.5 : size === 'sm' ? 0.78 : 1;
  const wordColor = onDark ? '#FFFFFF' : theme.brandNavy;
  const taglineColor = onDark ? 'rgba(255,255,255,0.62)' : theme.brandSage;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 * scale }}>
      <DwellaMark
        size={34 * scale}
        house={onDark ? '#FFFFFF' : undefined}
        arc={onDark ? theme.brandSageLight : undefined}
      />
      <View style={{ gap: 1 }}>
        <Text
          style={[
            type.title,
            {
              color: wordColor,
              fontSize: 25 * scale,
              lineHeight: 28 * scale,
              letterSpacing: -0.3 * scale,
            },
          ]}
        >
          Dwella
        </Text>
        {tagline ? (
          <Text
            style={{
              color: taglineColor,
              fontSize: 8.6 * scale,
              letterSpacing: 1.5 * scale,
              fontFamily: fonts.sans[600],
            }}
          >
            YOUR HOME, REMEMBERED
          </Text>
        ) : null}
      </View>
    </View>
  );
}
