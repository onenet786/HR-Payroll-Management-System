// Raises the kiosk build number (patch) before every `npm run kiosk:build`, so each installer is a newer
// version than the last and upgrades cleanly. The version lives in windows-kiosk/electron-builder.json.
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'windows-kiosk', 'electron-builder.json');
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
const current = String(config.extraMetadata?.version || '1.0.0');
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
if (!match) throw new Error(`Kiosk version "${current}" is not MAJOR.MINOR.PATCH`);
const next = `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
config.extraMetadata = { ...config.extraMetadata, version: next };
fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
console.log(`[kiosk] version ${current} -> ${next}`);
