import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { formatDate, today } from '../../src/core/dates';
import { PROVIDERS, buildServiceRequestPacket, providersForCategory, renderPacketText } from '../../src/core/engine/serviceRequest';
import { formatMoneyExact } from '../../src/core/money';
import type { ServiceRequest } from '../../src/core/types';
import { useHomeRecord, useStore } from '../../src/state/store';
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
  Field,
  Heading,
  KeyValue,
  Small,
  Notice,
  ProvenanceTag,
  Row,
  Screen,
  SectionTitle,
  Title,
} from '../../src/ui/components';
import { spacing, useTheme } from '../../src/ui/theme';

/**
 * Service requests.
 *
 * `/service/new` composes one; `/service/<id>` shows an existing one. The point of
 * the whole screen is the packet: everything a contractor needs is already in the
 * record, so the owner writes the problem and nothing else. When the job is done,
 * the contractor's invoice and photos come back into the timeline — which is what
 * makes the record grow without the owner maintaining it.
 */
export default function ServiceRequestScreen() {
  const params = useLocalSearchParams<{
    id: string;
    componentId?: string;
    taskKey?: string;
    title?: string;
    problem?: string;
    urgency?: string;
  }>();

  return params.id === 'new' ? <ComposeRequest params={params} /> : <ViewRequest id={params.id} />;
}

function ComposeRequest({
  params,
}: {
  params: { componentId?: string; taskKey?: string; title?: string; problem?: string; urgency?: string };
}) {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const createRequest = useStore((s) => s.createServiceRequest);
  const submitRequest = useStore((s) => s.submitServiceRequest);

  const [componentId, setComponentId] = useState<string | undefined>(params.componentId || undefined);
  const [title, setTitle] = useState(params.title ?? '');
  const [problem, setProblem] = useState(params.problem ?? '');
  const [urgency, setUrgency] = useState<ServiceRequest['urgency']>(
    params.urgency === 'emergency' ? 'emergency' : params.urgency === 'routine' ? 'routine' : 'soon',
  );
  const [providerId, setProviderId] = useState<string | undefined>(PROVIDERS[0]?.id);

  const component = record?.components.find((c) => c.id === componentId);

  const preview = useMemo(() => {
    if (!record) return undefined;
    return buildServiceRequestPacket({
      record,
      component,
      problem: problem || '(describe the problem)',
      photoCount: 0,
    });
  }, [record, component, problem]);

  if (!record) return <Screen><Small>Set up your home first.</Small></Screen>;

  const providers = component ? providersForCategory(component.category) : PROVIDERS;

  const send = () => {
    const request = createRequest({
      componentId,
      taskKey: params.taskKey,
      title: title.trim() || (component ? `${component.name} service` : 'Service request'),
      problemDescription: problem.trim(),
      urgency,
      providerId,
    });
    submitRequest(request.id);
    router.replace(`/service/${request.id}`);
  };

  return (
    <Screen>
      <View style={{ gap: spacing.sm }}>
        <Title>Request service</Title>
        <Body>
          Describe the problem. Everything else — make, model, serial, age, warranty status, and this
          item's service history — is attached automatically from your record.
        </Body>
      </View>

      <Card>
        <SectionTitle title="What needs work?" />
        <Row wrap gap={spacing.xs}>
          <Chip label="Not specific equipment" selected={!componentId} onPress={() => setComponentId(undefined)} />
          {record.components.map((c) => (
            <Chip key={c.id} label={c.name} selected={componentId === c.id} onPress={() => setComponentId(c.id)} />
          ))}
        </Row>
      </Card>

      <Card>
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="Water heater not producing hot water" />
        <Field
          label="What's the problem?"
          value={problem}
          onChangeText={setProblem}
          multiline
          placeholder="No hot water since yesterday morning. Pilot light appears to be lit. Small puddle at the base."
        />
        <Tertiary>URGENCY</Tertiary>
        <Row gap={spacing.sm} wrap>
          <Chip label="Emergency" selected={urgency === 'emergency'} onPress={() => setUrgency('emergency')} />
          <Chip label="Soon" selected={urgency === 'soon'} onPress={() => setUrgency('soon')} />
          <Chip label="Routine" selected={urgency === 'routine'} onPress={() => setUrgency('routine')} />
        </Row>
      </Card>

      <Card>
        <SectionTitle title="Send to" />
        {providers.length === 0 ? (
          <Small>No provider covers this trade in your area yet.</Small>
        ) : (
          providers.map((provider) => (
            <Row key={provider.id} justify="space-between" gap={spacing.md}>
              <View style={{ flex: 1 }}>
                <Row gap={spacing.xs}>
                  <BodyStrong>{provider.name}</BodyStrong>
                  {provider.isLaunchPartner ? (
                    <Badge label="launch partner" fg={theme.blue} bg={theme.sageSoft} />
                  ) : null}
                </Row>
                <Tertiary>{provider.serviceArea}</Tertiary>
                {provider.blurb ? <Small>{provider.blurb}</Small> : null}
              </View>
              <Chip
                label={providerId === provider.id ? 'Selected' : 'Select'}
                selected={providerId === provider.id}
                onPress={() => setProviderId(provider.id)}
              />
            </Row>
          ))
        )}
      </Card>

      {preview ? (
        <Card>
          <SectionTitle title="What they'll receive" />
          <PacketView packet={preview} />
        </Card>
      ) : null}

      <Button
        label="Send request"
        icon="paper-plane-outline"
        onPress={send}
        disabled={problem.trim().length < 8}
        full
      />
      <Tertiary>
        Sending shares the packet above with the selected provider. Your address is included; your
        cost history is not.
      </Tertiary>
    </Screen>
  );
}

function ViewRequest({ id }: { id: string }) {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const completeRequest = useStore((s) => s.completeServiceRequest);
  const cancelRequest = useStore((s) => s.cancelServiceRequest);

  const request = record?.serviceRequests.find((r) => r.id === id);
  const [closing, setClosing] = useState(false);
  const [vendor, setVendor] = useState('');
  const [cost, setCost] = useState('');
  const [description, setDescription] = useState('');

  if (!record || !request) {
    return (
      <Screen>
        <EmptyState icon="help-circle-outline" title="Not found" body="This service request no longer exists." />
      </Screen>
    );
  }

  const provider = PROVIDERS.find((p) => p.id === request.providerId);

  const close = () => {
    const parsed = Number(cost.replace(/[^0-9.]/g, ''));
    completeRequest({
      id: request.id,
      completedOn: today(),
      vendor: vendor.trim() || provider?.name || 'Contractor',
      costCents: cost && Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined,
      description: description.trim() || undefined,
    });
    router.replace('/(tabs)/timeline');
  };

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Row gap={spacing.xs}>
          <Badge
            label={request.status}
            fg={request.status === 'completed' ? theme.sage : theme.blue}
            bg={request.status === 'completed' ? theme.sageSoft : theme.blueSoft}
          />
          <Badge
            label={request.urgency}
            fg={request.urgency === 'emergency' ? theme.red : theme.textSecondary}
            bg={request.urgency === 'emergency' ? theme.redSoft : theme.surfaceSunken}
          />
        </Row>
        <Title>{request.title}</Title>
        <Tertiary>
          Created {formatDate(request.createdAt.slice(0, 10))}
          {provider ? ` · sent to ${provider.name}` : ''}
        </Tertiary>
      </View>

      <Card>
        <SectionTitle title="The packet they received" />
        <PacketView packet={request.packet} />
      </Card>

      {request.status === 'completed' ? (
        <Notice tone="good" icon="checkmark-circle-outline">
          Completed. The work is now a permanent part of your home's timeline and transfers with the
          house.
        </Notice>
      ) : request.status === 'cancelled' ? (
        <Notice icon="close-circle-outline">This request was cancelled.</Notice>
      ) : closing ? (
        <Card>
          <SectionTitle title="Close out the job" />
          <Small>
            In production the contractor uploads their invoice and completion photos and this fills in
            automatically. Here you can enter it yourself.
          </Small>
          <Field label="Who did the work" value={vendor} onChangeText={setVendor} placeholder={provider?.name ?? 'Company name'} />
          <Field label="Amount" value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="0.00" />
          <Field label="What was done" value={description} onChangeText={setDescription} multiline />
          <Button label="Record it" icon="checkmark-circle-outline" onPress={close} />
          <Button label="Cancel" variant="ghost" onPress={() => setClosing(false)} />
        </Card>
      ) : (
        <Row gap={spacing.sm} wrap>
          <Button label="Mark completed" icon="checkmark-circle-outline" onPress={() => setClosing(true)} />
          <Button label="Cancel request" variant="ghost" tone={theme.red} onPress={() => { cancelRequest(request.id); router.back(); }} />
        </Row>
      )}
    </Screen>
  );
}

function PacketView({ packet }: { packet: ServiceRequest['packet'] }) {
  const theme = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <KeyValue label="Property" value={packet.homeSummary} />

      {packet.equipment ? (
        <>
          <Divider />
          <Tertiary>EQUIPMENT</Tertiary>
          <KeyValue label="Item" value={`${packet.equipment.name} — ${packet.equipment.type}`} />
          {packet.equipment.manufacturer ? <KeyValue label="Manufacturer" value={packet.equipment.manufacturer} /> : null}
          {packet.equipment.modelNumber ? <KeyValue label="Model" value={packet.equipment.modelNumber} /> : null}
          {packet.equipment.serialNumber ? <KeyValue label="Serial" value={packet.equipment.serialNumber} /> : null}
          <KeyValue label="Age" value={packet.equipment.ageSummary} />
          {packet.equipment.specs.map((spec, index) => (
            <KeyValue key={index} label={spec.label} value={spec.value} provenance={spec.provenance} />
          ))}
          <Small>{packet.equipment.warrantyStatus}</Small>
        </>
      ) : null}

      {packet.relevantHistory.length > 0 ? (
        <>
          <Divider />
          <Tertiary>SERVICE HISTORY</Tertiary>
          {packet.relevantHistory.map((entry, index) => (
            <Row key={index} gap={spacing.sm} align="flex-start">
              <Ionicons name="checkmark-circle-outline" size={15} color={theme.sage} style={{ marginTop: 2 }} />
              <Small style={{ flex: 1 }}>
                {formatDate(entry.date)} — {entry.title}
                {entry.vendor ? ` (${entry.vendor})` : ''}
              </Small>
            </Row>
          ))}
        </>
      ) : null}

      <Divider />
      <Tertiary>PROBLEM</Tertiary>
      <Body>{packet.problem}</Body>
      <Tertiary>{packet.photoCount} photo{packet.photoCount === 1 ? '' : 's'} attached</Tertiary>
    </View>
  );
}
