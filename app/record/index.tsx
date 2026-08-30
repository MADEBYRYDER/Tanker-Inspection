import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Share, View } from 'react-native';
import { today } from '../../src/core/dates';
import { buildHomeRecordReport, renderReportText } from '../../src/core/engine/transfer';
import { formatMoney } from '../../src/core/money';
import { usePlan } from '../../src/state/plan';
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
  Tertiary,
  Heading,
  Small,
  Notice,
  Row,
  Screen,
  SectionTitle,
  Title,
} from '../../src/ui/components';
import { PlusGate } from '../../src/ui/plus';
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
  const { can } = usePlan();
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
    return <Screen><Small>Set up your home first.</Small></Screen>;
  }

  /*
   * Which sections the free plan sees. Chosen by what a section is *for*: the
   * property and its equipment are the record itself, while the year-by-year
   * history and the document index are the depth that makes it a transferable
   * dossier.
   */
  const PLUS_ONLY_SECTIONS = ['Documented work', 'Capital improvements', 'Attached documents'];
  const visibleSections = can('export_complete')
    ? report.sections
    : report.sections.filter((s) => !PLUS_ONLY_SECTIONS.includes(s.heading));
  const hiddenSections = can('export_complete')
    ? []
    : report.sections.filter((s) => PLUS_ONLY_SECTIONS.includes(s.heading));

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
      // Share exactly what is on screen. Rendering the full report here while the
      // screen shows a summary would make the difference between the tiers a
      // cosmetic one, and a paywall that is only cosmetic is a lie either way.
      await Share.share({
        message: renderReportText({ ...report, sections: visibleSections }),
        title: report.title,
      });
    } catch {
      Alert.alert('Could not share', 'Sharing is not available on this device.');
    }
  };

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Title>{report.title}</Title>
        <Small>{report.subtitle}</Small>
      </View>

      <Card>
        <SectionTitle title="Who is this for?" />
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
                <Tertiary>Off by default. Buyers inherit the work, not your invoices.</Tertiary>
              </View>
              <Chip label={includeCosts ? 'Included' : 'Excluded'} selected={includeCosts} onPress={() => setIncludeCosts(!includeCosts)} />
            </Row>
          </>
        ) : (
          <Tertiary>Your full record, including costs and private notes.</Tertiary>
        )}
      </Card>

      {report.documentedInvestmentCents !== undefined && report.documentedInvestmentCents > 0 ? (
        <Card>
          <Tertiary>DOCUMENTED INVESTMENT</Tertiary>
          <Title>{formatMoney(report.documentedInvestmentCents)}</Title>
          <Small>Total of every entry in your record that has a recorded amount.</Small>
        </Card>
      ) : null}

      {/*
        The summary is free: it is the owner's own record and they can always
        read it, share it, and hand it to a buyer. Dwella+ adds the sections a
        summary leaves out — the per-item service history and the document
        index — which is what turns a printout into a document an inspector or
        an agent can actually work from.
      */}
      {visibleSections.map((section) => (
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
                    color: indented ? theme.textSecondary : theme.text,
                  }}
                >
                  {line.trim()}
                </Body>
              );
            })}
          </View>
        </Card>
      ))}

      {!can('export_complete') && hiddenSections.length > 0 ? (
        <PlusGate
          icon="document-text-outline"
          title="The complete record"
          promise={`Your summary covers the property and its equipment. Dwella+ adds ${hiddenSections
            .map((s) => s.heading.toLowerCase())
            .join(' and ')} — the per-item detail a buyer, an agent, or an inspector actually asks for.`}
        />
      ) : null}

      <Button
        label={can('export_complete') ? 'Share the complete record' : 'Share this summary'}
        icon="share-outline"
        onPress={() => void share()}
        full
      />

      <Card>
        <Heading>When the house sells</Heading>
        <Small>
          The transfer copy is what moves to the new owner. They inherit the equipment inventory, the
          documented work, and the warranties — so the next person does not start from zero, and the
          record keeps growing rather than resetting every time the house changes hands.
        </Small>
        <Row gap={spacing.xs} wrap>
          <Badge label="equipment transfers" fg={theme.sage} bg={theme.sageSoft} />
          <Badge label="work history transfers" fg={theme.sage} bg={theme.sageSoft} />
          <Badge label="warranties transfer" fg={theme.sage} bg={theme.sageSoft} />
          <Badge label="your costs do not" fg={theme.textSecondary} bg={theme.surfaceSunken} />
          <Badge label="your notes do not" fg={theme.textSecondary} bg={theme.surfaceSunken} />
        </Row>
      </Card>
    </Screen>
  );
}
