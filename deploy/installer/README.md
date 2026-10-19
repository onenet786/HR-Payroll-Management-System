# One-click server installer

This folder builds one file, `hrpayroll-setup-<version>.run`, that turns an Ubuntu 22.04/24.04 server into a working HR & Payroll installation for a new client. It works on a plain Ubuntu server and on servers with aaPanel. The whole install takes about 3–5 minutes.

## 1. Build the bundle (on your PC)

```powershell
npm run server:bundle
# or: node deploy/installer/build-bundle.mjs --version 1.5.0
```

This writes the following files to `deploy/installer/dist/`:

| File | Purpose |
| --- | --- |
| `hrpayroll-setup-<v>.run` | Self-extracting installer: setup wizard, app, migrations, and `hrpayrollctl`. |
| `hrpayroll-app-<v>.tar.gz` | The app only, for `hrpayrollctl update`. |
| `SHA256SUMS` | Checksums for both files. |

The frontend is built with an **empty `VITE_API_BASE_URL`**, so the browser calls the API on the domain that served the page. One bundle therefore works for every client. If a domain from your `.env*` files ends up baked into the JavaScript, the build fails. Your own `./dist` folder is never touched.

To re-brand the wizard (product and vendor name), edit `branding.conf`.

The illustrated PDF guide for setting up new clients, `docs/New-Client-Server-Setup-Guide.pdf`, is built with `npm run docs:setup-guide`. Run it after `server:bundle` so the PDF shows the new version; it is also copied into `dist/`.

## 2. Install for a new client (on their server)

1. Point the client's DNS, e.g. `hr.client.com`, at the server (an A record).
2. Open ports 80 and 443. On aaPanel, use **Security → Firewall**. Also check the cloud provider's firewall.
3. Copy the `.run` file to the server (WinSCP, aaPanel file manager, or `scp`), then run:

```bash
sudo bash hrpayroll-setup-1.5.0.run
```

The setup wizard asks for:

- the domain
- the company name
- the first Super Admin (name, email, password)
- HTTPS (yes/no)
- SMTP (optional)
- whether to load the Pakistan FBR tax slabs

Everything else happens automatically:

| What | How |
| --- | --- |
| Node.js | A private, checksum-verified Node 24 runtime in `/opt/hrpayroll/node`. It does not touch aaPanel's Node manager. |
| PostgreSQL | Uses aaPanel's or the system's PostgreSQL. Installs PostgreSQL 16 if neither is present. Creates its own database and user with a random password, plus `pgcrypto`. |
| App | Installed to `/www/wwwroot/<id>` (aaPanel) or `/opt/hrpayroll/apps/<id>`, as `releases/<version>` + a `current` symlink. Runs as its own system user `hrp-<id>`. |
| Secrets | `/etc/hrpayroll/<id>/app.env`: DB URL, `BACKUP_ENCRYPTION_KEY`, `MFA_ENCRYPTION_KEY`, all generated. |
| Service | A hardened systemd unit `hrpayroll-<id>`, bound to 127.0.0.1 only. It restarts automatically. |
| Web | An nginx vhost (aaPanel's nginx or system nginx), a Let's Encrypt certificate with auto-renewal, and an HTTP→HTTPS redirect. |
| First admin | Created through the app's own `/api/auth/setup`, so the client can sign in straight away. |
| Backups | An encrypted `pg_dump` every night at 02:15 to `/var/backups/hrpayroll/<id>` (14 kept), plus one right after install. |

### Choosing the edition

| Edition | For | Switched on |
| --- | --- | --- |
| **Full** (default) | Companies that need complete Pakistan compliance | FBR withholding and tax slabs, EOBI, social security, provident fund, gratuity, bank payroll, maker-checker approvals, recruitment, performance, assets, parallel run, go-live checklist |
| **Lite** | Shops and small businesses with 10–15 staff | Attendance, leave, salaries, advances/loans, salary revisions, payslips. Cash salaries; employee email and bank account optional; one owner can prepare, approve and pay payroll. |

The wizard asks for the edition. Unattended installs take `EDITION=` or `--edition lite`. For Lite, the FBR tax slabs are skipped unless you ask for them. The edition is stored in the database, and you can change it at any time without losing data, in either of two ways:

- `sudo hrpayrollctl edition <id> lite|full` on the server
- the OneNet vendor console on the sign-in screen (login `onenet`, password `OneNet` + today's date as `DDMonYYYY`)

Pass `--no-vendor-console` (or `VENDOR_CONSOLE=disabled`) to switch that console off for a client.

### Unattended install (repeatable per client)

```bash
cp client.conf.example acme.conf      # fill in domain, company, admin…
sudo bash hrpayroll-setup-1.5.0.run --config acme.conf --yes
```

You can also pass every answer as a flag, e.g. `--domain`, `--company` or `--admin-email`. Run `--help` to see them all.

### Several clients on one server

Run the bundle again with a different domain. Each client gets its own instance:

- instance id
- port (8080, 8081, …)
- system user
- database
- documents folder
- backups

`hrpayrollctl list` shows them all.

## 3. Day-2 operations

```bash
sudo hrpayrollctl list
sudo hrpayrollctl status acme
sudo hrpayrollctl logs acme -f
sudo hrpayrollctl update acme hrpayroll-setup-1.6.0.run   # backup → migrate → switch → health check → auto-rollback
sudo hrpayrollctl rollback acme
sudo hrpayrollctl backup acme
sudo hrpayrollctl restore acme /var/backups/hrpayroll/acme/hr-payroll-<time>.dump.enc
sudo hrpayrollctl edition acme        # show; add "lite" or "full" to switch
sudo hrpayrollctl ssl acme            # after DNS is fixed, if HTTPS was skipped
sudo hrpayrollctl edit acme           # SMTP, Twilio/WhatsApp, MFA enforcement… then restart
sudo hrpayrollctl uninstall acme [--purge] [--delete-backups]
```

`restore` stops the service, runs the app's own `postgres-restore.cjs`, re-applies any newer migrations, and then starts the service again. To restore on a **different** server, first copy that instance's `BACKUP_ENCRYPTION_KEY` into the new `app.env`.

## After installing — checklist for each client

- [ ] **Copy `BACKUP_ENCRYPTION_KEY` and `MFA_ENCRYPTION_KEY`** from `/etc/hrpayroll/<id>/app.env` to a password manager. Without the backup key, the backups cannot be restored.
- [ ] Sign in, open **Company Setup**, and complete the legal name, logo and branches. The installer creates the company, plus a "Head Office" branch.
- [ ] Enrol MFA for every admin. Then run `hrpayrollctl edit <id>`, set `MFA_ENFORCE_PRIVILEGED=true`, and restart.
- [ ] **Windows kiosk / mobile app:** these must point at the client's URL. The kiosk reads `PORTAL_URL` and otherwise falls back to `attendance.binishaqsoft.com`, so build or configure the client's kiosk with `PORTAL_URL=https://hr.client.com`.
- [ ] Optionally, copy the backups off-server (aaPanel cron, rclone, etc.).

## aaPanel notes

- The site is a raw vhost file: `/www/server/panel/vhost/nginx/hrpayroll-<id>.conf`. It does **not** appear under **Website → Sites**, so don't add the same domain there. If that domain is already set up in aaPanel, the installer stops and tells you which file is using it.
- If `sudo -u postgres psql` does not work with aaPanel's PostgreSQL, the wizard asks for the PostgreSQL root password from **Databases → PostgreSQL**. For an unattended install, pass `--pg-password` instead.
- The app is managed by systemd, not by aaPanel's Node Project Manager. Don't also add it there, or two copies will fight over the port.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "HTTPS could not be issued" | DNS is not pointing at the server yet, or port 80 is closed. Fix it, then run `hrpayrollctl ssl <id>`. |
| A step failed | The installer prints the last log lines. The full log is in `/var/log/hrpayroll/<id>-install.log`. Fix the cause, run `hrpayrollctl uninstall <id> --purge`, then re-run the bundle. |
| "This setup file is damaged" | The file was altered in transfer (e.g. FTP in ASCII mode). Copy it again in binary mode and compare with `SHA256SUMS`. |
| App unhealthy after editing settings | Run `hrpayrollctl logs <id>`. Production refuses to start with `DEBUG=true` or an empty `APP_URL`. |
