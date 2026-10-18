// Face identity embeddings (face-api: 68-point alignment + dlib ResNet, 128 numbers). Loaded on first use so
// pages without a camera never download TensorFlow or the ~7 MB of model weights.
type FaceApi = typeof import('@vladmandic/face-api');

const modelUrl = () => `${import.meta.env?.BASE_URL ?? './'}face-models`;
const CROP_SIZE = 320;
const DETECT_SIZE = 224; // face already located by MediaPipe
const FULL_FRAME_SIZE = 320; // no box: find the face in the whole frame
let loading: Promise<FaceApi> | null = null;
let cropCanvas: HTMLCanvasElement | null = null;

export interface FaceBox { x: number; y: number; width: number; height: number }

const LOAD_TIMEOUT_MS = 120_000;

/** A download that never finishes reports an error instead of leaving the camera screen loading forever. */
export function loadFaceEmbedder(): Promise<FaceApi> {
  loading ||= Promise.race([loadModels(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error(
    'The face recognition model did not finish downloading. Check the internet connection and press Ctrl+F5 to reload, then try again.',
  )), LOAD_TIMEOUT_MS))]).catch(error => { loading = null; throw error; });
  return loading;
}

function loadModels(): Promise<FaceApi> {
  return (async () => {
    const faceapi = await import('@vladmandic/face-api');
    // The bundled TensorFlow build exposes these at runtime but its type declarations omit them.
    const tf = faceapi.tf as unknown as { setBackend(name: string): Promise<boolean>; ready(): Promise<void> };
    try { await tf.setBackend('webgl'); } catch { await tf.setBackend('cpu'); }
    await tf.ready();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl()),
      faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl()),
      faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl()),
    ]);
    return faceapi;
  })().catch(error => {
    // Empty weights mean something between the server and the browser blocked the model files.
    if (error instanceof Error && /tensor should have \d+ values but has/.test(error.message)) {
      throw new Error('The face recognition model files were blocked or arrived empty. Press Ctrl+F5 to reload; if it persists, allow this site\'s /face-models/ files in the antivirus or proxy.');
    }
    throw error;
  });
}

function cropAround(video: HTMLVideoElement, box?: FaceBox | null): HTMLCanvasElement {
  const sw = video.videoWidth, sh = video.videoHeight;
  if (!sw || !sh) throw new Error('Camera is not ready yet.');
  let sx = 0, sy = 0, cw = sw, ch = sh;
  if (box && box.width > 0.05 && box.height > 0.05) {
    const pad = 0.45;
    sx = Math.max(0, (box.x - box.width * pad) * sw);
    sy = Math.max(0, (box.y - box.height * pad) * sh);
    cw = Math.min(sw - sx, box.width * (1 + pad * 2) * sw);
    ch = Math.min(sh - sy, box.height * (1 + pad * 2) * sh);
  }
  // Fixed canvas size: TensorFlow compiles GPU programs per input size, so this compiles once, not per punch.
  const canvas = (cropCanvas ||= document.createElement('canvas'));
  canvas.width = canvas.height = CROP_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Camera canvas is unavailable.');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CROP_SIZE, CROP_SIZE);
  const scale = CROP_SIZE / Math.max(cw, ch);
  const dw = cw * scale, dh = ch * scale;
  ctx.drawImage(video, sx, sy, cw, ch, (CROP_SIZE - dw) / 2, (CROP_SIZE - dh) / 2, dw, dh);
  return canvas;
}

/** 128-number embedding of the face inside `box` (or the most prominent face). Throws if no clear face. */
export async function computeFaceEmbedding(video: HTMLVideoElement, box?: FaceBox | null): Promise<number[]> {
  const faceapi = await loadFaceEmbedder();
  const canvas = cropAround(video, box);
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: box ? DETECT_SIZE : FULL_FRAME_SIZE, scoreThreshold: 0.35 });
  const result = await faceapi.detectSingleFace(canvas, options).withFaceLandmarks().withFaceDescriptor();
  if (!result) throw new Error('No clear face found. Look straight at the camera.');
  return Array.from(result.descriptor, value => Math.round(value * 1e6) / 1e6);
}
