#!/usr/bin/env bash
# One-click server installer for the HR & Payroll Suite.
#
# Installs (or reuses) Node.js, PostgreSQL and nginx — including aaPanel's
# own nginx/PostgreSQL when aaPanel is present — then deploys the app as a
# hardened systemd service behind HTTPS, creates the first administrator,
# and schedules encrypted nightly backups.
#
# Usually run from the self-extracting bundle:
#   sudo bash hrpayroll-setup-<version>.run                     # guided wizard
#   sudo bash hrpayroll-setup-<version>.run --config client.conf --yes   # unattended
set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=branding.conf
[[ -f "$HERE/branding.conf" ]] && source "$HERE/branding.conf"
# shellcheck source=lib/common.sh
source "$HERE/lib/common.sh"

BUNDLE_VERSION="$(cat "$HERE/VERSION" 2>/dev/null || echo dev)"
APP_PACKAGE="$HERE/app.tar.gz"

usage() {
  cat <<EOF
$PRODUCT_NAME server installer $BUNDLE_VERSION

Usage: sudo bash hrpayroll-setup.run [options]

With no options a guided setup wizard runs. Every answer can also be given
as an option or in a config file (see client.conf.example) for unattended
installs.

  --config FILE          Read answers from FILE (KEY=VALUE lines)
  --domain NAME          Public host name, e.g. hr.client.com
  --company NAME         Company name shown in the app
  --admin-name NAME      First administrator's full name
  --admin-email EMAIL    First administrator's sign-in email
  --admin-password PW    At least 12 characters (prefer the config file or
                         HRP_ADMIN_PASSWORD env var; blank = generate one)
  --ssl-email EMAIL      Let's Encrypt account email (expiry notices)
  --no-ssl               Serve plain HTTP only (not recommended)
  --slug NAME            Short instance id (default: from the domain)
  --port N               Internal app port (default: first free from 8080)
  --extra-origins LIST   Extra comma-separated origins allowed to call the API
  --no-tax-slabs         Do not seed Pakistan FBR salary tax slabs
  --pg-password PW       PostgreSQL superuser password, only if peer auth
                         as the 'postgres' OS user is not available
  --reuse-db             Allow installing into an existing, non-empty database
  --package FILE         Use this app package instead of the bundled one
  --yes                  Unattended: no wizard, fail on missing answers
  --staging-cert         Use Let's Encrypt staging (for testing only)
  -h, --help             Show this help
EOF
}

# ---------- answers ---------------------------------------------------------

DOMAIN="${HRP_DOMAIN:-}"; SLUG="${HRP_SLUG:-}"; COMPANY_NAME="${HRP_COMPANY_NAME:-}"
ADMIN_NAME="${HRP_ADMIN_NAME:-}"; ADMIN_EMAIL="${HRP_ADMIN_EMAIL:-}"; ADMIN_PASSWORD="${HRP_ADMIN_PASSWORD:-}"
SSL="${HRP_SSL:-}"; SSL_EMAIL="${HRP_SSL_EMAIL:-}"; PORT="${HRP_PORT:-}"; EXTRA_ORIGINS="${HRP_EXTRA_ORIGINS:-}"
SEED_TAX_SLABS="${HRP_SEED_TAX_SLABS:-}"; PG_SUPER_PASSWORD="${HRP_PG_SUPER_PASSWORD:-}"
SMTP_HOST="${HRP_SMTP_HOST:-}"; SMTP_PORT="${HRP_SMTP_PORT:-}"; SMTP_SECURE="${HRP_SMTP_SECURE:-}"
SMTP_USER="${HRP_SMTP_USER:-}"; SMTP_PASS="${HRP_SMTP_PASS:-}"; SMTP_FROM="${HRP_SMTP_FROM:-}"
BACKUP_CRON="${HRP_BACKUP_CRON:-}"; REUSE_DB=0; ASSUME_YES=0; CONFIG_FILE=""

CONFIG_KEYS=" DOMAIN SLUG COMPANY_NAME ADMIN_NAME ADMIN_EMAIL ADMIN_PASSWORD SSL SSL_EMAIL PORT EXTRA_ORIGINS SEED_TAX_SLABS PG_SUPER_PASSWORD SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS SMTP_FROM BACKUP_CRON "

# KEY=VALUE parser — never sources the file. Values already given on the
# command line win over the file.
load_config_file() {
  local f="$1" line key val
  [[ -r "$f" ]] || die "Cannot read config file $f"
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    if [[ ! "$line" =~ ^[[:space:]]*([A-Z_][A-Z0-9_]*)[[:space:]]*=(.*)$ ]]; then warn "Ignoring config line: $line"; continue; fi
    key="${BASH_REMATCH[1]}"; val="${BASH_REMATCH[2]}"
    val="${val#"${val%%[![:space:]]*}"}"; val="${val%"${val##*[![:space:]]}"}"
    if [[ "$val" =~ ^\"(.*)\"$ || "$val" =~ ^\'(.*)\'$ ]]; then val="${BASH_REMATCH[1]}"; fi
    if [[ "$CONFIG_KEYS" != *" $key "* ]]; then warn "Unknown config key $key ignored"; continue; fi
    if [[ -z "${!key:-}" ]]; then printf -v "$key" '%s' "$val"; fi
  done <"$f"
}

need_arg() { [[ $# -ge 2 && -n "$2" ]] || die "Option $1 needs a value."; }
while [[ $# -gt 0 ]]; do
  case "$1" in
    --config) need_arg "$@"; CONFIG_FILE="$2"; shift 2 ;;
    --domain) need_arg "$@"; DOMAIN="$2"; shift 2 ;;
    --company) need_arg "$@"; COMPANY_NAME="$2"; shift 2 ;;
    --admin-name) need_arg "$@"; ADMIN_NAME="$2"; shift 2 ;;
    --admin-email) need_arg "$@"; ADMIN_EMAIL="$2"; shift 2 ;;
    --admin-password) need_arg "$@"; ADMIN_PASSWORD="$2"; shift 2 ;;
    --ssl-email) need_arg "$@"; SSL_EMAIL="$2"; SSL=yes; shift 2 ;;
    --no-ssl) SSL=no; shift ;;
    --slug) need_arg "$@"; SLUG="$2"; shift 2 ;;
    --port) need_arg "$@"; PORT="$2"; shift 2 ;;
    --extra-origins) need_arg "$@"; EXTRA_ORIGINS="$2"; shift 2 ;;
    --no-tax-slabs) SEED_TAX_SLABS=no; shift ;;
    --pg-password) need_arg "$@"; PG_SUPER_PASSWORD="$2"; shift 2 ;;
    --reuse-db) REUSE_DB=1; shift ;;
    --package) need_arg "$@"; APP_PACKAGE="$2"; shift 2 ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    --staging-cert) export HRP_CERTBOT_STAGING=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "Unknown option: $1" ;;
  esac
done
if [[ -n "$CONFIG_FILE" ]]; then load_config_file "$CONFIG_FILE"; fi

# ---------- wizard UI -------------------------------------------------------

export NEWT_COLORS='
root=white,blue
border=blue,lightgray
window=black,lightgray
shadow=black,black
title=blue,lightgray
button=white,blue
actbutton=white,cyan
compactbutton=blue,lightgray
checkbox=black,lightgray
actcheckbox=white,blue
entry=black,white
disentry=gray,lightgray
label=black,lightgray
listbox=black,white
actlistbox=white,blue
sellistbox=white,blue
actsellistbox=white,cyan
textbox=black,lightgray
acttextbox=black,cyan
helpline=white,blue
roottext=white,blue
emptyscale=,gray
fullscale=,cyan
'
BACKTITLE="$PRODUCT_NAME  •  Server Setup $BUNDLE_VERSION  •  $VENDOR_NAME"
UI=plain
if [[ $ASSUME_YES == 0 ]]; then
  if [[ ! -t 0 && -r /dev/tty ]]; then exec </dev/tty; fi   # curl | bash
  [[ -t 0 && -t 1 ]] || die "No terminal for the wizard. Pass --yes with --config or options."
  command -v whiptail >/dev/null 2>&1 && UI=whiptail
fi

# All ui_* helpers print the answer on stdout; non-zero = Cancel.
ui_msg() {
  if [[ $UI == whiptail ]]; then whiptail --backtitle "$BACKTITLE" --title "$1" --msgbox "$2" "${3:-18}" 74
  else printf '\n%s\n%b\n\n' "${C_BOLD}== $1 ==${C_RESET}" "$2"; read -rp "Press Enter to continue… " _ </dev/tty; fi
}
ui_yesno() {
  local default="${3:-yes}"
  if [[ $UI == whiptail ]]; then
    local extra=(); [[ $default == no ]] && extra=(--defaultno)
    whiptail --backtitle "$BACKTITLE" --title "$1" "${extra[@]}" --yesno "$2" "${4:-14}" 74
  else
    local hint="[Y/n]" a; [[ $default == no ]] && hint="[y/N]"
    printf '\n%s\n' "${C_BOLD}$1${C_RESET}"; printf '%b\n' "$2"
    read -rp "$hint " a </dev/tty; a="${a:-$default}"; [[ "${a,,}" == y* ]]
  fi
}
ui_input() {
  if [[ $UI == whiptail ]]; then whiptail --backtitle "$BACKTITLE" --title "$1" --inputbox "$2" 12 74 "${3:-}" 3>&1 1>&2 2>&3
  else
    local a; printf '\n%s\n' "${C_BOLD}$1${C_RESET}" >&2; printf '%b\n' "$2" >&2
    read -rp "> ${3:+[$3] }" a </dev/tty; printf '%s' "${a:-${3:-}}"
  fi
}
ui_password() {
  if [[ $UI == whiptail ]]; then whiptail --backtitle "$BACKTITLE" --title "$1" --passwordbox "$2" 12 74 3>&1 1>&2 2>&3
  else
    local a; printf '\n%s\n' "${C_BOLD}$1${C_RESET}" >&2; printf '%b\n' "$2" >&2
    read -rsp "> " a </dev/tty; echo >&2; printf '%s' "$a"
  fi
}
cancelled() { clear 2>/dev/null || true; die "Setup cancelled. Nothing was changed."; }

ask_until() {
  # ask_until VAR validator "Title" "Prompt" [default]
  local var="$1" validator="$2" title="$3" prompt="$4" def="${5:-}" val
  while :; do
    val="$(ui_input "$title" "$prompt" "${!var:-$def}")" || cancelled
    val="${val#"${val%%[![:space:]]*}"}"; val="${val%"${val##*[![:space:]]}"}"
    if "$validator" "$val"; then printf -v "$var" '%s' "$val"; return; fi
    ui_msg "Please check that" "\"$val\" doesn't look right. Try again." 8
  done
}
nonempty() { [[ -n "$1" ]]; }
optional_email() { [[ -z "$1" ]] || valid_email "$1"; }

# ---------- preflight -------------------------------------------------------

preflight() {
  require_root
  detect_os
  detect_aapanel
  detect_postgres
  detect_nginx
  if [[ "$OS_ID" != ubuntu ]] || ! [[ "$OS_VERSION" == 22.04 || "$OS_VERSION" == 24.04 ]]; then
    warn "Tested on Ubuntu 22.04/24.04; this is $OS_PRETTY."
    [[ $ASSUME_YES == 1 ]] || ui_yesno "Untested system" "This installer is tested on Ubuntu 22.04 and 24.04.\nThis server runs $OS_PRETTY.\n\nContinue anyway?" no || cancelled
  fi
  [[ -f "$APP_PACKAGE" ]] || die "App package not found: $APP_PACKAGE"
  local mem_mb disk_mb
  mem_mb="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
  disk_mb="$(df -Pm /var | awk 'NR==2 {print $4}')"
  (( mem_mb >= 900 )) || warn "Only ${mem_mb} MB RAM — 2 GB or more is recommended."
  (( disk_mb >= 2048 )) || die "Only ${disk_mb} MB free on /var — at least 2 GB is needed."
  if port_in_use 80 && ! ss -Hltnp '( sport = :80 )' 2>/dev/null | grep -q nginx; then
    die "Port 80 is used by something other than nginx: $(ss -Hltnp '( sport = :80 )' | head -n1). Stop it first."
  fi
}

describe_environment() {
  local panel="not detected" pg nginx
  (( AAPANEL )) && panel="detected — its nginx and PostgreSQL are reused"
  case "$PG_FLAVOR" in aapanel) pg="aaPanel PostgreSQL ($PG_BIN_DIR)";; system) pg="system PostgreSQL ($PG_BIN_DIR)";; *) pg="not found — will install PostgreSQL";; esac
  case "$NGINX_FLAVOR" in aapanel) nginx="aaPanel nginx $(nginx_version)";; system) nginx="nginx $(nginx_version)";; *) nginx="not found — will install nginx";; esac
  printf 'Server:      %s\naaPanel:     %s\nDatabase:    %s\nWeb server:  %s\nNode.js:     private Node %s runtime in %s' \
    "$OS_PRETTY" "$panel" "$pg" "$nginx" "$HRP_NODE_MAJOR" "$HRP_OPT"
}

# ---------- gather answers --------------------------------------------------

gather() {
  if [[ $ASSUME_YES == 0 ]]; then
    ui_msg "Welcome" "This wizard installs $PRODUCT_NAME on this server for a new client.\n\n$(describe_environment)\n\nYou will be asked for the client's domain, company name and first administrator. Everything else is configured automatically." 19
    ask_until DOMAIN valid_domain "Client domain" "Public host name for this client (DNS must already point to this server):\n\ne.g. hr.clientcompany.com"
    DOMAIN="${DOMAIN,,}"
    [[ -n "$SLUG" ]] || SLUG="$(slug_from_domain "$DOMAIN")"
    while [[ -f "$(instance_conf "$SLUG")" ]]; do SLUG="${SLUG:0:20}-$((RANDOM % 90 + 10))"; done
    ask_until SLUG valid_slug "Instance id" "Short id for this installation (lowercase letters, digits, dashes). Used for the service, database and folders." "$SLUG"
    ask_until COMPANY_NAME nonempty "Company" "Company name as it should appear in the app:"
    ask_until ADMIN_NAME nonempty "Administrator" "Full name of the first Super Admin:" "System Administrator"
    ask_until ADMIN_EMAIL valid_email "Administrator" "Sign-in email of the first Super Admin:"
    if [[ -z "$ADMIN_PASSWORD" ]]; then
      local p1 p2
      while :; do
        p1="$(ui_password "Administrator password" "Choose a password of at least 12 characters.\nLeave blank to generate a strong one (shown at the end).")" || cancelled
        [[ -z "$p1" ]] && break
        if (( ${#p1} < 12 )); then ui_msg "Too short" "The password needs at least 12 characters." 8; continue; fi
        p2="$(ui_password "Administrator password" "Type the same password again:")" || cancelled
        [[ "$p1" == "$p2" ]] && { ADMIN_PASSWORD="$p1"; break; }
        ui_msg "Mismatch" "The two passwords were different. Try again." 8
      done
    fi
    if [[ -z "$SSL" ]]; then
      if ui_yesno "HTTPS" "Get a free Let's Encrypt certificate for $DOMAIN and force HTTPS?\n\n(Recommended. Needs DNS for $DOMAIN pointing here and ports 80/443 open. By choosing Yes you accept the Let's Encrypt Subscriber Agreement.)"; then SSL=yes; else SSL=no; fi
    fi
    if [[ $SSL == yes && -z "$SSL_EMAIL" ]]; then
      ask_until SSL_EMAIL optional_email "HTTPS" "Email for certificate expiry notices (optional):" "$ADMIN_EMAIL"
    fi
    if [[ -z "$SMTP_HOST" ]] && ui_yesno "Email delivery" "Configure SMTP now so the system can email payslips and sign-in codes?\n\nYou can also do this later by editing $HRP_ETC/<id>/app.env." no; then
      ask_until SMTP_HOST valid_domain "SMTP" "SMTP server host:" "smtp.gmail.com"
      ask_until SMTP_PORT nonempty "SMTP" "SMTP port (587 = STARTTLS, 465 = SSL):" "587"
      ask_until SMTP_USER nonempty "SMTP" "SMTP username:" "$ADMIN_EMAIL"
      SMTP_PASS="$(ui_password "SMTP" "SMTP password or app password:")" || cancelled
      ask_until SMTP_FROM nonempty "SMTP" "From address shown on emails:" "Payroll <$SMTP_USER>"
    fi
    if [[ -z "$SEED_TAX_SLABS" ]]; then
      if ui_yesno "Payroll tax" "Load the Pakistan FBR salaried-individual income-tax slabs?\n\nChoose No for clients outside Pakistan; slabs can be edited in the app." yes 12; then SEED_TAX_SLABS=yes; else SEED_TAX_SLABS=no; fi
    fi
  fi

  # Defaults + validation for both wizard and unattended paths.
  DOMAIN="${DOMAIN,,}"
  valid_domain "$DOMAIN" || die "Set a valid --domain (got '${DOMAIN}')."
  [[ -n "$SLUG" ]] || SLUG="$(slug_from_domain "$DOMAIN")"
  valid_slug "$SLUG" || die "Instance id '$SLUG' must be 2-24 chars: lowercase letters, digits, dashes."
  [[ -n "$COMPANY_NAME" ]] || die "Set --company."
  [[ -n "$ADMIN_NAME" ]] || ADMIN_NAME="System Administrator"
  valid_email "$ADMIN_EMAIL" || die "Set a valid --admin-email."
  ADMIN_EMAIL="${ADMIN_EMAIL,,}"
  ADMIN_PASSWORD_GENERATED=0
  if [[ -z "$ADMIN_PASSWORD" ]]; then
    ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=\n' | cut -c1-18)"; ADMIN_PASSWORD_GENERATED=1
  fi
  (( ${#ADMIN_PASSWORD} >= 12 )) || die "The administrator password needs at least 12 characters."
  SSL="${SSL:-yes}"; [[ "${SSL,,}" == y* || "${SSL,,}" == true || "$SSL" == 1 ]] && SSL=yes || SSL=no
  [[ -z "$SSL_EMAIL" ]] || valid_email "$SSL_EMAIL" || die "Invalid --ssl-email."
  SEED_TAX_SLABS="${SEED_TAX_SLABS:-yes}"
  [[ -z "$PORT" || "$PORT" =~ ^[0-9]{2,5}$ ]] || die "Invalid --port."
  [[ -f "$(instance_conf "$SLUG")" ]] && die "An installation named '$SLUG' already exists. Upgrade it with: hrpayrollctl update $SLUG <package>"

  APP_USER="hrp-$SLUG"; SERVICE="hrpayroll-$SLUG"
  DB_NAME="hrp_${SLUG//-/_}"; DB_USER="hrp_${SLUG//-/_}"; DB_PASS="$(rand_hex 24)"
  if (( AAPANEL )); then APP_ROOT="/www/wwwroot/$SLUG"; else APP_ROOT="$HRP_OPT/apps/$SLUG"; fi
  DATA_DIR="/var/lib/hrpayroll/$SLUG/documents"; BACKUP_DIR="/var/backups/hrpayroll/$SLUG"
  [[ -e "$APP_ROOT" ]] && die "$APP_ROOT already exists. Choose another instance id with --slug."
  [[ -n "$PORT" ]] || PORT="$(next_free_port 8080)"
  port_in_use "$PORT" && die "Port $PORT is already in use."
  NGINX_CONF=""
  if [[ "$NGINX_FLAVOR" != none ]]; then
    NGINX_CONF="$NGINX_VHOST_DIR/hrpayroll-$SLUG.conf"
    local taken; taken="$(domain_taken_by_other_vhost "$DOMAIN" "$NGINX_CONF" || true)"
    [[ -z "$taken" ]] || die "$DOMAIN is already configured in $taken. Remove that site (aaPanel → Website) first."
  fi

  # PostgreSQL superuser access, asked now so the install itself never prompts.
  if [[ "$PG_FLAVOR" != none ]]; then
    pg_server_running || warn "PostgreSQL in $PG_BIN_DIR is not answering on 127.0.0.1:5432."
    if ! probe_pg_super; then
      [[ $ASSUME_YES == 1 ]] && die "Cannot reach PostgreSQL as superuser. Pass --pg-password (aaPanel → Database → PostgreSQL → root password)."
      while :; do
        PG_SUPER_PASSWORD="$(ui_password "PostgreSQL" "Enter the PostgreSQL 'postgres' superuser password\n(aaPanel → Databases → PostgreSQL → Root password):")" || cancelled
        probe_pg_super && break
        ui_msg "PostgreSQL" "That password did not work. Try again." 8
      done
    fi
    if database_exists "$DB_NAME" && [[ "$(database_table_count "$DB_NAME")" != 0 && $REUSE_DB == 0 ]]; then
      die "Database $DB_NAME already exists and has tables. Use another --slug, or --reuse-db if that is intended."
    fi
  fi

  if [[ $ASSUME_YES == 0 ]]; then
    local smtp="not configured (edit later)"; [[ -n "$SMTP_HOST" ]] && smtp="$SMTP_USER @ $SMTP_HOST:${SMTP_PORT:-587}"
    local scheme=http; [[ $SSL == yes ]] && scheme=https
    ui_yesno "Ready to install" "Please confirm:\n
  Website:        $scheme://$DOMAIN
  Company:        $COMPANY_NAME
  Super Admin:    $ADMIN_NAME <$ADMIN_EMAIL>
  Instance id:    $SLUG   (service $SERVICE, port $PORT)
  App folder:     $APP_ROOT
  Database:       $DB_NAME  ($PG_FLAVOR)
  Email (SMTP):   $smtp
  FBR tax slabs:  $SEED_TAX_SLABS
  Backups:        nightly, encrypted, $BACKUP_DIR\n
Install now?" yes 22 || cancelled
    clear 2>/dev/null || true
  fi
}

# ---------- install steps (each runs in a subshell, see step()) -------------

s_base_packages() {
  apt_install ca-certificates curl openssl tar xz-utils gzip cron logrotate iproute2
  install -d -m 0755 "$HRP_LOG_DIR" "$HRP_ETC" "$HRP_LIB" "$HRP_OPT"
}

s_node() { ensure_node; }

s_postgres() { install_postgres; }

s_database() { create_database; }

s_user_dirs() {
  if ! id "$APP_USER" >/dev/null 2>&1; then
    useradd --system --home-dir "$APP_ROOT" --no-create-home --shell /usr/sbin/nologin --user-group "$APP_USER"
  fi
  install -d -o root -g "$APP_USER" -m 0750 "$APP_ROOT" "$APP_ROOT/releases"
  install -d -o "$APP_USER" -g "$APP_USER" -m 0700 "$DATA_DIR" "$BACKUP_DIR"
  install -d -o root -g "$APP_USER" -m 0750 "$(instance_dir "$SLUG")"
  # aaPanel adds a .user.ini guard to site roots; keep it out of a Node app folder.
  rm -f "$APP_ROOT/.user.ini" 2>/dev/null || true
}

s_config() {
  local f; f="$(env_file "$SLUG")"
  local scheme=http; [[ $SSL == yes ]] && scheme=https
  umask 027
  cat >"$f" <<EOF
# $PRODUCT_NAME — $COMPANY_NAME ($DOMAIN)
# Generated by the installer on $(date -R). Restart after editing:
#   hrpayrollctl restart $SLUG

DATA_BACKEND=postgres
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@127.0.0.1:5432/$DB_NAME
PG_POOL_MAX=10
PG_SSL=false
PG_SSL_REJECT_UNAUTHORIZED=false
PG_DUMP_PATH=$PG_BIN_DIR/pg_dump
PG_RESTORE_PATH=$PG_BIN_DIR/pg_restore

PORT=$PORT
HOST=127.0.0.1
NODE_ENV=production
DEBUG=false
RATE_LIMIT_MAX=10000
APP_URL=$scheme://$DOMAIN
PORTAL_URL=$scheme://$DOMAIN
ALLOWED_ORIGIN=$scheme://$DOMAIN
VITE_API_POLL_MS=5000

SMTP_HOST=$(env_quote "$SMTP_HOST")
SMTP_PORT=$(env_quote "${SMTP_PORT:-587}")
SMTP_SECURE=$(env_quote "${SMTP_SECURE:-$([[ "${SMTP_PORT:-587}" == 465 ]] && echo true || echo false)}")
SMTP_REQUIRE_TLS=true
SMTP_USER=$(env_quote "$SMTP_USER")
SMTP_PASS=$(env_quote "$SMTP_PASS")
SMTP_FROM=$(env_quote "$SMTP_FROM")

# Optional SMS / WhatsApp salary alerts — see the app's .env.example.
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_SMS_FROM=
TWILIO_WHATSAPP_FROM=
SMS_HTTP_URL=
SMS_HTTP_TOKEN=
SMS_HTTP_SENDER=
WHATSAPP_CLOUD_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_TEMPLATE_NAME=
WHATSAPP_TEMPLATE_LANGUAGE=en

# KEEP A COPY OF THESE TWO KEYS OFF THIS SERVER. Without BACKUP_ENCRYPTION_KEY
# the backups cannot be restored; without MFA_ENCRYPTION_KEY every user must
# re-enrol their authenticator app.
BACKUP_ENCRYPTION_KEY=$(rand_base64)
MFA_ENCRYPTION_KEY=$(rand_base64)
MFA_ISSUER=$(env_quote "${COMPANY_NAME//\"/} HR")
MFA_ENFORCE_PRIVILEGED=false

BACKUP_DIR=$BACKUP_DIR
BACKUP_RETENTION_COUNT=14
SESSION_IDLE_MINUTES=30
SESSION_ABSOLUTE_HOURS=12
DOCUMENT_STORAGE_PATH=$DATA_DIR
EOF
  umask 022
  chown root:"$APP_USER" "$f"; chmod 0640 "$f"
  [[ -n "$EXTRA_ORIGINS" ]] && apply_urls "$scheme" "$f"
  write_instance_conf
}

s_release() {
  local rel="$APP_ROOT/releases/$RELEASE_ID"
  install -d -m 0750 "$rel"
  tar -xzf "$APP_PACKAGE" -C "$rel" --no-same-owner
  [[ -f "$rel/server.cjs" && -d "$rel/dist" ]] || { echo "The app package is missing server.cjs or dist/."; return 1; }
  npm_install_release "$rel"
  link_release_env "$rel"
  ln -sfn "$rel" "$APP_ROOT/current"
}

s_migrate() {
  run_migrations "$APP_ROOT/current"
  if [[ "$SEED_TAX_SLABS" == yes && -f "$APP_ROOT/current/scripts/seed-tax-slabs.cjs" ]]; then
    app_run "$APP_ROOT/current" "$(node_bin)" scripts/seed-tax-slabs.cjs
  fi
}

s_service() {
  write_systemd_unit
  systemctl enable --now "$SERVICE"
  health_wait "$PORT" 90 || { journalctl -u "$SERVICE" -n 40 --no-pager; return 1; }
}

s_nginx() {
  [[ "$NGINX_FLAVOR" == none ]] && install_nginx
  detect_nginx
  NGINX_CONF="$NGINX_VHOST_DIR/hrpayroll-$SLUG.conf"
  write_vhost http
  nginx_reload
}

s_firewall() {
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then
    ufw allow 80/tcp; ufw allow 443/tcp
  fi
}

s_ssl() {
  if ! acme_self_check; then
    echo "Note: http://$DOMAIN did not reach this server from itself (DNS not pointing here yet, or no NAT loopback). Trying Let's Encrypt anyway."
  fi
  issue_certificate "$SSL_EMAIL"
  write_vhost https
  nginx_reload
}

s_http_only_urls() {
  apply_urls http "$(env_file "$SLUG")"
  systemctl restart "$SERVICE"
  health_wait "$PORT" 60
}

s_admin() {
  local scheme=http code body
  [[ $SSL_ENABLED == 1 ]] && scheme=https
  body="$(mktemp)"
  code="$(C="$COMPANY_NAME" N="$ADMIN_NAME" E="$ADMIN_EMAIL" P="$ADMIN_PASSWORD" "$(node_bin)" -e \
    'process.stdout.write(JSON.stringify({companyName:process.env.C,adminName:process.env.N,adminEmail:process.env.E,adminPassword:process.env.P}))' \
    | curl -sS -o "$body" -w '%{http_code}' -m 30 -X POST "http://127.0.0.1:$PORT/api/auth/setup" \
        -H 'Content-Type: application/json' -H "Origin: $scheme://$DOMAIN" --data-binary @-)"
  case "$code" in
    200) echo "Administrator created." ;;
    409) echo "The database already had users — the administrator was not changed." ;;
    *) echo "Setup endpoint answered HTTP $code: $(head -c 300 "$body")"; rm -f "$body"; return 1 ;;
  esac
  rm -f "$body"
}

s_tooling() {
  install -m 0644 "$HERE/lib/common.sh" "$HRP_LIB/common.sh"
  [[ -f "$HERE/branding.conf" ]] && install -m 0644 "$HERE/branding.conf" "$HRP_LIB/branding.conf"
  install -m 0755 "$HERE/hrpayrollctl" /usr/local/bin/hrpayrollctl
  write_backup_cron
  write_logrotate
}

s_first_backup() { /usr/local/bin/hrpayrollctl backup "$SLUG"; }

# ---------- main ------------------------------------------------------------

main() {
  banner "Server Setup $BUNDLE_VERSION — $VENDOR_NAME"
  preflight
  gather

  install -d -m 0755 "$HRP_LOG_DIR"
  HRP_LOG="$HRP_LOG_DIR/$SLUG-install.log"; : >"$HRP_LOG"; chmod 0600 "$HRP_LOG"
  RELEASE_ID="${BUNDLE_VERSION}-$(date +%Y%m%d%H%M%S)"
  SSL_ENABLED=0; INSTALLED_AT="$(date -Is)"
  local scheme_note=""

  banner "Installing for $DOMAIN"
  STEP_TOTAL=14; [[ $PG_FLAVOR == none ]] && STEP_TOTAL=15
  step "Installing base packages"            s_base_packages
  step "Installing Node.js $HRP_NODE_MAJOR runtime" s_node
  if [[ "$PG_FLAVOR" == none ]]; then
    step "Installing PostgreSQL"             s_postgres
    detect_postgres; probe_pg_super || die "PostgreSQL was installed but peer login as 'postgres' failed."
  fi
  step "Creating database $DB_NAME"          s_database
  step "Creating service account and folders" s_user_dirs
  step "Writing configuration and secrets"   s_config
  step "Deploying application $BUNDLE_VERSION" s_release
  step "Applying database migrations"        s_migrate
  step "Starting service $SERVICE"           s_service
  step "Configuring nginx for $DOMAIN"       s_nginx
  detect_nginx; NGINX_CONF="$NGINX_VHOST_DIR/hrpayroll-$SLUG.conf"
  step "Opening firewall ports 80/443"       s_firewall
  if [[ $SSL == yes ]]; then
    STEP_SOFT=1 step "Issuing HTTPS certificate" s_ssl
    if (( STEP_RC == 0 )); then SSL_ENABLED=1
    else
      STEP_TOTAL=$((STEP_TOTAL + 1))
      step "Falling back to HTTP"            s_http_only_urls
      scheme_note="HTTPS could not be issued yet (usually DNS not pointing here). Fix DNS, then run: hrpayrollctl ssl $SLUG"
    fi
  else
    STEP_NO=$((STEP_NO + 1))
  fi
  step "Creating Super Admin $ADMIN_EMAIL"   s_admin
  write_instance_conf
  step "Installing hrpayrollctl and nightly backups" s_tooling
  STEP_SOFT=1 step "Taking the first encrypted backup" s_first_backup

  local scheme=http; (( SSL_ENABLED )) && scheme=https
  local url="$scheme://$DOMAIN"
  local summary; summary="$(instance_dir "$SLUG")/install-summary.txt"
  cat >"$summary" <<EOF
$PRODUCT_NAME — installation summary
Installed:      $INSTALLED_AT  (bundle $BUNDLE_VERSION)
Website:        $url
Company:        $COMPANY_NAME
Super Admin:    $ADMIN_EMAIL
Instance id:    $SLUG
Service:        $SERVICE  (systemctl status $SERVICE)
App folder:     $APP_ROOT/current
Config:         $(env_file "$SLUG")
Documents:      $DATA_DIR
Backups:        $BACKUP_DIR  (nightly; key = BACKUP_ENCRYPTION_KEY in the config)
Database:       $DB_NAME on 127.0.0.1:5432 (user $DB_USER; password in the config)
nginx site:     $NGINX_CONF
Install log:    $HRP_LOG
EOF
  chmod 0600 "$summary"

  local pw_line="Password:    (the one you chose)"
  (( ADMIN_PASSWORD_GENERATED )) && pw_line="Password:    $ADMIN_PASSWORD   ← generated, shown once; change it after signing in"
  printf '\n%s\n' "${C_GREEN}${C_BOLD}  ✔ $PRODUCT_NAME is live for $COMPANY_NAME${C_RESET}"
  cat <<EOF

    Open:        ${C_BOLD}$url${C_RESET}
    Sign in:     $ADMIN_EMAIL
    $pw_line

    Kiosk & mobile apps:  set the server address to $url
    Manage:      hrpayrollctl status $SLUG | logs $SLUG | backup $SLUG | update $SLUG <bundle.run>
    Summary:     $summary

    ${C_YELLOW}Important:${C_RESET} copy BACKUP_ENCRYPTION_KEY and MFA_ENCRYPTION_KEY from
    $(env_file "$SLUG") to a safe place off this server.
EOF
  [[ -n "$scheme_note" ]] && printf '\n    %s\n' "${C_YELLOW}$scheme_note${C_RESET}"
  (( AAPANEL )) && printf '\n    %s\n' "${C_DIM}aaPanel: the site runs from $NGINX_CONF; it is not listed under Website → Sites, so don't add $DOMAIN there.${C_RESET}"
  echo
}

main "$@"
