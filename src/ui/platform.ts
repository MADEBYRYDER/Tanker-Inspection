import { Linking, Platform, Share } from 'react-native';

/**
 * Handing something off to the platform, and knowing whether it worked.
 *
 * React Native's web shims are optimistic in a way that hides failure. `Alert`
 * is an empty method body. `Linking.openURL` resolves whether or not anything
 * opened: `window.open` returns null when the popup is blocked and the return
 * value is discarded, and `window.location = 'tel:…'` on a desktop browser with
 * no handler neither throws nor navigates. `Share.share` at least rejects, but
 * only on browsers without `navigator.share`, which is most of them.
 *
 * So every function here reports what actually happened rather than that it was
 * attempted. A screen can then tell the truth — or better, offer the fallback
 * that does work — instead of showing a control that quietly goes nowhere.
 */

const isWeb = Platform.OS === 'web';

/** How a piece of text left the app, or that it did not. */
export type ShareOutcome =
  | { ok: true; via: 'share' | 'clipboard' }
  | { ok: false; reason: 'unsupported' };

/**
 * Shares text, falling back to the clipboard.
 *
 * The share sheet is the better experience where it exists, but it does not
 * exist on desktop browsers and is blocked inside an iframe. The clipboard is
 * available in both, so the record can always be got out of the app — which
 * matters more here than which mechanism did it, because a home record whose
 * only purpose is being handed to a buyer is worthless if it cannot leave.
 */
export async function shareText(options: {
  title: string;
  message: string;
}): Promise<ShareOutcome> {
  try {
    await Share.share({ message: options.message, title: options.title });
    return { ok: true, via: 'share' };
  } catch {
    // Falls through to the clipboard. A user who dismissed the share sheet
    // lands here too, which copies unasked — acceptable next to the opposite
    // mistake of a dead button, and only reachable on platforms where the
    // sheet is absent, since a dismissed sheet resolves rather than rejects.
  }

  const clipboard = globalThis.navigator?.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(options.message);
      return { ok: true, via: 'clipboard' };
    } catch {
      // Denied permission, or a document without focus.
    }
  }

  return { ok: false, reason: 'unsupported' };
}

/**
 * Opens an external URL, and says whether a window actually opened.
 *
 * Uses `Linking` on native. On web it calls `window.open` directly, because the
 * whole point is the return value that `Linking.openURL` throws away: a null
 * means the popup blocker or an iframe sandbox stopped it, and the caller needs
 * to know that rather than be told the link opened.
 */
export async function openExternal(url: string): Promise<boolean> {
  if (!isWeb) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      return false;
    }
  }

  try {
    const opened = globalThis.window?.open(url, '_blank', 'noopener');
    return opened != null;
  } catch {
    return false;
  }
}

/**
 * Whether this platform can be relied on to place a call.
 *
 * Native always can. On the web only a touch device is a safe bet: desktop
 * browsers accept a `tel:` navigation silently and do nothing with it, so a
 * button that claims to dial is a lie there. `pointer: coarse` is the same
 * signal Expo's own haptics shim uses to decide it is on a phone.
 */
export function canPlaceCalls(): boolean {
  if (!isWeb) return true;
  try {
    return globalThis.matchMedia?.('(pointer: coarse)').matches === true;
  } catch {
    return false;
  }
}

/**
 * Attempts to dial. Returns false when nothing can be relied on to happen, so
 * the caller can show the number instead of swallowing the failure.
 *
 * Nothing here retries or reassures: on the emergency path the useful fallback
 * is the digits themselves, in front of the person, not another dialog.
 */
export async function callNumber(number: string): Promise<boolean> {
  if (!canPlaceCalls()) return false;
  try {
    await Linking.openURL(`tel:${number}`);
    return true;
  } catch {
    return false;
  }
}
