import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { formatDate, today } from '../../src/core/dates';
import { PROVIDERS, buildServiceRequestPacket, providersForCategory, renderPacketText } from '../../src/core/engine/serviceRequest';
import { formatMoneyExact } from '../../src/core/money';
import type { ServiceRequest } from '../../src/core/types';
import type { DispatchStatus } from '../../src/core/types';
import { fetchStatus, isDispatchConfigured, submitToProvider } from '../../src/dispatch/client';
import { usePlan } from '../../src/state/plan';
import { useHomeRecord, useStore } from '../../src/state/store';
import { PhotoTray, canSubmit } from '../../src/ui/PhotoTray';
import { toPayload, type CapturedImage } from '../../src/ui/capture';
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
  Label,
  Loading,
  Small,
  Notice,
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
/** Plain-language names for the provider-side states. "Acknowledged" beats a status code. */
const DELIVERY_LABEL: Record<DispatchStatus, string> = {
  submitted: 'sent',
  acknowledged: 'they have seen it',
  quoted: 'quoted',
  scheduled: 'scheduled',
  completed: 'completed',
  declined: 'declined',
  cancelled: 'withdrawn',
};

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
  const recordDelivery = useStore((s) => s.recordDelivery);
  const updateHome = useStore((s) => s.updateHome);
  const addMedia = useStore((s) => s.addMedia);
  const { can } = usePlan();

  const [componentId, setComponentId] = useState<string | undefined>(params.componentId || undefined);
  const [title, setTitle] = useState(params.title ?? '');
  const [problem, setProblem] = useState(params.problem ?? '');
  const [urgency, setUrgency] = useState<ServiceRequest['urgency']>(
    params.urgency === 'emergency' ? 'emergency' : params.urgency === 'routine' ? 'routine' : 'soon',
  );
  const [providerId, setProviderId] = useState<string | undefined>(PROVIDERS[0]?.id);
  const [images, setImages] = useState<CapturedImage[]>([]);
  const [phone, setPhone] = useState(record?.home.contactPhone ?? '');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | undefined>();

  const component = record?.components.find((c) => c.id === componentId);

  /*
   * The preview is built from the phone number in the field rather than the one
   * on file, so what the owner reads here is exactly what gets sent — including
   * an edit they have made but not yet saved.
   */
  const preview = useMemo(() => {
    if (!record) return undefined;
    return buildServiceRequestPacket({
      record: { ...record, home: { ...record.home, contactPhone: phone.trim() || undefined } },
      component,
      problem: problem || '(describe the problem)',
      photoCount: images.length,
    });
  }, [record, component, problem, images.length, phone]);

  if (!record) return <Screen><Small>Set up your home first.</Small></Screen>;

  const providers = component ? providersForCategory(component.category) : PROVIDERS;

  const send = async () => {
    setSendError(undefined);

    // A number entered here is worth keeping; the next request should not ask again.
    const trimmedPhone = phone.trim() || undefined;
    if (trimmedPhone !== record.home.contactPhone) updateHome({ contactPhone: trimmedPhone });

    const photoIds = images.map(
      (image) => addMedia({ uri: image.uri, kind: 'photo', role: 'issue' }).id,
    );

    const request = createRequest({
      componentId,
      taskKey: params.taskKey,
      title: title.trim() || (component ? `${component.name} service` : 'Service request'),
      problemDescription: problem.trim(),
      urgency,
      providerId,
      photoIds,
    });
    submitRequest(request.id);

    /*
     * The request is already saved. Sending is a separate step that is allowed to
     * fail: when there is no dispatch server, or the signal drops, the owner still
     * has a complete record of what they asked for and can send it later.
     */
    if (providerId && isDispatchConfigured()) {
      setSending(true);
      try {
        const response = await submitToProvider({
          request: { ...request, status: 'submitted' },
          providerId,
          photos: images.map(toPayload),
          priority: can('priority_service'),
        });
        recordDelivery(request.id, {
          remoteId: response.id,
          trackingToken: response.trackingToken,
          deliveredAt: new Date().toISOString(),
          remoteStatus: response.status,
        });
      } catch (error) {
        setSendError(
          error instanceof Error
            ? error.message
            : 'Could not reach the provider. The request is saved on your phone.',
        );
        setSending(false);
        return;
      }
      setSending(false);
    }

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
        <Label>Photos</Label>
        <PhotoTray
          images={images}
          onChange={setImages}
          role="reported issue"
          captureLabel="Photograph it"
          emptyHint="Optional, but a photo of the problem is usually worth more than a paragraph describing it."
        />
      </Card>

      <Card>
        <Field
          label="Callback number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="(843) 555-0142"
          hint="How the company reaches you to schedule. Saved for next time."
        />
      </Card>

      <Card>
        <SectionTitle title="Send to" />
        {can('priority_service') ? (
          <Row gap={spacing.xs}>
            <Badge label="priority" fg={theme.blue} bg={theme.blueSoft} />
            <Tertiary style={{ flex: 1 }}>
              Dwella+ requests are flagged for the company to see first.
            </Tertiary>
          </Row>
        ) : null}
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

      {sendError ? (
        <Card tone={theme.redSoft}>
          <Small style={{ color: theme.red }}>{sendError}</Small>
          <Tertiary>
            The request is saved here either way. You can reach the company directly, or try
            sending again.
          </Tertiary>
        </Card>
      ) : null}

      {sending ? (
        <Loading label="Sending to the company…" />
      ) : (
        <Button
          label={isDispatchConfigured() ? 'Send request' : 'Save request'}
          icon="paper-plane-outline"
          onPress={() => void send()}
          disabled={problem.trim().length < 8 || (images.length > 0 && !canSubmit(images))}
          full
        />
      )}

      {/* Say exactly what leaves the phone. The list matches the packet above,
          field for field — a vague reassurance here would be worse than none. */}
      <Card tone={theme.surfaceSunken}>
        <SectionTitle title="What gets shared" />
        <Small>
          Your address and callback number, the equipment details and service history shown above,
          your description of the problem, and any photos you attached.
        </Small>
        <Tertiary>
          Not shared: what anything has cost you, your documents, your other equipment, or your
          home health score.
        </Tertiary>
        {!isDispatchConfigured() ? (
          <Notice tone="neutral" icon="cloud-offline-outline">
            No dispatch server is configured on this build, so nothing is transmitted. The request
            is saved here and shows you exactly what a company would receive.
          </Notice>
        ) : null}
      </Card>
    </Screen>
  );
}

function ViewRequest({ id }: { id: string }) {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const completeRequest = useStore((s) => s.completeServiceRequest);
  const cancelRequest = useStore((s) => s.cancelServiceRequest);

  const applyRemoteStatus = useStore((s) => s.applyRemoteStatus);
  const request = record?.serviceRequests.find((r) => r.id === id);
  const [closing, setClosing] = useState(false);
  const [vendor, setVendor] = useState('');
  const [cost, setCost] = useState('');
  const [description, setDescription] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | undefined>();

  const delivery = request?.delivery;

  const refresh = async () => {
    if (!request || !delivery) return;
    setChecking(true);
    setCheckError(undefined);
    try {
      const status = await fetchStatus(delivery.remoteId, delivery.trackingToken);
      applyRemoteStatus(request.id, status);
    } catch (error) {
      setCheckError(error instanceof Error ? error.message : 'Could not reach the company.');
    } finally {
      setChecking(false);
    }
  };

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

      {/* What the company has said back. Above the packet, because after the
          request is sent this is the only part the owner returns to read. */}
      {delivery ? (
        <Card>
          <Row justify="space-between">
            <SectionTitle title="From the company" />
            <Badge
              label={DELIVERY_LABEL[delivery.remoteStatus ?? 'submitted']}
              fg={delivery.remoteStatus === 'declined' ? theme.red : theme.blue}
              bg={delivery.remoteStatus === 'declined' ? theme.redSoft : theme.blueSoft}
            />
          </Row>
          {delivery.providerNote ? (
            <Body>{delivery.providerNote}</Body>
          ) : (
            <Small>
              Delivered {formatDate(delivery.deliveredAt.slice(0, 10))}. Nothing back from them yet.
            </Small>
          )}
          {delivery.quotedCents !== undefined ? (
            <KeyValue label="Quoted" value={formatMoneyExact(delivery.quotedCents)} />
          ) : null}
          {delivery.scheduledFor ? (
            <KeyValue label="Scheduled" value={delivery.scheduledFor.replace('T', ' at ')} />
          ) : null}
          {checkError ? <Small style={{ color: theme.red }}>{checkError}</Small> : null}
          {checking ? (
            <Loading label="Checking…" />
          ) : (
            <Button label="Check for an update" variant="secondary" size="sm" icon="refresh-outline" onPress={() => void refresh()} />
          )}
        </Card>
      ) : request.status !== 'draft' ? (
        <Notice icon="phone-portrait-outline">
          This request is saved on your phone. No dispatch server is configured on this build, so it
          was not transmitted — the packet below is exactly what a company would receive.
        </Notice>
      ) : null}

      <Card>
        <SectionTitle title={delivery ? 'The packet they received' : 'What they would receive'} />
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
      {packet.contact.address ? <KeyValue label="Address" value={packet.contact.address} /> : null}
      {packet.contact.ownerName ? <KeyValue label="Contact" value={packet.contact.ownerName} /> : null}
      {packet.contact.phone ? <KeyValue label="Phone" value={packet.contact.phone} /> : null}

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
