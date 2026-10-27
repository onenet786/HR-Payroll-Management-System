import { FaceLandmarker, FilesetResolver } from './mediapipe/vision_bundle.mjs';

// One landmarker per camera element: VIDEO mode tracks faces from frame to frame, so two cameras (entrance and exit)
// must not share one, and each needs its own increasing timestamps.
const detectors = new Map();
const lastTimestamps = new Map();

async function detector(key = 'default') {
  if (detectors.has(key)) return detectors.get(key);
  const promise = (async () => {
    const files = await FilesetResolver.forVisionTasks('./mediapipe/wasm');
    return FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: './mediapipe/face_landmarker.task', delegate: 'CPU' },
      runningMode: 'VIDEO', numFaces: 5,
      minFaceDetectionConfidence: .38, minFacePresenceConfidence: .38, minTrackingConfidence: .38,
    });
  })().catch(error => { detectors.delete(key); throw error; });
  detectors.set(key, promise);
  return promise;
}

window.detectFaceGeometry = async source => {
  // Webcam <video>, the IP camera's decoded frame <canvas>, or an <img>.
  const ready = source instanceof HTMLVideoElement ? source.videoWidth && source.videoHeight
    : source instanceof HTMLCanvasElement ? source.width && source.height
    : source instanceof HTMLImageElement ? source.complete && source.naturalWidth && source.naturalHeight : false;
  if (!ready) throw new Error('Camera video is not ready.');
  const key = source.id || 'default';
  let now = performance.now();
  const last = lastTimestamps.get(key) || 0;
  if (now <= last) now = last + 1;
  lastTimestamps.set(key, now);
  const result = (await detector(key)).detectForVideo(source, now);
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

window.faceLandmarkerReady = detector('webcamEl');
