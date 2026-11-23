import { FaceLandmarker, FilesetResolver, ObjectDetector, PoseLandmarker } from './mediapipe/vision_bundle.mjs';

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
      runningMode: 'VIDEO', numFaces: 5, outputFaceBlendshapes: true,
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
  return result.faceLandmarks.map((landmarks, index) => {
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
      // 0 = eyes open, 1 = closed (average of both eyes); used by the Multi-Face passive live check.
      blink: blinkScore(result.faceBlendshapes?.[index]),
      box: { x: minX, y: minY, width, height }
    };
  }).filter(Boolean);
};

function blinkScore(blendshapes) {
  const categories = blendshapes?.categories || [];
  const left = categories.find(item => item.categoryName === 'eyeBlinkLeft')?.score;
  const right = categories.find(item => item.categoryName === 'eyeBlinkRight')?.score;
  return Number.isFinite(left) && Number.isFinite(right) ? Math.round(((left + right) / 2) * 1000) / 1000 : null;
}

// ─── Scene check for the Multi-Face passive live check ──────────────────────────────────────────────────────────
// Runs only when a recognised face is about to punch. Looks at the area AROUND the face, cut out of the full frame
// and enlarged, because a phone or a pair of shoulders 3-4 m from the camera is only a few pixels in the whole frame.
// The main process decides (windows-kiosk/passive-liveness.cjs); this only measures.
let objectDetector = null;
let poseLandmarker = null;
async function sceneModels() {
  const files = await FilesetResolver.forVisionTasks('./mediapipe/wasm');
  if (!objectDetector) {
    objectDetector = ObjectDetector.createFromOptions(files, {
      baseOptions: { modelAssetPath: './mediapipe/efficientdet_lite0.tflite', delegate: 'CPU' },
      runningMode: 'IMAGE', scoreThreshold: 0.3, maxResults: 10,
      categoryAllowlist: ['cell phone', 'tv', 'laptop', 'book'],
    }).catch(error => { objectDetector = null; throw error; });
  }
  if (!poseLandmarker) {
    poseLandmarker = PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: './mediapipe/pose_landmarker_lite.task', delegate: 'CPU' },
      runningMode: 'IMAGE', numPoses: 4,
      minPoseDetectionConfidence: 0.4, minPosePresenceConfidence: 0.4,
    }).catch(error => { poseLandmarker = null; throw error; });
  }
  return Promise.all([objectDetector, poseLandmarker]);
}

function sourceDimensions(source) {
  if (source instanceof HTMLVideoElement) return [source.videoWidth, source.videoHeight];
  if (source instanceof HTMLImageElement) return [source.naturalWidth, source.naturalHeight];
  return [source.width, source.height];
}

// Copies region r (frame pixels) of the source onto a canvas, scaled so its longer side is `size` pixels.
function cutOut(source, r, size) {
  const scale = size / Math.max(r.w, r.h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(r.w * scale));
  canvas.height = Math.max(1, Math.round(r.h * scale));
  canvas.getContext('2d').drawImage(source, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
  return { canvas, scale };
}

function clampRegion(x, y, w, h, fw, fh) {
  const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(fw, Math.ceil(x + w)), y1 = Math.min(fh, Math.ceil(y + h));
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/**
 * Measures the scene around one face. `faceBox` is normalised (0..1) like detectFaceGeometry's box. Returns pixel
 * coordinates of the frame: { frame, face, devices: [{label, score, box}], bodies: [{nose, ls, rs}], bodyRegionCut }.
 */
window.measureFaceScene = async (source, faceBox) => {
  const [fw, fh] = sourceDimensions(source);
  if (!fw || !fh) throw new Error('Camera video is not ready.');
  const face = { x: faceBox.x * fw, y: faceBox.y * fh, w: faceBox.width * fw, h: faceBox.height * fh };
  const [objects, poses] = await sceneModels();

  // Devices: a square 4 face-sizes wide around the face.
  const side = 4 * Math.max(face.w, face.h);
  const deviceRegion = clampRegion(face.x + face.w / 2 - side / 2, face.y + face.h / 2 - side / 2, side, side, fw, fh);
  const deviceCut = cutOut(source, deviceRegion, 512);
  const devices = (objects.detect(deviceCut.canvas).detections || []).map(item => {
    const b = item.boundingBox, c = item.categories?.[0];
    return {
      label: c?.categoryName || '', score: c?.score || 0,
      box: { x: deviceRegion.x + b.originX / deviceCut.scale, y: deviceRegion.y + b.originY / deviceCut.scale, w: b.width / deviceCut.scale, h: b.height / deviceCut.scale },
    };
  });

  // Bodies: from one face-height above the face to five below, three face-widths to each side.
  const bodyRegion = clampRegion(face.x - 3 * face.w, face.y - face.h, 7 * face.w, 6 * face.h, fw, fh);
  // Shoulders are about 1.5 face-heights below the top of the face; with less room below the face than that (a
  // close webcam, a face at the bottom edge) the body cannot be judged and that part of the check is skipped.
  const bodyRegionCut = fh - (face.y + face.h) < face.h * 1.2;
  const bodyCut = cutOut(source, bodyRegion, 512);
  const toFrame = p => p && ({ x: bodyRegion.x + p.x * bodyCut.canvas.width / bodyCut.scale, y: bodyRegion.y + p.y * bodyCut.canvas.height / bodyCut.scale, v: p.visibility ?? 0 });
  const bodies = (poses.detect(bodyCut.canvas).landmarks || []).map(points => ({ nose: toFrame(points[0]), ls: toFrame(points[11]), rs: toFrame(points[12]) }));

  return { frame: { w: fw, h: fh }, face, devices, bodies, bodyRegionCut };
};

// Loads the scene models ahead of the first punch (they take a second or two to start).
window.prepareFaceScene = () => sceneModels().then(() => true, () => false);

window.faceLandmarkerReady = detector('webcamEl');
