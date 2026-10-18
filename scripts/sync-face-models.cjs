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
// The kiosk reads its models from disk, so it keeps the package's file names.
const kioskModels = path.join(root, 'windows-kiosk', 'renderer', 'faceapi', 'models');
for (const model of MODELS) {
  copy(path.join(pkg, 'model', `${model}-weights_manifest.json`), path.join(kioskModels, `${model}-weights_manifest.json`));
  copy(path.join(pkg, 'model', `${model}.bin`), path.join(kioskModels, `${model}.bin`));
}

// Browsers, antivirus and proxies often block or empty files ending in .bin, which leaves face recognition
// loading forever or failing with "the tensor should have N values but has 0". The web copy serves the
// weights without an extension (face-api's original naming) and points the manifests at those names.
const webModels = path.join(root, 'public', 'face-models');
for (const model of MODELS) {
  const weights = `${model}-shard1`;
  copy(path.join(pkg, 'model', `${model}.bin`), path.join(webModels, weights));
  const manifest = JSON.parse(fs.readFileSync(path.join(pkg, 'model', `${model}-weights_manifest.json`), 'utf8'));
  for (const group of manifest) group.paths = [weights];
  const manifestPath = path.join(webModels, `${model}-weights_manifest.json`);
  const text = JSON.stringify(manifest);
  if (!fs.existsSync(manifestPath) || fs.readFileSync(manifestPath, 'utf8') !== text) fs.writeFileSync(manifestPath, text);
  fs.rmSync(path.join(webModels, `${model}.bin`), { force: true });
}
copy(path.join(pkg, 'dist', 'face-api.esm.js'), path.join(root, 'windows-kiosk', 'renderer', 'faceapi', 'face-api.esm.js'));
console.log('[face-models] face recognition models ready');
