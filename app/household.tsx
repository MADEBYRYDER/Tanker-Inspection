import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Text, View } from 'react-native';
import {
  ASSIGNABLE_ROLES,
  ROLE_BLURB,
  ROLE_LABEL,
  canRemoveMember,
  type Role,
} from '../src/core/account';
import { formatDate } from '../src/core/dates';
import { usePlan } from '../src/state/plan';
import { useHousehold, useOwnership, usePermissions, useStore } from '../src/state/store';
import {
  Badge,
  Body,
  Button,
  Card,
  Chip,
  Divider,
  Enter,
  Field,
  Notice,
  Row,
  Screen,
  SectionTitle,
  Small,
  Tertiary,
  Title,
} from '../src/ui/components';
import { useDialog } from '../src/ui/dialog';
import { Touchable } from '../src/ui/motion';
import { PlusGate } from '../src/ui/plus';
import { fonts, spacing, type, useTheme } from '../src/ui/theme';

/**
 * The household.
 *
 * A property is not locked to one login. Both owners, a property manager, a
 * parent, a contractor with a job to do — each has a membership on this
 * property with a role, and the role decides what they can reach.
 *
 * The screen leads with the roles rather than the people, because the useful
 * question when adding someone is never "who" — it is "how much of my house am
 * I handing them". Spelling that out at the point of the decision is the
 * difference between a permission model and a permissions dialog.
 */
export default function Household() {
  const theme = useTheme();
  const household = useHousehold();
  const ownership = useOwnership();
  const { can, role: myRole } = usePermissions();
  const { can: planCan } = usePlan();
  const addMember = useStore((s) => s.addMember);
  const updateRole = useStore((s) => s.updateMemberRole);
  const removeMember = useStore((s) => s.removeMember);
  const memberships = useStore((s) => s.memberships);
  const { confirm, alert } = useDialog();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');

  const mayManage = can('manage_members');

  const submit = () => {
    addMember({ displayName: name.trim(), email: email.trim() || undefined, role });
    setName('');
    setEmail('');
    setRole('member');
    setAdding(false);
  };

  return (
    <Screen gap={spacing.xl}>
      <View style={{ gap: spacing.sm }}>
        <Title>Household</Title>
        <Small>
          Everyone here can reach this home. Each person has their own account — access is granted
          and revoked per property, so someone you add here sees nothing about your other homes.
        </Small>
      </View>

      {/* Who has access */}
      <View style={{ gap: spacing.md }}>
        <SectionTitle title="People" />
        <Card padding={spacing.lg}>
          {household.map((member, index) => (
            <View key={member.id} style={{ gap: spacing.md }}>
              {index > 0 ? <Divider /> : null}
              <Row gap={spacing.md} align="flex-start">
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: theme.surfaceSunken,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={[type.bodyStrong, { color: theme.textSecondary }]}>
                    {member.displayName.trim().charAt(0).toUpperCase() || '?'}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Row gap={spacing.sm}>
                    <Text style={[type.bodyStrong, { color: theme.text, flex: 1 }]} numberOfLines={1}>
                      {member.displayName}
                    </Text>
                    <Badge
                      label={ROLE_LABEL[member.role]}
                      fg={member.role === 'owner' ? theme.sage : theme.textSecondary}
                      bg={member.role === 'owner' ? theme.sageSoft : theme.surfaceSunken}
                    />
                  </Row>
                  {member.email ? <Tertiary>{member.email}</Tertiary> : null}
                  <Tertiary>{ROLE_BLURB[member.role]}</Tertiary>
                  {member.pending ? (
                    <Tertiary style={{ color: theme.amber }}>
                      Invitation not sent — this build has no way to reach them yet.
                    </Tertiary>
                  ) : null}
                  {member.expiresAt ? (
                    <Tertiary>Access ends {formatDate(member.expiresAt.slice(0, 10))}</Tertiary>
                  ) : null}
                </View>
              </Row>

              {mayManage && member.role !== 'owner' ? (
                <Row gap={spacing.xs} wrap>
                  {ASSIGNABLE_ROLES.map((option) => (
                    <Chip
                      key={option}
                      label={ROLE_LABEL[option]}
                      selected={member.role === option}
                      onPress={() => updateRole(member.id, option)}
                    />
                  ))}
                  <Touchable
                    onPress={() => {
                      const verdict = canRemoveMember(memberships, member.id);
                      if (!verdict.allowed) {
                        void alert('Cannot remove', verdict.reason ?? '');
                        return;
                      }
                      void confirm({
                        title: `Remove ${member.displayName}?`,
                        message:
                          'They lose access to this home. Anything they added stays in the record.',
                        confirmLabel: 'Remove',
                        cancelLabel: 'Keep',
                        destructive: true,
                      }).then((ok) => {
                        if (ok) removeMember(member.id);
                      });
                    }}
                    scaleTo={0.96}
                  >
                    <Badge label="Remove" fg={theme.red} bg={theme.redSoft} />
                  </Touchable>
                </Row>
              ) : null}
            </View>
          ))}
        </Card>
      </View>

      {/* Adding someone */}
      {!mayManage ? (
        <Notice icon="lock-closed-outline">
          {myRole
            ? `You are a ${ROLE_LABEL[myRole].toLowerCase()} on this home, which does not include managing who else has access.`
            : 'You do not have access to manage this household.'}
        </Notice>
      ) : !planCan('family_sharing') ? (
        <PlusGate
          icon="people-outline"
          title="Share this home"
          promise="One subscription covers the household, not a person. Add a partner, a parent, or a property manager — each with their own account and their own level of access."
        />
      ) : adding ? (
        <Enter>
          <Card>
            <SectionTitle title="Add someone" />
            <Field label="Name" value={name} onChangeText={setName} placeholder="Adrienne" />
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              placeholder="adrienne@example.com"
              hint="Where their invitation will go once invitations are live."
            />
            <Tertiary>WHAT THEY CAN DO</Tertiary>
            <View style={{ gap: spacing.sm }}>
              {ASSIGNABLE_ROLES.map((option) => (
                <Touchable key={option} onPress={() => setRole(option)} scaleTo={0.99}>
                  <Row gap={spacing.md} align="flex-start">
                    <Ionicons
                      name={role === option ? 'radio-button-on' : 'radio-button-off'}
                      size={19}
                      color={role === option ? theme.ink : theme.textTertiary}
                      style={{ marginTop: 1 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Body style={{ fontFamily: fonts.sans[600] }}>{ROLE_LABEL[option]}</Body>
                      <Tertiary>{ROLE_BLURB[option]}</Tertiary>
                    </View>
                  </Row>
                </Touchable>
              ))}
            </View>
            <Button label="Add them" onPress={submit} disabled={name.trim().length === 0} full />
            <Button label="Cancel" variant="ghost" onPress={() => setAdding(false)} />
          </Card>
        </Enter>
      ) : (
        <Button
          label="Add someone to this home"
          icon="person-add-outline"
          onPress={() => setAdding(true)}
          full
        />
      )}

      {/*
       * Ownership, kept apart from access on purpose. Who can open the app today
       * and who owned the building in 2019 are different questions, and only the
       * second one transfers with the house.
       */}
      <View style={{ gap: spacing.md }}>
        <SectionTitle title="Ownership" />
        <Card>
          {ownership.map((period, index) => (
            <View key={period.id} style={{ gap: spacing.sm }}>
              {index > 0 ? <Divider /> : null}
              <Row justify="space-between" gap={spacing.md}>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontFamily: fonts.sans[600] }}>{period.ownerLabel}</Body>
                  <Tertiary>
                    {formatDate(period.startedOn)} —{' '}
                    {period.endedOn ? formatDate(period.endedOn) : 'present'}
                  </Tertiary>
                </View>
                {!period.endedOn ? (
                  <Badge label="current" fg={theme.sage} bg={theme.sageSoft} />
                ) : null}
              </Row>
            </View>
          ))}
          {ownership.length === 0 ? <Small>No ownership period recorded.</Small> : null}
          <Tertiary>
            Ownership periods are append-only. Selling the home closes the current one and opens the
            next; nothing before it is edited or removed.
          </Tertiary>
        </Card>
      </View>
    </Screen>
  );
}
