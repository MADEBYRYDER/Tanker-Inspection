import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { RESIZE_LONG_EDGE, RESIZE_QUALITY, imageBytes } from '../ai/payload';
import type { ImagePayload } from '../ai/schemas';
import { notify } from './dialog';

/**
 * Photo capture for the scan, document, and problem flows.
 *
 * Uses the system camera rather than an in-app viewfinder. Nameplates are usually
 * in bad light behind a water heater, and the built-in camera brings autofocus,
 * torch, and zoom that a custom `CameraView` would have to reimplement badly.
 *
 * Every capture is downscaled before it leaves the device. This is the difference
 * between the feature working and not: a raw phone photo is 4–8 MB, three of them
 * is a request that takes a minute on basement wifi and then gets rejected by the
 * gateway's size cap. 1600px on the long edge reads a serial number just as well —
 * the limit on those photos is focus and glare, not pixels.
 */

export interface CapturedImage extends ImagePayload {
  uri: string;
  /** Decoded size after resizing, for showing the upload cost in the UI. */
  bytes: number;
}

/**
 * Downscales and re-encodes to JPEG.
 *
 * Falls back to the original asset if manipulation fails — a slightly-too-large
 * photo the gateway might still accept is better than losing the capture and
 * making someone walk back to the water heater.
 */
async function normalize(
  asset: ImagePickerAsset,
  role: string | undefined,
): Promise<CapturedImage | undefined> {
  try {
    const context = ImageManipulator.manipulate(asset.uri);
    const longEdge = Math.max(asset.width ?? 0, asset.height ?? 0);
    if (longEdge > RESIZE_LONG_EDGE) {
      const portrait = (asset.height ?? 0) >= (asset.width ?? 0);
      context.resize(
        portrait ? { height: RESIZE_LONG_EDGE } : { width: RESIZE_LONG_EDGE },
      );
    }
    const image = await context.renderAsync();
    const result = await image.saveAsync({
      compress: RESIZE_QUALITY,
      format: SaveFormat.JPEG,
      base64: true,
    });
    if (result.base64) {
      return {
        data: result.base64,
        mediaType: 'image/jpeg',
        role,
        uri: result.uri,
        bytes: imageBytes({ data: result.base64 }),
      };
    }
  } catch {
    // Fall through to the unprocessed asset below.
  }

  if (!asset.base64) return undefined;
  return {
    data: asset.base64,
    mediaType:
      asset.mimeType === 'image/png'
        ? 'image/png'
        : asset.mimeType === 'image/webp'
          ? 'image/webp'
          : 'image/jpeg',
    role,
    uri: asset.uri,
    bytes: imageBytes({ data: asset.base64 }),
  };
}

type ImagePickerAsset = ImagePicker.ImagePickerAsset;

async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) {
    notify(
      'Camera access is off',
      'Dwella needs the camera to read nameplates and invoices. Turn it on in Settings to scan.',
    );
    return false;
  }
  const requested = await ImagePicker.requestCameraPermissionsAsync();
  return requested.granted;
}

/** Opens the camera. Returns undefined if the user cancels or denies permission. */
export async function capturePhoto(role?: string): Promise<CapturedImage | undefined> {
  if (!(await ensureCameraPermission())) return undefined;
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    // Full quality out of the camera; the resize step below does the compressing,
    // and compressing twice just adds artefacts to the label we need to read.
    quality: 1,
    base64: false,
    exif: false,
  });
  if (result.canceled || !result.assets[0]) return undefined;
  return normalize(result.assets[0], role);
}

/** Opens the photo library, optionally allowing several at once. */
export async function pickPhotos(role?: string, limit = 4): Promise<CapturedImage[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    notify('Photo access is off', 'Turn on photo access in Settings to attach existing photos.');
    return [];
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    base64: false,
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    exif: false,
  });
  if (result.canceled) return [];

  const normalized = await Promise.all(result.assets.map((asset) => normalize(asset, role)));
  return normalized.filter((image): image is CapturedImage => Boolean(image));
}

/** Strips the extra UI fields before sending. */
export function toPayload(image: CapturedImage): ImagePayload {
  return { data: image.data, mediaType: image.mediaType, role: image.role };
}
