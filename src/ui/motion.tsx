import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { motion } from './theme';

/**
 * Motion primitives.
 *
 * Built on React Native's own `Animated` rather than Reanimated. Everything here
 * is a fade, a small translate, a scale, or a value interpolation — none of it
 * needs the UI thread, and staying on the built-in driver keeps the web build
 * working, which is the only way this app can be visually verified in CI.
 *
 * The rule for all of it: motion clarifies where something came from or confirms a
 * touch landed. Nothing animates to be impressive.
 */

/** Fade-and-rise, optionally staggered by index. Used for list and section entry. */
export function Enter({
  children,
  index = 0,
  distance = 14,
  style,
}: {
  children: ReactNode;
  index?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: motion.base,
      delay: Math.min(index, 8) * motion.stagger,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, index]);

  return (
    <Animated.View
      style={[
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * A pressable that scales and dims under the finger, with a haptic tick.
 *
 * Every tappable surface in the app goes through this. The feedback is what makes
 * a touch feel like it landed on a physical object rather than on a web page.
 */
export function Touchable({
  children,
  onPress,
  style,
  scaleTo = 0.978,
  haptic = 'light',
  disabled,
  accessibilityLabel,
  accessibilityRole = 'button',
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptic?: 'light' | 'medium' | 'none';
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link';
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const to = (value: number, duration: number) =>
    Animated.timing(scale, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  if (!onPress || disabled) {
    return <View style={style}>{children}</View>;
  }

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      onPressIn={() => {
        to(scaleTo, 110);
        if (haptic !== 'none' && Platform.OS !== 'web') {
          void Haptics.impactAsync(
            haptic === 'medium'
              ? Haptics.ImpactFeedbackStyle.Medium
              : Haptics.ImpactFeedbackStyle.Light,
          );
        }
      }}
      onPressOut={() => to(1, 220)}
      onPress={onPress}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>{children}</Animated.View>
    </Pressable>
  );
}

/**
 * Counts a number up on mount.
 *
 * Only worth it for the figures a person actually stops to read — the health score,
 * a monthly reserve. Animating every number on screen would be noise.
 */
export function useCountUp(target: number, duration: number = motion.slow): number {
  const [value, setValue] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    const id = progress.addListener(({ value: v }) => setValue(v * target));
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      // Listening to the value requires the JS driver.
      useNativeDriver: false,
    });
    animation.start();
    return () => {
      animation.stop();
      progress.removeListener(id);
    };
  }, [target, duration, progress]);

  return value;
}

/** Drives a 0→1 value on mount, for arcs and bars that fill in. */
export function useReveal(duration: number = motion.slow, delay: number = 0): Animated.Value {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, duration, delay]);
  return progress;
}
