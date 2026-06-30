import { Employee } from '../types';

export interface FaceDescriptor {
  version: 1 | 2;
  vector: number[];
  capturedAt: string;
  source?: string;
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

const GRID_W = 16;
const GRID_H = 20;
const V2_LENGTH = GRID_W * GRID_H * 4;
export const FACE_MATCH_THRESHOLD = 0.18;
export const FACE_MATCH_MARGIN = 0.04;

export function getFaceDescriptors(employee: Employee): FaceDescriptor[] {
  const values = employee.faceDescriptors || [];
  return values.filter(item =>
    item.version === 2 &&
    Array.isArray(item.vector) &&
    item.vector.length === V2_LENGTH
  );
}

export function hasFaceEnrollment(employee: Employee): boolean {
  return getFaceDescriptors(employee).length > 0;
}

export function createFaceDescriptorFromVideo(video: HTMLVideoElement, source = 'camera'): FaceDescriptor {
  const canvas = document.createElement('canvas');
  canvas.width = GRID_W;
  canvas.height = GRID_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Camera descriptor canvas is unavailable.');
  if (!video.videoWidth || !video.videoHeight) throw new Error('Camera is not ready yet.');

  ctx.drawImage(video, 0, 0, GRID_W, GRID_H);
  const image = ctx.getImageData(0, 0, GRID_W, GRID_H).data;
  const luma: number[] = [];

  for (let i = 0; i < image.length; i += 4) {
    const r = image[i] / 255;
    const g = image[i + 1] / 255;
    const b = image[i + 2] / 255;
    luma.push(0.299 * r + 0.587 * g + 0.114 * b);
  }

  const mean = luma.reduce((sum, value) => sum + value, 0) / luma.length;
  const vector: number[] = [];

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const idx = y * GRID_W + x;
      const base = idx * 4;
      const r = image[base] / 255;
      const g = image[base + 1] / 255;
      const b = image[base + 2] / 255;
      const lum = luma[idx] - mean;
      const gx = x > 0 && x < GRID_W - 1 ? luma[idx + 1] - luma[idx - 1] : 0;
      const gy = y > 0 && y < GRID_H - 1 ? luma[idx + GRID_W] - luma[idx - GRID_W] : 0;

      vector.push(
        Number(lum.toFixed(4)),
        Number((r - g).toFixed(4)),
        Number((b - (r + g) / 2).toFixed(4)),
        Number(Math.sqrt(gx * gx + gy * gy).toFixed(4))
      );
    }
  }

  return {
    version: 2,
    vector,
    capturedAt: new Date().toISOString(),
    source,
  };
}

export async function assessBrowserFaceDetection(video: HTMLVideoElement): Promise<FaceFrameQuality | null> {
  const Detector = typeof window !== 'undefined' ? (window as any).FaceDetector : null;
  if (!Detector || !video.videoWidth || !video.videoHeight) return null;

  try {
    const detector = new Detector({ fastMode: true, maxDetectedFaces: 2 });
    const faces = await detector.detect(video);
    if (!Array.isArray(faces) || faces.length === 0) {
      return { ok: false, brightness: 0, contrast: 0, message: 'No face detected in camera. Put your face inside the oval and try again.' };
    }

    if (faces.length > 1) {
      return { ok: false, brightness: 0, contrast: 0, message: 'More than one face detected. Keep only one employee inside the camera frame.' };
    }

    const box = faces[0]?.boundingBox;
    if (!box) {
      return { ok: false, brightness: 0, contrast: 0, message: 'No full face detected. Move closer and keep your face inside the oval.' };
    }

    const faceCenterX = (Number(box.x || 0) + Number(box.width || 0) / 2) / video.videoWidth;
    const faceCenterY = (Number(box.y || 0) + Number(box.height || 0) / 2) / video.videoHeight;
    const faceWidth = Number(box.width || 0) / video.videoWidth;
    const faceHeight = Number(box.height || 0) / video.videoHeight;
    const centerIsInGuide =
      faceCenterX >= 0.39 &&
      faceCenterX <= 0.61 &&
      faceCenterY >= 0.34 &&
      faceCenterY <= 0.64;
    const sizeIsValid =
      faceWidth >= 0.22 &&
      faceWidth <= 0.58 &&
      faceHeight >= 0.28 &&
      faceHeight <= 0.74;

    if (!centerIsInGuide) {
      return { ok: false, brightness: 0, contrast: 0, message: 'Face is not inside the oval marker. Center your full face, then try again.' };
    }

    if (!sizeIsValid) {
      return { ok: false, brightness: 0, contrast: 0, message: 'Face is not fully visible. Move closer and keep the full face inside the oval.' };
    }

    return { ok: true, brightness: 0, contrast: 0, message: 'Face is centered inside the oval.' };
  } catch {
    return null;
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
      if (yNorm > 0.33 && yNorm < 0.49 && lum < 0.34) {
        if (x < width / 2) leftEyeDarkPixels += 1;
        else rightEyeDarkPixels += 1;
      }
      if (yNorm > 0.62 && yNorm < 0.80 && lum < 0.38) mouthDarkPixels += 1;
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
  if (a.version !== 2 || b.version !== 2 || a.vector.length !== b.vector.length) {
    return Number.POSITIVE_INFINITY;
  }

  let sum = 0;
  for (let i = 0; i < a.vector.length; i++) {
    const delta = a.vector[i] - b.vector[i];
    sum += delta * delta;
  }
  return Math.sqrt(sum / a.vector.length);
}

export function findBestFaceMatch(
  employees: Employee[],
  probe: FaceDescriptor,
  threshold = FACE_MATCH_THRESHOLD
): FaceMatch | null {
  let best: FaceMatch | null = null;
  let secondScore = Number.POSITIVE_INFINITY;
  let secondEmployeeId = '';

  for (const employee of employees) {
    for (const descriptor of getFaceDescriptors(employee)) {
      const score = compareFaceDescriptors(probe, descriptor);
      if (!Number.isFinite(score)) continue;
      if (!best || score < best.score) {
        if (best && best.employee.id !== employee.id) {
          secondScore = best.score;
          secondEmployeeId = best.employee.id;
        }
        best = { employee, score, margin: Number.POSITIVE_INFINITY };
      } else if (employee.id !== best.employee.id && score < secondScore) {
        secondScore = score;
        secondEmployeeId = employee.id;
      }
    }
  }

  if (!best || best.score > threshold) return null;
  const margin = secondScore - best.score;
  if (secondEmployeeId && Number.isFinite(secondScore) && margin < FACE_MATCH_MARGIN) return null;
  return { ...best, margin };
}
