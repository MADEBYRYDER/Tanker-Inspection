import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import {
  AuthError,
  isAccountsServerConfigured,
  requestCode,
  verifyCode,
} from '../../src/auth/client';
import { newId } from '../../src/state/ids';
import { useStore } from '../../src/state/store';
import {
  Body,
  Button,
  Field,
  Notice,
  Row,
  Screen,
  Small,
  Tertiary,
  Title,
  Touchable,
} from '../../src/ui/components';
import { fonts, radius, spacing, tabular, type, useTheme } from '../../src/ui/theme';

const CODE_LENGTH = 6;

/**
 * Email sign-in, without a password.
 *
 * Two steps and no more: the address, then the code. Nothing else is collected
 * here — a display name would be one more field between somebody and the thing
 * they downloaded the app for, and the app can ask for it later, once, from
 * someone who has a reason to answer.
 *
 * When no accounts server is configured the code step does not appear at all.
 * Showing a code field and accepting anything, or generating a code the app
 * itself invented and calling it "sent", would teach people that the code means
 * nothing. The screen says the account is being kept on the device and moves on.
 */
export default function EmailSignIn() {
  const theme = useTheme();
  const router = useRouter();
  const signIn = useStore((s) => s.signIn);

  const hasServer = isAccountsServerConfigured();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [hint, setHint] = useState<string | undefined>();
  const codeInput = useRef<TextInput>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const land = (displayName: string, accountId: string, address: string) => {
    signIn({
      id: accountId,
      displayName,
      email: address,
      createdAt: new Date().toISOString(),
    });
    router.replace('/setup/address');
  };

  const submitEmail = async () => {
    if (!emailValid || busy) return;
    setError(undefined);
    const address = email.trim().toLowerCase();
    /*
     * The part before the @ is a better first guess at a name than "You", and
     * it is one the owner can change without ever having been asked for it.
     * Capitalised, because "Good morning, ryder" reads as a database field and
     * the greeting is the first sentence the app ever says to somebody.
     */
    const guessedName = address
      .split('@')[0]!
      .replace(/[._-]+/g, ' ')
      .trim()
      .replace(/\b\p{Ll}/gu, (c) => c.toUpperCase());

    if (!hasServer) {
      land(guessedName || 'You', newId('acct'), address);
      return;
    }

    setBusy(true);
    try {
      const result = await requestCode(address);
      setHint(result.code ? `Development build — your code is ${result.code}.` : result.detail);
      setStep('code');
      setTimeout(() => codeInput.current?.focus(), 250);
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Could not send a code.');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (code.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const session = await verifyCode(code);
      land(session.account.displayName, session.account.id, session.account.email ?? email.trim());
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'That code did not work.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  if (step === 'code') {
    return (
      <Screen gap={spacing.lg}>
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          <Title>Check your email</Title>
          <Body>
            We sent a {CODE_LENGTH}-digit code to{' '}
            <Text style={{ fontFamily: fonts.sans[600] }}>{email.trim()}</Text>.
          </Body>
        </View>

        {/*
          One field, not six boxes. Six boxes look precise and then fight the
          keyboard, autofill and paste on every platform; a single field takes a
          pasted code from the notification and is read out sensibly.
        */}
        <TextInput
          ref={codeInput}
          value={code}
          onChangeText={(next) => setCode(next.replace(/\D/g, '').slice(0, CODE_LENGTH))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          autoFocus
          accessibilityLabel="Verification code"
          placeholder="000000"
          placeholderTextColor={theme.textTertiary}
          style={[
            {
              backgroundColor: theme.surfaceSunken,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: error ? theme.red : theme.border,
              paddingVertical: spacing.lg,
              textAlign: 'center',
              fontSize: 30,
              letterSpacing: 10,
              color: theme.text,
              fontFamily: fonts.sans[700],
            },
            tabular,
          ]}
        />

        {error ? <Notice tone="attention" icon="alert-circle-outline">{error}</Notice> : null}
        {hint ? <Tertiary>{hint}</Tertiary> : null}

        <Button
          label="Continue"
          onPress={() => void submitCode()}
          disabled={code.length !== CODE_LENGTH}
          loading={busy}
          full
        />

        <Row justify="center" gap={5}>
          <Small>Did not arrive?</Small>
          <Touchable onPress={() => void submitEmail()} scaleTo={0.98}>
            <Text style={[type.smallStrong, { color: theme.blue }]}>Send another</Text>
          </Touchable>
        </Row>

        <Button
          label="Use a different email"
          variant="ghost"
          onPress={() => {
            setStep('email');
            setCode('');
            setError(undefined);
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen gap={spacing.lg}>
      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        <Title>What's your email?</Title>
        <Small>
          {hasServer
            ? 'We will send a code. No password to choose, and none to forget in three years.'
            : 'Used to name your account on this device.'}
        </Small>
      </View>

      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />

      {error ? <Notice tone="attention" icon="alert-circle-outline">{error}</Notice> : null}

      {!hasServer ? (
        <Notice icon="phone-portrait-outline">
          No accounts server is configured on this build, so your account is created on this device
          and no code is sent. Everything else works exactly the same — the record, the scan, the
          schedule are all local anyway.
        </Notice>
      ) : null}

      <Button
        label="Continue"
        onPress={() => void submitEmail()}
        disabled={!emailValid}
        loading={busy}
        full
      />
    </Screen>
  );
}
