import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';

export interface DetectedFaceGeometry {
  landmarks: NormalizedLandmark[];
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  yaw: number;
  box: { x: number; y: number; width: number; height: number };
}

let landmarkerPromise: Promise<FaceLandmarker> | null = null;
let lastVideoTimestamp = 0;

const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const CDN_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

async function createLandmarker(): Promise<FaceLandmarker> {
  let files;
  try {
    files = await FilesetResolver.forVisionTasks('./mediapipe/wasm');
  } catch (err) {
    console.warn('Local mediapipe wasm failed, falling back to CDN wasm:', err);
    files = await FilesetResolver.forVisionTasks(CDN_WASM);
  }

  try {
    return await FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: './mediapipe/face_landmarker.task', delegate: 'CPU' },
      runningMode: 'VIDEO',
      numFaces: 5,
      minFaceDetectionConfidence: 0.38,
      minFacePresenceConfidence: 0.38,
      minTrackingConfidence: 0.38,
    });
  } catch (err) {
    console.warn('Local mediapipe model failed, falling back to CDN model:', err);
    return await FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: CDN_MODEL, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numFaces: 5,
      minFaceDetectionConfidence: 0.38,
      minFacePresenceConfidence: 0.38,
      minTrackingConfidence: 0.38,
    });
  }
}

export function getFaceLandmarker(): Promise<FaceLandmarker> {
  landmarkerPromise ||= createLandmarker().catch(error => { landmarkerPromise = null; throw error; });
  return landmarkerPromise;
}

export async function detectFaceGeometry(video: HTMLVideoElement): Promise<DetectedFaceGeometry[]> {
  if (!video.videoWidth || !video.videoHeight) throw new Error('Camera video is not ready.');
  const landmarker = await getFaceLandmarker();
  let now = performance.now();
  if (now <= lastVideoTimestamp) {
    now = lastVideoTimestamp + 1;
  }
  lastVideoTimestamp = now;
  const result = landmarker.detectForVideo(video, now);
  return result.faceLandmarks.map(landmarks => {
    const xs = landmarks.map(point => point.x);
    const ys = landmarks.map(point => point.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const leftEye = landmarks[33], rightEye = landmarks[263], nose = landmarks[1];
    const eyeDistance = leftEye && rightEye ? Math.abs(rightEye.x - leftEye.x) : 0;
    if (!nose || !leftEye || !rightEye || eyeDistance < 0.01) throw new Error('Face landmarks are too small. Move closer.');
    const width = maxX - minX;
    const height = maxY - minY;
    return {
      landmarks,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      width,
      height,
      yaw: (nose.x - ((leftEye.x + rightEye.x) / 2)) / eyeDistance,
      box: { x: minX, y: minY, width, height },
    };
  });
}

