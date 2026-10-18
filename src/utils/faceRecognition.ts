import { Employee } from '../types';
import { isValidLivenessAttestation, selectBestFace } from './faceLiveness';
import { detectFaceGeometry } from './faceLandmarker';
import { computeFaceEmbedding, type FaceBox } from './faceEmbedding';

export interface FaceDescriptor {
  version: 1 | 2 | 3 | 4;
  vector: number[];
  capturedAt: string;
  source?: string;
  liveness?: {
    method: 'active-turn-v1';
    verifiedAt: string;
    summary: { order: ['left' | 'right', 'left' | 'right']; durationMs: number; frameCounts: [number, number, number, number, number]; maxLeftYaw: number; maxRightYaw: number; maxCenterDrift: number; maxScaleChange: number };
  };
}

export interface FaceMatch {
  employee: Employee;
  score: number;
  margin: number;
}

export interface FaceFrameQuality {
  ok: boolean;
  brightness: number;
  contrast: number;
  message: string;
}

// Identity embeddings (version 4): 128 numbers from face-api; Euclidean distance between two faces.
// The same person is typically below ~0.40 and different people above ~0.55.
export const FACE_DESCRIPTOR_VERSION = 4;
export const FACE_DESCRIPTOR_LENGTH = 128;
export const FACE_MATCH_THRESHOLD = 0.45; // identify without an employee code
export const FACE_VERIFY_THRESHOLD = 0.5; // confirm one named employee
export const FACE_MATCH_MARGIN = 0.06; // runner-up employee must be at least this much further away
export const FACE_STRONG_DISTANCE = 0.25; // distance that counts as a 100% match

export function getFaceDescriptors(employee: Employee): FaceDescriptor[] {
  const values = employee.faceDescriptors || [];
  return values.filter(item =>
    item.version === FACE_DESCRIPTOR_VERSION &&
    Array.isArray(item.vector) &&
    item.vector.length === FACE_DESCRIPTOR_LENGTH &&
    isValidLivenessAttestation(item.liveness)
  );
}

export function hasFaceEnrollment(employee: Employee): boolean {
  return getFaceDescriptors(employee).length > 0;
}

/** Identity embedding for the face inside `cropBox` (or the most prominent face). Throws if no clear face is visible. */
export async function createFaceDescriptorFromVideo(
  video: HTMLVideoElement,
  source = 'camera',
  cropBox?: FaceBox
): Promise<FaceDescriptor> {
  if (!video.videoWidth || !video.videoHeight) throw new Error('Camera is not ready yet.');
  // Without a box, let the landmark detector find the face first: the recognition detector works far more
  // reliably on a tight crop than on a whole, dim webcam frame where the face is small.
  let box = cropBox;
  if (!box) {
    try { box = selectBestFace(await detectFaceGeometry(video)).box; } catch { box = undefined; }
  }
  const vector = await computeFaceEmbedding(video, box);
  return { version: FACE_DESCRIPTOR_VERSION, vector, capturedAt: new Date().toISOString(), source };
}

export async function assessBrowserFaceDetection(video: HTMLVideoElement): Promise<FaceFrameQuality | null> {
  try {
    const faces = await detectFaceGeometry(video);
    if (faces.length === 0) {
      return { ok: false, brightness: 0, contrast: 0, message: 'No face detected in camera. Put your face inside the oval and try again.' };
    }

    const face = selectBestFace(faces);
    const { centerX: faceCenterX, centerY: faceCenterY, width: faceWidth, height: faceHeight } = face;
    const centerIsInGuide =
      faceCenterX >= 0.28 &&
      faceCenterX <= 0.72 &&
      faceCenterY >= 0.18 &&
      faceCenterY <= 0.82;
    const sizeIsValid =
      faceWidth >= 0.14 &&
      faceWidth <= 0.72 &&
      faceHeight >= 0.18 &&
      faceHeight <= 0.88;

    if (!centerIsInGuide) {
      return { ok: false, brightness: 0, contrast: 0, message: 'Face is not inside the oval marker. Center your full face, then try again.' };
    }

    if (!sizeIsValid) {
      return { ok: false, brightness: 0, contrast: 0, message: 'Face is not fully visible. Move closer and keep the full face inside the oval.' };
    }

    return { ok: true, brightness: 0, contrast: 0, message: 'Face is centered inside the oval.' };
  } catch (error) {
    return { ok: false, brightness: 0, contrast: 0, message: error instanceof Error ? error.message : 'Face landmark model could not start.' };
  }
}

export function assessFaceFrame(video: HTMLVideoElement): FaceFrameQuality {
  const width = 48;
  const height = 60;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || !video.videoWidth || !video.videoHeight) {
    return { ok: false, brightness: 0, contrast: 0, message: 'Camera is not ready yet.' };
  }

  ctx.drawImage(video, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height).data;
  const values: number[] = [];
  let skinPixels = 0;
  let ovalPixels = 0;
  let leftEyeDarkPixels = 0;
  let rightEyeDarkPixels = 0;
  let mouthDarkPixels = 0;
  let centerSkinPixels = 0;
  let leftSkinPixels = 0;
  let rightSkinPixels = 0;
  let skinMinX = width;
  let skinMaxX = -1;
  let skinMinY = height;
  let skinMaxY = -1;
  let skinSumX = 0;
  let skinSumY = 0;
  let symmetryDiff = 0;
  let symmetryPairs = 0;

  const lumaAt = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return (0.299 * image[i] + 0.587 * image[i + 1] + 0.114 * image[i + 2]) / 255;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = image[i] / 255;
      const g = image[i + 1] / 255;
      const b = image[i + 2] / 255;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      values.push(lum);

      const nx = (x - width / 2) / (width * 0.34);
      const ny = (y - height / 2) / (height * 0.43);
      const inOval = nx * nx + ny * ny <= 1;
      if (!inOval) continue;

      ovalPixels += 1;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const skinLike = r > 0.22 && g > 0.16 && b > 0.10 && r > b * 1.06 && max - min > 0.045;
      if (skinLike) {
        skinPixels += 1;
        skinMinX = Math.min(skinMinX, x);
        skinMaxX = Math.max(skinMaxX, x);
        skinMinY = Math.min(skinMinY, y);
        skinMaxY = Math.max(skinMaxY, y);
        skinSumX += x;
        skinSumY += y;
        if (x >= 17 && x <= 31 && y >= 18 && y <= 42) centerSkinPixels += 1;
        if (x < width / 2) leftSkinPixels += 1;
        else rightSkinPixels += 1;
      }

      const yNorm = y / height;
      if (yNorm > 0.28 && yNorm < 0.54 && lum < 0.44) {
        if (x < width / 2) leftEyeDarkPixels += 1;
        else rightEyeDarkPixels += 1;
      }
      if (yNorm > 0.58 && yNorm < 0.83 && lum < 0.46) mouthDarkPixels += 1;
    }
  }

  for (let y = 8; y < height - 8; y += 2) {
    for (let x = 8; x < width / 2 - 2; x += 2) {
      symmetryDiff += Math.abs(lumaAt(x, y) - lumaAt(width - 1 - x, y));
      symmetryPairs += 1;
    }
  }

  const brightness = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - brightness, 2), 0) / values.length;
  const contrast = Math.sqrt(variance);
  const skinRatio = ovalPixels ? skinPixels / ovalPixels : 0;
  const leftEyeRatio = ovalPixels ? leftEyeDarkPixels / ovalPixels : 0;
  const rightEyeRatio = ovalPixels ? rightEyeDarkPixels / ovalPixels : 0;
  const mouthRatio = ovalPixels ? mouthDarkPixels / ovalPixels : 0;
  const symmetry = symmetryPairs ? symmetryDiff / symmetryPairs : 1;
  const skinCenterX = skinPixels ? (skinSumX / skinPixels) / width : 0;
  const skinCenterY = skinPixels ? (skinSumY / skinPixels) / height : 0;
  const skinWidthRatio = skinPixels ? (skinMaxX - skinMinX + 1) / width : 0;
  const skinHeightRatio = skinPixels ? (skinMaxY - skinMinY + 1) / height : 0;
  const centerSkinRatio = centerSkinPixels / (15 * 25);
  const skinBalance = Math.min(leftSkinPixels, rightSkinPixels) / Math.max(1, Math.max(leftSkinPixels, rightSkinPixels));

  if (brightness < 0.18) return { ok: false, brightness, contrast, message: 'Face area is too dark. Add light and try again.' };
  if (brightness > 0.88) return { ok: false, brightness, contrast, message: 'Face area is overexposed. Reduce glare and try again.' };
  if (contrast < 0.03) return { ok: false, brightness, contrast, message: 'No face detected in camera. Move closer and keep your face inside the oval.' };
  if (skinRatio < 0.14 || skinRatio > 0.76) return { ok: false, brightness, contrast, message: 'No face detected in camera. Put a full face inside the oval marker.' };
  if (skinCenterX < 0.40 || skinCenterX > 0.60 || skinCenterY < 0.34 || skinCenterY > 0.66) {
    return { ok: false, brightness, contrast, message: 'Face is not inside the oval marker. Center your full face, then try again.' };
  }
  if (skinWidthRatio < 0.16 || skinWidthRatio > 0.88 || skinHeightRatio < 0.22 || skinHeightRatio > 0.92) {
    return { ok: false, brightness, contrast, message: 'Face is not fully visible. Move closer and keep the full face inside the oval.' };
  }
  if (centerSkinRatio < 0.18 || skinBalance < 0.50) {
    return { ok: false, brightness, contrast, message: 'No centered full face detected. Keep your face straight inside the oval.' };
  }
  if (leftEyeRatio < 0.020 || rightEyeRatio < 0.020 || mouthRatio < 0.016) {
    return { ok: false, brightness, contrast, message: 'No full face detected. Keep both eyes and mouth inside the oval.' };
  }
  const eyeBalance = Math.min(leftEyeRatio, rightEyeRatio) / Math.max(leftEyeRatio, rightEyeRatio);
  if (eyeBalance < 0.30) {
    return { ok: false, brightness, contrast, message: 'Face is not straight. Look directly at the camera.' };
  }
  if (symmetry > 0.28) return { ok: false, brightness, contrast, message: 'Face is not centered. Look straight at the camera inside the oval.' };

  return { ok: true, brightness, contrast, message: 'Face frame looks ready.' };
}

export function compareFaceDescriptors(a: FaceDescriptor, b: FaceDescriptor): number {
  if (a.version !== FACE_DESCRIPTOR_VERSION || b.version !== FACE_DESCRIPTOR_VERSION || a.vector.length !== b.vector.length) {
    return Number.POSITIVE_INFINITY;
  }
  let sum = 0;
  for (let i = 0; i < a.vector.length; i++) {
    const delta = a.vector[i] - b.vector[i];
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

/**
 * Closest enrolled employee, or null when nobody is within `threshold`, when the runner-up employee is too
 * close to call (`margin`), or when the best match is in `excludeEmployeeIds` (already matched to another face).
 */
export function findBestFaceMatch(
  employees: Employee[],
  probe: FaceDescriptor,
  threshold = FACE_MATCH_THRESHOLD,
  options: { margin?: number; excludeEmployeeIds?: string[] } = {}
): FaceMatch | null {
  const scored = (employees || [])
    .map(employee => {
      let minScore = Number.POSITIVE_INFINITY;
      for (const descriptor of getFaceDescriptors(employee)) minScore = Math.min(minScore, compareFaceDescriptors(probe, descriptor));
      return { employee, score: minScore };
    })
    .filter(item => Number.isFinite(item.score))
    .sort((a, b) => a.score - b.score);
  const best = scored[0];
  if (!best || best.score > threshold) return null;
  const margin = scored[1] ? scored[1].score - best.score : Number.POSITIVE_INFINITY;
  if (margin < (options.margin ?? FACE_MATCH_MARGIN)) return null;
  if (options.excludeEmployeeIds?.includes(best.employee.id)) return null;
  return { employee: best.employee, score: best.score, margin };
}
