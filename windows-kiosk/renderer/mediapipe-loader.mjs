import { FaceLandmarker, FilesetResolver } from './mediapipe/vision_bundle.mjs';

let detectorPromise;

async function detector() {
  detectorPromise ||= (async () => {
    const files = await FilesetResolver.forVisionTasks('./mediapipe/wasm');
    return FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: './mediapipe/face_landmarker.task', delegate: 'CPU' },
      runningMode: 'VIDEO', numFaces: 2,
      minFaceDetectionConfidence: .55, minFacePresenceConfidence: .55, minTrackingConfidence: .55,
    });
  })().catch(error => { detectorPromise = null; throw error; });
  return detectorPromise;
}

window.detectFaceGeometry = async source => {
  if (!(source instanceof HTMLVideoElement) || !source.videoWidth || !source.videoHeight) throw new Error('Camera video is not ready.');
  const result = (await detector()).detectForVideo(source, performance.now());
  return result.faceLandmarks.map(landmarks => {
    const xs = landmarks.map(point => point.x), ys = landmarks.map(point => point.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const leftEye = landmarks[33], rightEye = landmarks[263], nose = landmarks[1];
    const eyeDistance = leftEye && rightEye ? Math.abs(rightEye.x - leftEye.x) : 0;
    if (!nose || !leftEye || !rightEye || eyeDistance < .01) throw new Error('Face landmarks are too small. Move closer.');
    return { centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2, width: maxX - minX, height: maxY - minY, yaw: (nose.x - ((leftEye.x + rightEye.x) / 2)) / eyeDistance };
  });
};

window.faceLandmarkerReady = detector();
