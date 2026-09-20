import { FaceLandmarker, FilesetResolver } from './mediapipe/vision_bundle.mjs';

let detectorPromise;
let lastVideoTimestamp = 0;

async function detector() {
  detectorPromise ||= (async () => {
    const files = await FilesetResolver.forVisionTasks('./mediapipe/wasm');
    return FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: './mediapipe/face_landmarker.task', delegate: 'CPU' },
      runningMode: 'VIDEO', numFaces: 5,
      minFaceDetectionConfidence: .38, minFacePresenceConfidence: .38, minTrackingConfidence: .38,
    });
  })().catch(error => { detectorPromise = null; throw error; });
  return detectorPromise;
}

window.detectFaceGeometry = async source => {
  if (!(source instanceof HTMLVideoElement) || !source.videoWidth || !source.videoHeight) throw new Error('Camera video is not ready.');
  let now = performance.now();
  if (now <= lastVideoTimestamp) now = lastVideoTimestamp + 1;
  lastVideoTimestamp = now;
  const result = (await detector()).detectForVideo(source, now);
  return result.faceLandmarks.map(landmarks => {
    const xs = landmarks.map(point => point.x), ys = landmarks.map(point => point.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const leftEye = landmarks[33], rightEye = landmarks[263], nose = landmarks[1];
    const eyeDistance = leftEye && rightEye ? Math.abs(rightEye.x - leftEye.x) : 0;
    if (!nose || !leftEye || !rightEye || eyeDistance < .01) return null;
    const width = maxX - minX;
    const height = maxY - minY;
    return {
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      width,
      height,
      yaw: (nose.x - ((leftEye.x + rightEye.x) / 2)) / eyeDistance,
      box: { x: minX, y: minY, width, height }
    };
  }).filter(Boolean);
};

window.faceLandmarkerReady = detector();
