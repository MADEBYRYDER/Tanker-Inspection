import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * How much of the bottom of the screen the on-screen keyboard is covering.
 *
 * `KeyboardAvoidingView` is inert on web — react-native-web ships its
 * `onKeyboardChange` as an empty method body, so it renders a plain View and
 * never moves. On a phone browser that leaves the composer underneath the
 * keyboard: you tap the field to type and the field disappears.
 *
 * The browser does report this, just not through anything React Native reads.
 * `visualViewport` is the part of the page actually visible after the keyboard
 * and any browser chrome take their share, so what is covered at the bottom is
 * the layout viewport minus the visual one, minus however far the visual
 * viewport has been pushed down.
 *
 * That subtraction is what makes this work on both engines rather than one.
 * iOS Safari leaves the layout viewport at full height and shrinks only the
 * visual one, giving a real inset here. Android browsers that resize the layout
 * viewport instead have already made room, and the same arithmetic yields zero —
 * which is correct, and is why this is not an `if iOS` branch.
 *
 * Returns 0 on native, where `KeyboardAvoidingView` does its job and adding to
 * it would double the offset.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const viewport = globalThis.visualViewport;
    if (!viewport) return;

    let frame = 0;
    const measure = () => {
      // The keyboard animates open, firing a burst of events; one measurement
      // per frame is enough and keeps this off the input's critical path.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const covered =
          document.documentElement.clientHeight - (viewport.height + viewport.offsetTop);
        const next = Math.max(0, Math.round(covered));
        // Subpixel viewport jitter would otherwise re-render on every scroll
        // event while the keyboard is open.
        setInset((current) => (Math.abs(next - current) > 1 ? next : current));
      });
    };

    measure();
    viewport.addEventListener('resize', measure);
    // iOS reports the keyboard by scrolling the visual viewport, not only by
    // resizing it, so both events are needed to see the whole gesture.
    viewport.addEventListener('scroll', measure);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', measure);
      viewport.removeEventListener('scroll', measure);
    };
  }, []);

  return inset;
}
