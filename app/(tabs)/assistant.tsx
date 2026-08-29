import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { today } from '../../src/core/dates';
import { answerFromRecord, buildGroundingContext } from '../../src/core/engine/query';
import { GatewayNotConfiguredError, askAssistant, isGatewayConfigured } from '../../src/ai/client';
import { useHomeRecord, useStore, type AssistantMessage } from '../../src/state/store';
import {
  Badge,
  Body,
  BodyStrong,
  Card,
  Chip,
  Faint,
  Muted,
  Notice,
  Row,
  Title,
} from '../../src/ui/components';
import { radius, spacing, type, useTheme } from '../../src/ui/theme';

const STARTERS = [
  'What size HVAC filter do I need?',
  'When was my roof replaced?',
  'What maintenance am I behind on?',
  'How much have I spent this year?',
  'Is my dishwasher still under warranty?',
];

/**
 * The assistant.
 *
 * Lookups are answered from the record directly — instantly, offline, and without
 * spending a model call on a question that is a database read. Anything open-ended
 * goes to the model with the record as its grounding context. The UI labels which
 * of the two answered, because "from your record" and "reasoning about your record"
 * deserve different levels of trust.
 */
export default function Assistant() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const messages = useStore((s) => s.assistantMessages);
  const append = useStore((s) => s.appendAssistantMessage);
  const clear = useStore((s) => s.clearAssistant);

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

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
            content:
              "That one needs reasoning rather than a lookup, and no AI gateway is configured on this build, so I can't answer it.\n\nI can still answer anything that's a direct question about your record — ages, dates, costs, warranties, filter sizes, what's overdue, who did what work. Try one of those, or connect a gateway in Settings.",
            fromRecord: true,
          });
          return;
        }

        const reply = await askAssistant({
          question: trimmed,
          recordContext: buildGroundingContext(record, { asOf }),
          history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        });

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
              : `I couldn't reach the assistant service. ${
                  error instanceof Error ? error.message : ''
                }\n\nQuestions that are direct lookups against your record still work offline.`,
        });
      } finally {
        setBusy(false);
        requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
      }
    },
    [record, busy, append, messages],
  );

  if (!record) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg, padding: spacing.lg }}>
        <Muted>Set up your home first.</Muted>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 ? (
            <View style={{ gap: spacing.md }}>
              <Title>Ask about your home</Title>
              <Muted>
                Answers come from this house's own record — the nameplates you photographed, the
                invoices you filed, the work that has actually been done. Not generic advice about
                houses in general.
              </Muted>
              {record.components.length === 0 ? (
                <Notice icon="camera-outline">
                  Your record is empty, so there is little to answer from yet. Scanning your equipment
                  is what makes this useful.
                </Notice>
              ) : null}
              <Faint>Try one of these</Faint>
              <View style={{ gap: spacing.sm }}>
                {STARTERS.map((starter) => (
                  <Chip key={starter} label={starter} onPress={() => void send(starter)} />
                ))}
              </View>
            </View>
          ) : null}

          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onFollowUp={(q) => void send(q)}
              onOpenComponent={(id) => router.push(`/component/${id}`)}
            />
          ))}

          {busy ? (
            <Row gap={spacing.sm}>
              <ActivityIndicator size="small" color={theme.accent} />
              <Faint>Checking your record…</Faint>
            </Row>
          ) : null}

          {messages.length > 0 ? (
            <Row justify="center">
              <Chip label="Clear conversation" icon="trash-outline" onPress={clear} />
            </Row>
          ) : null}
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
            placeholderTextColor={theme.textFaint}
            multiline
            onSubmitEditing={() => void send(input)}
            style={{
              flex: 1,
              backgroundColor: theme.surfaceAlt,
              borderRadius: radius.lg,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.md,
              color: theme.text,
              fontSize: 15,
              maxHeight: 120,
            }}
          />
          <Ionicons
            name="arrow-up-circle"
            size={38}
            color={input.trim() && !busy ? theme.accent : theme.textFaint}
            onPress={() => void send(input)}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({
  message,
  onFollowUp,
  onOpenComponent,
}: {
  message: AssistantMessage;
  onFollowUp: (question: string) => void;
  onOpenComponent: (id: string) => void;
}) {
  const theme = useTheme();
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <View
        style={{
          alignSelf: 'flex-end',
          maxWidth: '85%',
          backgroundColor: theme.accent,
          borderRadius: radius.lg,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
        }}
      >
        <Body style={{ color: theme.onAccent }}>{message.content}</Body>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.sm, alignSelf: 'stretch' }}>
      <Card tone={message.error ? theme.dangerSoft : undefined}>
        <Body style={{ lineHeight: 22 }}>{message.content}</Body>

        {message.citations && message.citations.length > 0 ? (
          <View style={{ gap: spacing.xs }}>
            <Faint>From your record</Faint>
            <Row wrap gap={spacing.xs}>
              {message.citations.map((citation, index) => (
                <Chip
                  key={`${citation.label}-${index}`}
                  label={citation.label}
                  icon="link-outline"
                  onPress={
                    citation.componentId ? () => onOpenComponent(citation.componentId!) : undefined
                  }
                />
              ))}
            </Row>
          </View>
        ) : null}

        <Row gap={spacing.xs} wrap>
          {message.fromRecord ? (
            <Badge label="from your record" fg={theme.success} bg={theme.successSoft} />
          ) : message.error ? null : (
            <Badge label="AI answer" fg={theme.info} bg={theme.infoSoft} />
          )}
          {message.isGeneralKnowledge ? (
            <Badge label="general knowledge" fg={theme.warning} bg={theme.warningSoft} />
          ) : null}
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
