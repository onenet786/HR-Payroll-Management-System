// Provider Console configuration (see provider/.env.example). On the server the console runs from its own folder
// (e.g. /www/hr-provider with .env and start.cjs) while the code lives in a release folder, so the .env of the
// working folder is read first; provider/.env next to the code is the fallback for development.
const path = require('node:path');
const PROVIDER_ROOT = path.resolve(__dirname, '..');
const workingEnv = path.resolve(process.cwd()) === path.resolve(PROVIDER_ROOT, '..') ? [] : [path.join(process.cwd(), '.env')]; // never the HR app's own .env
require('dotenv').config({ path: [...workingEnv, path.join(PROVIDER_ROOT, '.env'), path.join(PROVIDER_ROOT, '.env.local')], quiet: true });

const env = (name, fallback = '') => String(process.env[name] ?? fallback).trim();
const list = value => value.split(/[,\s]+/).map(item => item.trim()).filter(Boolean);

const config = {
  root: PROVIDER_ROOT,
  repoRoot: path.resolve(PROVIDER_ROOT, '..'),
  production: env('NODE_ENV') === 'production',
  port: Number(env('PROVIDER_PORT', '8200')),
  host: env('PROVIDER_HOST', '127.0.0.1'),
  publicUrl: env('PROVIDER_PUBLIC_URL', 'http://127.0.0.1:8200').replace(/\/+$/, ''),
  databaseUrl: env('PROVIDER_DATABASE_URL'),
  // PostgreSQL account allowed to create roles and databases (aaPanel: the postgres administrator).
  pgAdminUrl: env('PG_ADMIN_URL'),
  pgBinDir: env('PG_BIN_DIR'),
  templateDb: env('TEMPLATE_DB', 'hr_template'),
  baseDomain: env('BASE_DOMAIN', 'binishaqsoft.com').toLowerCase(),
  serverIp: env('SERVER_IP'),
  nameservers: list(env('PROVIDER_NAMESERVERS')).map(item => item.toLowerCase().replace(/\.$/, '')),
  clientsRoot: path.resolve(env('CLIENTS_ROOT', path.join(PROVIDER_ROOT, '..', '..', 'hr-clients'))),
  releasesRoot: path.resolve(env('RELEASES_ROOT', path.join(PROVIDER_ROOT, '..', '..', 'hr-releases'))),
  backupRoot: path.resolve(env('BACKUP_ROOT', path.join(PROVIDER_ROOT, '..', '..', 'hr-backups'))),
  clientPortStart: Number(env('CLIENT_PORT_START', '9101')),
  nodeVersion: env('AAPANEL_NODE_VERSION', 'v20.18.0'),
  aapanel: { url: env('AAPANEL_URL').replace(/\/+$/, ''), apiKey: env('AAPANEL_API_KEY'), runUser: env('AAPANEL_RUN_USER', 'www'), insecureTls: env('AAPANEL_INSECURE_TLS') === 'true' },
  wildcardCert: { certPath: env('WILDCARD_CERT_PATH'), keyPath: env('WILDCARD_KEY_PATH') },
  smtp: {
    host: env('SMTP_HOST'), port: env('SMTP_PORT', '587'), secure: env('SMTP_SECURE', 'false'), user: env('SMTP_USER'), pass: env('SMTP_PASS'), from: env('SMTP_FROM'),
  },
  sessionHours: Number(env('PROVIDER_SESSION_HOURS', '12')),
  // Lets an operator test the console on a PC without aaPanel: every aaPanel step becomes a manual checklist item.
  aapanelEnabled: Boolean(env('AAPANEL_URL') && env('AAPANEL_API_KEY')),
};

function assertConfig() {
  const missing = ['databaseUrl', 'pgAdminUrl'].filter(key => !config[key]);
  if (!process.env.MFA_ENCRYPTION_KEY) missing.push('MFA_ENCRYPTION_KEY');
  if (missing.length) throw new Error(`Provider Console configuration is missing: ${missing.join(', ')} (provider/.env).`);
}

module.exports = { config, assertConfig };
