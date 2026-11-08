#!/usr/bin/env node
// OneNet Provider Console — command line (aaPanel Terminal and aaPanel Cron).
//
//   node provider/cli.cjs migrate                         create/upgrade the console's own tables
//   node provider/cli.cjs create-owner <email> "<name>"   first owner account (prints a temporary password)
//   node provider/cli.cjs releases                        list installed application releases
//   node provider/cli.cjs refresh-template [release]      create/refresh the template database
//   node provider/cli.cjs nightly                         backup-all + optimise databases + check-domains + health  (aaPanel Cron, 02:00)
//   node provider/cli.cjs health                          health of every client           (aaPanel Cron, every 10 min)
//   node provider/cli.cjs backup-all | check-domains
const crypto = require('node:crypto');
const { config, assertConfig } = require('./lib/config.cjs');

(async () => {
  assertConfig();
  const [command, ...args] = process.argv.slice(2);
  const { pool, migrate } = require('./lib/db.cjs');
  const print = value => console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  try {
    await migrate();
    const clients = require('./lib/clients.cjs');
    switch (command) {
      case 'migrate': print('Provider Console tables are up to date.'); break;
      case 'create-owner': {
        const [email, name = 'Owner'] = args;
        if (!email) throw new Error('Usage: create-owner <email> "<name>"');
        const password = process.env.PROVIDER_OWNER_PASSWORD || `${crypto.randomBytes(12).toString('base64url')}-${crypto.randomInt(10, 99)}`;
        await require('./lib/auth.cjs').createUser({ email, name, role: 'owner', password });
        await require('./lib/audit.cjs').audit('cli', 'provider_user_created', { target: email, detail: { role: 'owner' } });
        print(`Owner ${email} created.\nTemporary password: ${password}\nSign in at ${config.publicUrl} and set up the authenticator app.`);
        break;
      }
      case 'releases': print(require('./lib/instances.cjs').listReleases()); break;
      case 'refresh-template': print(await clients.refreshTemplate(args[0], 'cli')); break;
      case 'health': print(await clients.checkAllHealth()); break;
      case 'check-domains': print(await clients.checkAllDomains()); break;
      case 'backup-all': print(await clients.backupAll('cron')); break;
      case 'nightly': {
        const backups = await clients.backupAll('nightly');
        // Optimise only clients whose backup succeeded tonight (deep optimisation must follow a good backup).
        const optimized = backups.every(item => item.ok) ? await clients.optimizeAll() : [];
        const domains = await clients.checkAllDomains();
        const health = await clients.checkAllHealth();
        print({ backups, optimized, domains, health: health.map(item => ({ client: item.client, ok: item.ok, error: item.error })) });
        if (backups.some(item => !item.ok) || domains.problems.length || health.some(item => !item.ok)) process.exitCode = 2;
        break;
      }
      default:
        print('Commands: migrate | create-owner <email> "<name>" | releases | refresh-template [release] | nightly | health | check-domains | backup-all');
        process.exitCode = command ? 1 : 0;
    }
  } finally {
    await pool.end().catch(() => undefined);
    setTimeout(() => process.exit(process.exitCode || 0), 200).unref();
  }
})().catch(error => { console.error(error.message); process.exit(1); });
