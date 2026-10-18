// Copies the face-recognition runtime and model weights from node_modules into the web app (public/face-models)
// and the Windows kiosk renderer (windows-kiosk/renderer/faceapi). Runs automatically before dev/build.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkg = path.join(root, 'node_modules', '@vladmandic', 'face-api');
const MODELS = ['tiny_face_detector_model', 'face_landmark_68_model', 'face_recognition_model'];

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const same = fs.existsSync(to) && fs.statSync(to).size === fs.statSync(from).size;
  if (!same) fs.copyFileSync(from, to);
}

if (!fs.existsSync(pkg)) {
  console.error('[face-models] @vladmandic/face-api is not installed. Run npm install.');
  process.exit(1);
}
for (const target of [path.join(root, 'public', 'face-models'), path.join(root, 'windows-kiosk', 'renderer', 'faceapi', 'models')]) {
  for (const model of MODELS) {
    copy(path.join(pkg, 'model', `${model}-weights_manifest.json`), path.join(target, `${model}-weights_manifest.json`));
    copy(path.join(pkg, 'model', `${model}.bin`), path.join(target, `${model}.bin`));
  }
}
copy(path.join(pkg, 'dist', 'face-api.esm.js'), path.join(root, 'windows-kiosk', 'renderer', 'faceapi', 'face-api.esm.js'));
console.log('[face-models] face recognition models ready');
