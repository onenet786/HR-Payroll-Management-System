import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';

export interface DetectedFaceGeometry {
  landmarks: NormalizedLandmark[];
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  yaw: number;
}

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

async function createLandmarker(): Promise<FaceLandmarker> {
  const files = await FilesetResolver.forVisionTasks('./mediapipe/wasm');
  return FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: './mediapipe/face_landmarker.task', delegate: 'CPU' },
    runningMode: 'VIDEO', numFaces: 2,
    minFaceDetectionConfidence: 0.55, minFacePresenceConfidence: 0.55, minTrackingConfidence: 0.55,
  });
}

export function getFaceLandmarker(): Promise<FaceLandmarker> {
  landmarkerPromise ||= createLandmarker().catch(error => { landmarkerPromise = null; throw error; });
  return landmarkerPromise;
}

export async function detectFaceGeometry(video: HTMLVideoElement): Promise<DetectedFaceGeometry[]> {
  if (!video.videoWidth || !video.videoHeight) throw new Error('Camera video is not ready.');
  const result = (await getFaceLandmarker()).detectForVideo(video, performance.now());
  return result.faceLandmarks.map(landmarks => {
    const xs = landmarks.map(point => point.x);
    const ys = landmarks.map(point => point.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const leftEye = landmarks[33], rightEye = landmarks[263], nose = landmarks[1];
    const eyeDistance = leftEye && rightEye ? Math.abs(rightEye.x - leftEye.x) : 0;
    if (!nose || !leftEye || !rightEye || eyeDistance < 0.01) throw new Error('Face landmarks are too small. Move closer.');
    return {
      landmarks, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2,
      width: maxX - minX, height: maxY - minY,
      yaw: (nose.x - ((leftEye.x + rightEye.x) / 2)) / eyeDistance,
    };
  });
}
