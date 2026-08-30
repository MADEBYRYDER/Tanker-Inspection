import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Touchable } from './motion';
import { elevation, radius, spacing, type, useTheme } from './theme';

/**
 * Confirmations and alerts that actually appear.
 *
 * React Native's `Alert.alert` is a no-op on web — react-native-web ships it as
 * a class with an empty method body. Every confirmation in this app was
 * therefore silently doing nothing in a browser: cancelling a plan, removing
 * somebody from a household, transferring a property. The action never ran and
 * no dialog appeared, which reads as a dead button.
 *
 * So confirmation is a component rather than a platform call. It renders in
 * Dwella's own type and colour on every platform, it is testable in the browser
 * the same way the rest of the app is, and a destructive action can be styled as
 * destructive rather than relying on iOS to do it.
 *
 * The API is promise-based on purpose: `if (await confirm(...))` reads in the
 * order the decision happens, where a callback splits one thought across two
 * places.
 */

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Defaults to "Continue". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm action in red and puts it second. */
  destructive?: boolean;
}

interface DialogApi {
  /** Resolves true when confirmed, false when dismissed. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** A message with a single acknowledgement. Resolves when dismissed. */
  alert: (title: string, message?: string) => Promise<void>;
}

const DialogContext = createContext<DialogApi | undefined>(undefined);

interface PendingDialog extends ConfirmOptions {
  kind: 'confirm' | 'alert';
}

/**
 * A handle for code that is not a component.
 *
 * Photo capture reports a denied permission from a plain async function, which
 * has no hooks. Rather than thread a callback through every call site, the
 * provider registers itself here on mount. Nothing else should reach for this —
 * inside a component `useDialog()` is the honest dependency.
 */
let mounted: DialogApi | undefined;

/** Shows a message from outside the component tree. No-ops if nothing is mounted. */
export function notify(title: string, message?: string): void {
  void mounted?.alert(title, message);
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const [pending, setPending] = useState<PendingDialog | undefined>();
  const resolver = useRef<((value: boolean) => void) | undefined>(undefined);

  const settle = useCallback((value: boolean) => {
    setPending(undefined);
    resolver.current?.(value);
    resolver.current = undefined;
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      confirm: (options) =>
        new Promise<boolean>((resolve) => {
          resolver.current = resolve;
          setPending({ ...options, kind: 'confirm' });
        }),
      alert: (title, message) =>
        new Promise<void>((resolve) => {
          resolver.current = () => resolve();
          setPending({ title, message, kind: 'alert' });
        }),
    }),
    [],
  );

  useEffect(() => {
    mounted = api;
    return () => {
      if (mounted === api) mounted = undefined;
    };
  }, [api]);

  const confirmLabel = pending?.confirmLabel ?? (pending?.destructive ? 'Delete' : 'Continue');

  return (
    <DialogContext.Provider value={api}>
      {children}
      <Modal
        visible={pending !== undefined}
        transparent
        animationType="fade"
        /* Android's hardware back must dismiss rather than leave a stuck sheet. */
        onRequestClose={() => settle(false)}
      >
        <Pressable
          // Tapping the scrim dismisses, which for a confirm means "no".
          onPress={() => settle(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(10,14,12,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing.xl,
          }}
        >
          {/* Swallow taps inside the card so it does not dismiss itself. */}
          <Pressable
            onPress={() => {}}
            style={[
              {
                width: '100%',
                maxWidth: 380,
                backgroundColor: theme.surface,
                borderRadius: radius.lg,
                padding: spacing.xl,
                gap: spacing.md,
              },
              elevation(theme, 3),
            ]}
          >
            <Text style={[type.subheading, { color: theme.text }]}>{pending?.title}</Text>
            {pending?.message ? (
              <Text style={[type.small, { color: theme.textSecondary }]}>{pending.message}</Text>
            ) : null}

            <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
              {pending?.kind === 'confirm' ? (
                <>
                  <DialogButton
                    label={confirmLabel}
                    onPress={() => settle(true)}
                    tone={pending.destructive ? 'destructive' : 'primary'}
                  />
                  <DialogButton
                    label={pending.cancelLabel ?? 'Cancel'}
                    onPress={() => settle(false)}
                    tone="quiet"
                  />
                </>
              ) : (
                <DialogButton label="OK" onPress={() => settle(true)} tone="primary" />
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </DialogContext.Provider>
  );
}

function DialogButton({
  label,
  onPress,
  tone,
}: {
  label: string;
  onPress: () => void;
  tone: 'primary' | 'destructive' | 'quiet';
}) {
  const theme = useTheme();
  const palette =
    tone === 'destructive'
      ? { bg: theme.red, fg: '#FFFFFF' }
      : tone === 'primary'
        ? { bg: theme.ink, fg: theme.onInk }
        : { bg: 'transparent', fg: theme.textSecondary };

  return (
    <Touchable
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        backgroundColor: palette.bg,
        borderRadius: radius.md,
        paddingVertical: 13,
        alignItems: 'center',
      }}
    >
      <Text style={{ color: palette.fg, fontSize: 15, fontWeight: '700' }}>{label}</Text>
    </Touchable>
  );
}

/**
 * The dialog API.
 *
 * Falls back to resolving `false` when no provider is mounted, so a screen
 * rendered outside the app shell degrades to "did not confirm" rather than
 * throwing — refusing a destructive action is the safe direction to fail.
 */
export function useDialog(): DialogApi {
  const context = useContext(DialogContext);
  return (
    context ?? {
      confirm: async () => false,
      alert: async () => {},
    }
  );
}
