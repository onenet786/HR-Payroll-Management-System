// Face identity embeddings for the kiosk: face-api aligns the face on 68 landmarks and produces a 128-number
// descriptor (dlib ResNet). MediaPipe still handles detection, tracking and liveness; this runs only at punch time.
import * as faceapi from './faceapi/face-api.esm.js';

const MODEL_URL = './faceapi/models';
const CROP_SIZE = 320;
const DETECT_SIZE = 224; // face already cropped by MediaPipe
const FULL_FRAME_SIZE = 320; // no box: find the face in the whole frame
let readyPromise;
let cropCanvas;

function ready() {
  readyPromise ||= (async () => {
    try { await faceapi.tf.setBackend('webgl'); } catch { await faceapi.tf.setBackend('cpu'); }
    await faceapi.tf.ready();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    // Warm up every program a punch will use (both detector sizes, landmarks, recognition) so the first
    // employee does not wait for GPU compilation.
    const blank = document.createElement('canvas');
    blank.width = blank.height = CROP_SIZE;
    const canvas = cropAround(blank, null);
    for (const inputSize of [DETECT_SIZE, FULL_FRAME_SIZE]) {
      try { await faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize })); } catch { /* blank frame */ }
    }
    const chip = await faceapi.extractFaces(canvas, [new faceapi.Rect(80, 80, 160, 160)]);
    await faceapi.nets.faceLandmark68Net.detectLandmarks(chip[0]);
    await faceapi.nets.faceRecognitionNet.computeFaceDescriptor(chip[0]);
    window.faceEmbeddingBackend = faceapi.tf.getBackend();
  })().catch(error => { readyPromise = null; throw error; });
  return readyPromise;
}

function sourceSize(source) {
  if (source instanceof HTMLVideoElement) return [source.videoWidth, source.videoHeight];
  if (source instanceof HTMLCanvasElement) return [source.width, source.height];
  return [source.naturalWidth, source.naturalHeight];
}

/** Crops around a normalized face box (with margin so the landmark aligner sees the whole head). */
function cropAround(source, box) {
  const [sw, sh] = sourceSize(source);
  if (!sw || !sh) throw new Error('Camera is not ready yet.');
  let sx = 0, sy = 0, cw = sw, ch = sh;
  if (box) {
    const pad = 0.45;
    sx = Math.max(0, (box.x - box.width * pad) * sw);
    sy = Math.max(0, (box.y - box.height * pad) * sh);
    cw = Math.min(sw - sx, box.width * (1 + pad * 2) * sw);
    ch = Math.min(sh - sy, box.height * (1 + pad * 2) * sh);
  }
  // Always the same canvas size: TensorFlow compiles its GPU programs per input size, so a fixed size means
  // they compile once at warm-up instead of on every punch.
  const canvas = cropCanvas ||= document.createElement('canvas');
  canvas.width = canvas.height = CROP_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CROP_SIZE, CROP_SIZE);
  const scale = CROP_SIZE / Math.max(cw, ch);
  const dw = cw * scale, dh = ch * scale;
  ctx.drawImage(source, sx, sy, cw, ch, (CROP_SIZE - dw) / 2, (CROP_SIZE - dh) / 2, dw, dh);
  return canvas;
}

/**
 * Returns a 128-number identity embedding for the face inside `box` (or the most prominent face in the frame).
 * Throws when no clear face is found, so a blurred or turned face is never matched.
 */
window.computeFaceEmbedding = async (source, box = null) => {
  await ready();
  const canvas = cropAround(source, box);
  // First the usual detector settings; then, for the same frame, a larger input and a lower score. MediaPipe has
  // already found a face in this box, so the second try only helps a tilted or distant face to be aligned; whether it
  // is the right person is still decided by the strict descriptor distance in the kiosk process.
  const attempts = box
    ? [{ inputSize: DETECT_SIZE, scoreThreshold: 0.35 }, { inputSize: FULL_FRAME_SIZE, scoreThreshold: 0.2 }]
    : [{ inputSize: FULL_FRAME_SIZE, scoreThreshold: 0.35 }, { inputSize: FULL_FRAME_SIZE, scoreThreshold: 0.25 }];
  let result = null;
  for (const attempt of attempts) {
    result = await faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions(attempt)).withFaceLandmarks().withFaceDescriptor();
    if (result) break;
  }
  if (!result) throw new Error('No clear face found. Look straight at the camera.');
  const faceWidth = result.detection.box.width / canvas.width;
  if (box && faceWidth < 0.25) throw new Error('Face is too small. Move closer to the camera.');
  return { vector: Array.from(result.descriptor, value => Math.round(value * 1e6) / 1e6), detectionScore: result.detection.score };
};

window.faceEmbeddingReady = ready();
