import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';
import type { ImagePayload } from '../ai/schemas';

/**
 * Photo capture for the scan, document, and problem flows.
 *
 * Uses the system camera rather than an in-app viewfinder. Nameplates are usually
 * in bad light behind a water heater, and the built-in camera brings autofocus,
 * torch, and zoom that a custom `CameraView` would have to reimplement badly.
 *
 * Images are compressed on capture. A full-resolution phone photo is 4–8 MB, and
 * three of them is a request slow enough that people assume the app has hung —
 * while adding nothing, since the model reads a 1600px nameplate as well as a
 * 4000px one.
 */

export interface CapturedImage extends ImagePayload {
  uri: string;
}

const QUALITY = 0.5;

function toPayload(
  asset: ImagePicker.ImagePickerAsset,
  role: string | undefined,
): CapturedImage | undefined {
  if (!asset.base64) return undefined;
  const mediaType: ImagePayload['mediaType'] =
    asset.mimeType === 'image/png' ? 'image/png' : asset.mimeType === 'image/webp' ? 'image/webp' : 'image/jpeg';
  return { data: asset.base64, mediaType, role, uri: asset.uri };
}

async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) {
    Alert.alert(
      'Camera access is off',
      'Homestead needs the camera to read nameplates and invoices. Turn it on in Settings to scan.',
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
    quality: QUALITY,
    base64: true,
    exif: false,
  });
  if (result.canceled || !result.assets[0]) return undefined;
  return toPayload(result.assets[0], role);
}

/** Opens the photo library, optionally allowing several at once. */
export async function pickPhotos(role?: string, limit = 4): Promise<CapturedImage[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Photo access is off', 'Turn on photo access in Settings to attach existing photos.');
    return [];
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: QUALITY,
    base64: true,
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    exif: false,
  });
  if (result.canceled) return [];
  return result.assets
    .map((asset) => toPayload(asset, role))
    .filter((image): image is CapturedImage => Boolean(image));
}

/** Rough decoded size of a base64 payload, for showing the user why a request is slow. */
export function approximateBytes(image: ImagePayload): number {
  return Math.round((image.data.length * 3) / 4);
}
