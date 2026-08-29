import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';
import { MAX_IMAGES, checkPayload, formatBytes } from '../ai/payload';
import { Button, Notice, Row, Small, Tertiary } from './components';
import { Touchable } from './motion';
import { capturePhoto, pickPhotos, type CapturedImage } from './capture';
import { radius, spacing, useTheme } from './theme';

/**
 * The photo strip shared by the scan, document, and problem flows.
 *
 * One component for all three so capture behaves identically everywhere: the same
 * add buttons, the same remove affordance, the same size accounting, and the same
 * warning when a set is getting too heavy to send. Three separate implementations
 * is how one of them quietly ends up without the size check.
 */
export function PhotoTray({
  images,
  onChange,
  role,
  captureLabel = 'Take a photo',
  emptyHint,
  aspect = 'square',
}: {
  images: CapturedImage[];
  onChange: (next: CapturedImage[]) => void;
  /** What these photos are of, passed through to the model. */
  role?: string;
  captureLabel?: string;
  emptyHint?: string;
  aspect?: 'square' | 'page';
}) {
  const theme = useTheme();
  const verdict = checkPayload(images);
  const full = images.length >= MAX_IMAGES;

  const add = (next: CapturedImage[]) => {
    if (next.length === 0) return;
    onChange([...images, ...next].slice(0, MAX_IMAGES));
  };

  const width = aspect === 'page' ? 84 : 96;
  const height = aspect === 'page' ? 108 : 96;

  return (
    <View style={{ gap: spacing.md }}>
      {images.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.lg, paddingTop: 6 }}
        >
          {images.map((image, index) => (
            <View key={image.uri}>
              <Image
                source={{ uri: image.uri }}
                style={{
                  width,
                  height,
                  borderRadius: radius.md,
                  backgroundColor: theme.surfaceSunken,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.hairline,
                }}
                contentFit="cover"
              />
              <Touchable
                onPress={() => onChange(images.filter((i) => i.uri !== image.uri))}
                accessibilityLabel={`Remove photo ${index + 1}`}
                scaleTo={0.85}
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  backgroundColor: theme.surface,
                  borderRadius: radius.pill,
                }}
              >
                <Ionicons name="close-circle" size={22} color={theme.red} />
              </Touchable>
              {image.role ? (
                <Tertiary numberOfLines={1} style={{ width, textAlign: 'center', marginTop: 4 }}>
                  {image.role}
                </Tertiary>
              ) : null}
            </View>
          ))}
        </ScrollView>
      ) : emptyHint ? (
        <Small>{emptyHint}</Small>
      ) : null}

      <Row gap={spacing.sm} wrap>
        <Button
          label={captureLabel}
          icon="camera-outline"
          size="sm"
          disabled={full}
          onPress={async () => {
            const photo = await capturePhoto(role);
            if (photo) add([photo]);
          }}
        />
        <Button
          label="From library"
          icon="images-outline"
          variant="secondary"
          size="sm"
          disabled={full}
          onPress={async () => add(await pickPhotos(role, MAX_IMAGES - images.length))}
        />
        {images.length > 0 ? (
          <Tertiary>
            {images.length}/{MAX_IMAGES} · {formatBytes(verdict.totalBytes)}
          </Tertiary>
        ) : null}
      </Row>

      {full ? <Tertiary>That's the maximum. Remove one to add another.</Tertiary> : null}
      {/* Only complain about photos that are actually there. An empty tray is a
          valid state on the problem screen, where a description alone is enough,
          and the submit button already reflects whether a flow needs one. */}
      {images.length > 0 && !verdict.ok ? <Notice tone="attention">{verdict.reason}</Notice> : null}
      {images.length > 0 && verdict.ok && verdict.warning ? (
        <Tertiary>{verdict.warning}</Tertiary>
      ) : null}
    </View>
  );
}

/** Whether the current set can be submitted. Shared by every screen's action button. */
export function canSubmit(images: CapturedImage[]): boolean {
  return checkPayload(images).ok;
}
