import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GatewayNotConfiguredError, askAssistant, isGatewayConfigured } from '../src/ai/client';
import { relativeDayLabel, today } from '../src/core/dates';
import { answerFromRecord, buildGroundingContext } from '../src/core/engine/query';
import { generateTasks } from '../src/core/engine/schedule';
import { formatMoney } from '../src/core/money';
import type { ScheduledTask } from '../src/core/types';
import { usePlan } from '../src/state/plan';
import { useHomeRecord, useStore, type AssistantMessage } from '../src/state/store';
import {
  Body,
  BodyStrong,
  Card,
  Chip,
  Divider,
  Heading,
  Row,
  Small,
  Tertiary,
} from '../src/ui/components';
import { useKeyboardInset } from '../src/ui/keyboard';
import { AllowanceRow, AllowanceSpent } from '../src/ui/plus';
import { fonts, radius, spacing, type, useTheme } from '../src/ui/theme';

const STARTERS = [
  'What should I take care of this weekend?',
  'What size HVAC filter do I need?',
  'When was my roof replaced?',
  'How much have I spent this year?',
];

/**
 * Ask Your Home.
 *
 * Reached from a single quiet row on the dashboard and from each asset page, never
 * from the tab bar. The product is a home record with an assistant, not an
 * assistant with a home record attached, and the navigation should say so.
 *
 * Lookups are answered from the record directly — instantly, offline, and with no
 * possibility of a hallucinated date. Only genuinely open-ended questions reach the
 * model, and the answer says which of the two produced it.
 */
export default function Assistant() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const params = useLocalSearchParams<{ seed?: string }>();
  const messages = useStore((s) => s.assistantMessages);
  const append = useStore((s) => s.appendAssistantMessage);
  const clear = useStore((s) => s.clearAssistant);
  const countUsage = useStore((s) => s.countUsage);
  const { usage } = usePlan();

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const seeded = useRef(false);
  const keyboardInset = useKeyboardInset();

  const send = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || !record || busy) return;
      setInput('');
      append({ role: 'user', content: trimmed });
      setBusy(true);

      try {
        const asOf = today();
        const local = answerFromRecord(record, trimmed, asOf);

        if (!local.needsModel) {
          append({
            role: 'assistant',
            content: local.answer,
            fromRecord: true,
            citations: local.citations,
            followUps: local.suggestedFollowUps,
          });
          return;
        }

        if (!isGatewayConfigured()) {
          append({
            role: 'assistant',
            fromRecord: true,
            content:
              "That needs reasoning rather than a lookup, and no AI gateway is configured on this build.\n\nI can still answer anything that reads directly off your record — ages, dates, costs, warranties, filter sizes, what's overdue, who did what work.",
          });
          return;
        }

        /*
         * The allowance is checked here and not a line earlier, on purpose.
         * Anything `answerFromRecord` could handle has already returned above:
         * those are local lookups against the owner's own record, they cost
         * nothing to serve, and charging an allowance for reading back a date
         * the owner typed in themselves would be indefensible. Only questions
         * that actually reach the model are metered.
         */
        if (!usage('assistant').allowed) {
          append({
            role: 'assistant',
            fromRecord: true,
            atAllowanceLimit: true,
            content:
              "That's every Ask Dwella question on the free plan this month. Your allowance resets on the 1st.\n\nI can still answer anything that reads straight off your record — ages, dates, costs, warranties, filter sizes, what's overdue, who did what work. Try asking one of those, or open Dwella+ for unlimited questions.",
          });
          return;
        }

        const reply = await askAssistant({
          question: trimmed,
          recordContext: buildGroundingContext(record, { asOf }),
          history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        });

        // Counted only once the model has actually answered, so a failed request
        // never costs someone a question.
        countUsage('assistant');

        append({
          role: 'assistant',
          content: reply.answer,
          isGeneralKnowledge: reply.isGeneralKnowledge,
          followUps: reply.followUps,
          citations: reply.usedComponentIds
            .map((id) => record.components.find((c) => c.id === id))
            .filter((c): c is NonNullable<typeof c> => Boolean(c))
            .map((c) => ({ label: c.name, detail: c.type, componentId: c.id })),
        });
      } catch (error) {
        append({
          role: 'assistant',
          error: true,
          content:
            error instanceof GatewayNotConfiguredError
              ? 'No AI gateway is configured on this build.'
              : `I couldn't reach the assistant. ${error instanceof Error ? error.message : ''}`,
        });
      } finally {
        setBusy(false);
        requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
      }
    },
    [record, busy, append, messages, usage, countUsage],
  );

  // A question handed in from an asset page ("Tell me about my Water heater").
  useEffect(() => {
    if (params.seed && !seeded.current) {
      seeded.current = true;
      void send(params.seed);
    }
  }, [params.seed, send]);

  // Opening the keyboard shortens the list as well as moving the composer, so
  // follow it down — otherwise typing a reply scrolls the answer you are
  // replying to off the top.
  useEffect(() => {
    if (keyboardInset > 0) {
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  }, [keyboardInset]);

  if (!record) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg, padding: spacing.lg }}>
        <Small>Set up your home first.</Small>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['bottom']}>
      {/*
        KeyboardAvoidingView still does the work on iOS and Android. On web it
        renders as a plain View and never reacts, so the measured inset is what
        lifts the composer clear of the keyboard there. `useKeyboardInset`
        returns 0 on native, so the two never both apply.
      */}
      <KeyboardAvoidingView
        style={{ flex: 1, paddingBottom: keyboardInset }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 ? (
            <View style={{ gap: spacing.lg }}>
              <View style={{ gap: spacing.sm }}>
                <Heading>Ask about your home</Heading>
                <Small>
                  Answers come from this house's own record — the labels you photographed, the
                  invoices you filed, the work that has actually been done.
                </Small>
              </View>
              <View style={{ gap: spacing.sm }}>
                {STARTERS.map((starter) => (
                  <Pressable
                    key={starter}
                    onPress={() => void send(starter)}
                    style={({ pressed }) => ({
                      backgroundColor: theme.surface,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: theme.border,
                      padding: spacing.lg,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Row justify="space-between">
                      <Body style={{ flex: 1 }}>{starter}</Body>
                      <Ionicons name="arrow-forward" size={15} color={theme.textTertiary} />
                    </Row>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {messages.map((message) => (
            <View key={message.id} style={{ gap: spacing.md }}>
              <Bubble
                message={message}
                onFollowUp={(q) => void send(q)}
                onOpenComponent={(id) => router.push(`/component/${id}`)}
              />
              {/* The upgrade card appears once, attached to the reply that hit
                  the limit — not as a banner that follows the conversation. */}
              {message.atAllowanceLimit ? (
                <AllowanceSpent
                  what="last Ask Dwella question"
                  alternative="Anything that reads straight off your record still works — ages, dates, costs, warranties, filter sizes, what's overdue, and who did what."
                />
              ) : null}
            </View>
          ))}

          {/* An answer about weekend work is more useful as tappable tasks than prose. */}
          {messages.length > 0 && !busy ? <WeekendTasks lastQuestion={lastUserQuestion(messages)} /> : null}

          {busy ? (
            <Row gap={spacing.sm}>
              <ActivityIndicator size="small" color={theme.textSecondary} />
              <Tertiary>Checking your record…</Tertiary>
            </Row>
          ) : null}

          {messages.length > 0 ? (
            <Row justify="center">
              <Chip label="Clear conversation" icon="trash-outline" onPress={clear} />
            </Row>
          ) : null}

          {/* Stated up front rather than only on the way out, and only for
              questions that reach the model — record lookups are always free. */}
          <AllowanceRow
            verdict={usage('assistant')}
            noun={{ one: 'question', many: 'questions' }}
            hint="Questions answered straight from your record never count."
          />
        </ScrollView>

        <View
          style={{
            flexDirection: 'row',
            gap: spacing.sm,
            padding: spacing.md,
            borderTopWidth: 1,
            borderTopColor: theme.border,
            backgroundColor: theme.surface,
            alignItems: 'flex-end',
          }}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your home…"
            placeholderTextColor={theme.textTertiary}
            multiline
            style={{
              flex: 1,
              backgroundColor: theme.surfaceSunken,
              borderRadius: radius.lg,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              color: theme.text,
              fontSize: 16,
              maxHeight: 120,
            }}
          />
          <Pressable
            onPress={() => void send(input)}
            accessibilityLabel="Send"
            style={{
              width: 42,
              height: 42,
              borderRadius: radius.pill,
              backgroundColor: input.trim() && !busy ? theme.ink : theme.surfaceSunken,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons
              name="arrow-up"
              size={20}
              color={input.trim() && !busy ? theme.onInk : theme.textTertiary}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function lastUserQuestion(messages: AssistantMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === 'user') return message.content.toLowerCase();
  }
  return '';
}

/**
 * When someone asks what to do with their weekend, the answer is a checklist, not a
 * paragraph. This renders the actual short DIY tasks from their schedule as
 * tappable cards — the answer and the action in one place.
 */
function WeekendTasks({ lastQuestion }: { lastQuestion: string }) {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const asOf = today();

  if (!/weekend|today|this week|what should i|knock out|quick win/.test(lastQuestion)) return null;
  if (!record) return null;

  const candidates = generateTasks(record, { asOf })
    .filter(
      (t) =>
        !t.diy.proOnlyReason &&
        t.diy.estimatedMinutes > 0 &&
        t.diy.estimatedMinutes <= 90 &&
        (t.urgency === 'overdue' || t.urgency === 'due_soon' || t.urgency === 'upcoming'),
    )
    .slice(0, 3);

  if (candidates.length === 0) return null;

  return (
    <Card>
      <BodyStrong>
        {candidates.length} good {candidates.length === 1 ? 'task' : 'tasks'} you could do yourself
      </BodyStrong>
      {candidates.map((task, index) => (
        <View key={task.key} style={{ gap: spacing.md }}>
          {index > 0 ? <Divider /> : null}
          <TaskChoice task={task} asOf={asOf} />
        </View>
      ))}
      <Pressable onPress={() => router.push('/(tabs)/tasks')}>
        <Row justify="space-between">
          <Small style={{ color: theme.blue, fontFamily: fonts.sans[600] }}>Open full checklist</Small>
          <Ionicons name="chevron-forward" size={15} color={theme.blue} />
        </Row>
      </Pressable>
    </Card>
  );
}

function TaskChoice({ task, asOf }: { task: ScheduledTask; asOf: string }) {
  const router = useRouter();
  const theme = useTheme();
  const materials = task.diy.materials.length;
  return (
    <Pressable
      onPress={() => router.push(`/task/${encodeURIComponent(task.key)}`)}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Row justify="space-between" gap={spacing.md}>
        <View style={{ flex: 1, gap: 2 }}>
          <BodyStrong>{task.title}</BodyStrong>
          <Small>
            {task.diy.estimatedMinutes} min
            {materials > 0 ? ` · ${formatMoney(task.hireCostRangeCents[0])}+ if hired` : ''} ·{' '}
            {relativeDayLabel(asOf, task.dueDate)}
          </Small>
        </View>
        <Ionicons name="chevron-forward" size={15} color={theme.textTertiary} />
      </Row>
    </Pressable>
  );
}

function Bubble({
  message,
  onFollowUp,
  onOpenComponent,
}: {
  message: AssistantMessage;
  onFollowUp: (question: string) => void;
  onOpenComponent: (id: string) => void;
}) {
  const theme = useTheme();

  if (message.role === 'user') {
    return (
      <View
        style={{
          alignSelf: 'flex-end',
          maxWidth: '86%',
          backgroundColor: theme.ink,
          borderRadius: radius.lg,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
        }}
      >
        <Body style={{ color: theme.onInk }}>{message.content}</Body>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Card tone={message.error ? theme.redSoft : undefined}>
        <Body>{message.content}</Body>

        {message.citations && message.citations.length > 0 ? (
          <Row wrap gap={spacing.xs}>
            {message.citations.map((citation, index) => (
              <Chip
                key={`${citation.label}-${index}`}
                label={citation.label}
                onPress={citation.componentId ? () => onOpenComponent(citation.componentId!) : undefined}
              />
            ))}
          </Row>
        ) : null}

        <Row gap={spacing.sm}>
          <Ionicons
            name={message.fromRecord ? 'document-text-outline' : 'sparkles-outline'}
            size={13}
            color={theme.textTertiary}
          />
          <Tertiary>
            {message.error
              ? 'Could not answer'
              : message.fromRecord
                ? 'From your record'
                : message.isGeneralKnowledge
                  ? 'General knowledge, not specific to your home'
                  : 'Answered from your record'}
          </Tertiary>
        </Row>
      </Card>

      {message.followUps && message.followUps.length > 0 ? (
        <Row wrap gap={spacing.xs}>
          {message.followUps.map((followUp) => (
            <Chip key={followUp} label={followUp} onPress={() => onFollowUp(followUp)} />
          ))}
        </Row>
      ) : null}
    </View>
  );
}
