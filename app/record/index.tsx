import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Share, View } from 'react-native';
import { today } from '../../src/core/dates';
import { buildHomeRecordReport, renderReportText } from '../../src/core/engine/transfer';
import { formatMoney } from '../../src/core/money';
import { useHomeRecord } from '../../src/state/store';
import {
  Badge,
  Body,
  BodyStrong,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Faint,
  Heading,
  Muted,
  Notice,
  Row,
  Screen,
  SectionHeader,
  Title,
} from '../../src/ui/components';
import { spacing, useTheme } from '../../src/ui/theme';

/**
 * The Home Record.
 *
 * Two audiences, one document. The owner's copy has everything, including what
 * each job cost. The transfer copy is what a buyer, an agent, or an inspector sees:
 * the equipment, the documented work, the warranties they can actually claim
 * against — and nothing about the seller's money, notes, or claims.
 *
 * The "What is not included" section is deliberately part of the buyer's document
 * rather than hidden. A record that quietly omits things is less trustworthy than
 * one that says what it omitted and why.
 */
export default function HomeRecordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const [forTransfer, setForTransfer] = useState(false);
  const [includeCosts, setIncludeCosts] = useState(false);

  const report = useMemo(
    () =>
      record
        ? buildHomeRecordReport(record, {
            forTransfer,
            includeCosts: forTransfer ? includeCosts : true,
            asOf: today(),
          })
        : undefined,
    [record, forTransfer, includeCosts],
  );

  if (!record || !report) {
    return <Screen><Muted>Set up your home first.</Muted></Screen>;
  }

  if (record.components.length === 0 && record.events.length === 0) {
    return (
      <Screen>
        <Title>Home Record</Title>
        <EmptyState
          icon="ribbon-outline"
          title="Nothing to show yet"
          body="Once there is equipment and work in your record, this becomes a document you can hand to a buyer, an agent, or an inspector."
          action={<Button label="Scan My Home" icon="camera-outline" onPress={() => router.push('/scan')} />}
        />
      </Screen>
    );
  }

  const share = async () => {
    try {
      await Share.share({ message: renderReportText(report), title: report.title });
    } catch {
      Alert.alert('Could not share', 'Sharing is not available on this device.');
    }
  };

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Title>{report.title}</Title>
        <Muted>{report.subtitle}</Muted>
      </View>

      <Card>
        <SectionHeader title="Who is this for?" />
        <Row gap={spacing.sm} wrap>
          <Chip label="Me" selected={!forTransfer} onPress={() => setForTransfer(false)} />
          <Chip label="A buyer or agent" selected={forTransfer} onPress={() => setForTransfer(true)} />
        </Row>
        {forTransfer ? (
          <>
            <Notice icon="shield-checkmark-outline">
              Private entries, your notes, your service requests, and what you paid are all removed.
              The equipment, the documented work, and the warranties a new owner can claim against
              all stay.
            </Notice>
            <Row justify="space-between">
              <View style={{ flex: 1 }}>
                <BodyStrong>Include what you paid</BodyStrong>
                <Faint>Off by default. Buyers inherit the work, not your invoices.</Faint>
              </View>
              <Chip label={includeCosts ? 'Included' : 'Excluded'} selected={includeCosts} onPress={() => setIncludeCosts(!includeCosts)} />
            </Row>
          </>
        ) : (
          <Faint>Your full record, including costs and private notes.</Faint>
        )}
      </Card>

      {report.documentedInvestmentCents !== undefined && report.documentedInvestmentCents > 0 ? (
        <Card>
          <Faint>DOCUMENTED INVESTMENT</Faint>
          <Title>{formatMoney(report.documentedInvestmentCents)}</Title>
          <Muted>Total of every entry in your record that has a recorded amount.</Muted>
        </Card>
      ) : null}

      {report.sections.map((section) => (
        <Card key={section.heading}>
          <Heading>{section.heading}</Heading>
          <Divider />
          <View style={{ gap: spacing.xs }}>
            {section.lines.map((line, index) => {
              const indented = line.startsWith('    ');
              const isYear = /^\d{4}$/.test(line.trim());
              if (isYear) {
                return (
                  <BodyStrong key={index} style={{ marginTop: spacing.sm }}>
                    {line.trim()}
                  </BodyStrong>
                );
              }
              return (
                <Body
                  key={index}
                  style={{
                    paddingLeft: indented ? spacing.md : 0,
                    color: indented ? theme.textMuted : theme.text,
                  }}
                >
                  {line.trim()}
                </Body>
              );
            })}
          </View>
        </Card>
      ))}

      <Button label="Share this record" icon="share-outline" onPress={() => void share()} full />

      <Card>
        <Heading>When the house sells</Heading>
        <Muted>
          The transfer copy is what moves to the new owner. They inherit the equipment inventory, the
          documented work, and the warranties — so the next person does not start from zero, and the
          record keeps growing rather than resetting every time the house changes hands.
        </Muted>
        <Row gap={spacing.xs} wrap>
          <Badge label="equipment transfers" fg={theme.success} bg={theme.successSoft} />
          <Badge label="work history transfers" fg={theme.success} bg={theme.successSoft} />
          <Badge label="warranties transfer" fg={theme.success} bg={theme.successSoft} />
          <Badge label="your costs do not" fg={theme.textMuted} bg={theme.surfaceAlt} />
          <Badge label="your notes do not" fg={theme.textMuted} bg={theme.surfaceAlt} />
        </Row>
      </Card>
    </Screen>
  );
}
