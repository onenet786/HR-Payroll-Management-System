# shellcheck shell=bash
# Shared helpers for the HR & Payroll server installer and hrpayrollctl.
# Sourced, never executed. Requires bash 4+, runs as root on Ubuntu 22.04/24.04.

HRP_ETC=/etc/hrpayroll
HRP_LIB=/usr/local/lib/hrpayroll
HRP_OPT=/opt/hrpayroll
HRP_LOG_DIR=/var/log/hrpayroll
HRP_ACME_ROOT=/var/www/hrpayroll-acme
HRP_NODE_MAJOR="${HRP_NODE_MAJOR:-24}"
HRP_NODE_LINK="$HRP_OPT/node"
HRP_LOG="${HRP_LOG:-/dev/null}"

PRODUCT_NAME="${PRODUCT_NAME:-HR & Payroll Suite}"
VENDOR_NAME="${VENDOR_NAME:-OneNet Solutions}"

# ---------- output ----------------------------------------------------------

if [[ -t 1 ]]; then
  C_RESET=$'\e[0m'; C_BOLD=$'\e[1m'; C_DIM=$'\e[2m'
  C_RED=$'\e[31m'; C_GREEN=$'\e[32m'; C_YELLOW=$'\e[33m'; C_BLUE=$'\e[34m'; C_CYAN=$'\e[36m'
else
  C_RESET=; C_BOLD=; C_DIM=; C_RED=; C_GREEN=; C_YELLOW=; C_BLUE=; C_CYAN=
fi

log()  { printf '%s %s\n' "$(date '+%F %T')" "$*" >>"$HRP_LOG"; }
info() { printf '%s\n' "  ${C_CYAN}›${C_RESET} $*"; log "INFO $*"; }
ok()   { printf '%s\n' "  ${C_GREEN}✔${C_RESET} $*"; log "OK   $*"; }
warn() { printf '%s\n' "  ${C_YELLOW}!${C_RESET} $*" >&2; log "WARN $*"; }
die()  { printf '\n%s\n' "  ${C_RED}✖ $*${C_RESET}" >&2; log "FAIL $*"; exit 1; }

banner() {
  local subtitle="$1"
  printf '\n%s\n' "${C_BLUE}${C_BOLD}  ╔══════════════════════════════════════════════════════════════╗${C_RESET}"
  printf '%s\n'   "${C_BLUE}${C_BOLD}  ║${C_RESET}  ${C_BOLD}$(printf '%-60s' "$PRODUCT_NAME")${C_RESET}${C_BLUE}${C_BOLD}║${C_RESET}"
  printf '%s\n'   "${C_BLUE}${C_BOLD}  ║${C_RESET}  ${C_DIM}$(printf '%-60s' "$subtitle")${C_RESET}${C_BLUE}${C_BOLD}║${C_RESET}"
  printf '%s\n\n' "${C_BLUE}${C_BOLD}  ╚══════════════════════════════════════════════════════════════╝${C_RESET}"
}

STEP_NO=0
STEP_TOTAL="${STEP_TOTAL:-0}"
STEP_RC=0
# step "Label" function [args...]
# Runs the function in a background subshell with errexit on, its output
# appended to the log, and a spinner meanwhile. Variables a step sets do not
# reach the caller, so callers re-run detection after install steps.
#
# NEVER call step from a conditional (`if step`, `step || x`, `! step`): bash
# then disables errexit inside the step too, and a failing command would not
# stop it. For optional steps use `STEP_SOFT=1 step …` and test $STEP_RC.
step() {
  local label="$1"; shift
  STEP_NO=$((STEP_NO + 1))
  local prefix="[$STEP_NO/$STEP_TOTAL]"
  [[ "$STEP_TOTAL" == 0 ]] && prefix="[$STEP_NO]"
  local started=$SECONDS rc=0 pid i=0 frames='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  log "STEP $prefix $label"
  ( set -Eeuo pipefail; "$@" ) >>"$HRP_LOG" 2>&1 </dev/null &
  pid=$!
  if [[ -t 1 ]]; then
    while kill -0 "$pid" 2>/dev/null; do
      printf '\r  %s %s' "${C_CYAN}${frames:i++%${#frames}:1}${C_RESET}" "${C_DIM}${prefix}${C_RESET} $label"
      sleep 0.12
    done
    printf '\r\e[2K'
  fi
  wait "$pid" || rc=$?
  STEP_RC=$rc
  if (( rc != 0 )) && [[ "${STEP_SOFT:-0}" == 1 ]]; then
    printf '%s\n' "  ${C_YELLOW}!${C_RESET} ${C_DIM}${prefix}${C_RESET} $label ${C_DIM}(skipped — see $HRP_LOG)${C_RESET}"
    log "SOFT-FAIL $prefix $label rc=$rc"
    return 0
  fi
  if (( rc != 0 )); then
    printf '%s\n' "  ${C_RED}✖${C_RESET} ${C_DIM}${prefix}${C_RESET} $label"
    printf '\n%s\n' "  ${C_DIM}Last lines of $HRP_LOG:${C_RESET}" >&2
    tail -n 25 "$HRP_LOG" | sed 's/^/    /' >&2
    die "Step failed: $label"
  fi
  printf '%s\n' "  ${C_GREEN}✔${C_RESET} ${C_DIM}${prefix}${C_RESET} $label ${C_DIM}($((SECONDS - started))s)${C_RESET}"
}

# ---------- small utilities -------------------------------------------------

require_root() { [[ $EUID -eq 0 ]] || die "Run this as root (sudo)."; }

rand_hex()    { openssl rand -hex "${1:-24}"; }
rand_base64() { openssl rand -base64 32 | tr -d '\n'; }

valid_slug()   { [[ "$1" =~ ^[a-z][a-z0-9-]{1,23}$ && "$1" != *- ]]; }
valid_domain() { [[ "$1" =~ ^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$ ]]; }
valid_email()  { [[ "$1" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; }

slug_from_domain() {
  local s="${1%%.*}"
  s="$(printf '%s' "$s" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9-' '-' | sed 's/^-*//; s/-*$//')"
  [[ "$s" =~ ^[a-z] ]] || s="hr-$s"
  printf '%s' "${s:0:24}" | sed 's/-*$//'
}

# Quote a value for a dotenv file (dotenv 16+/17 rules).
env_quote() {
  local v="$1"
  v="${v//$'\n'/ }"
  if [[ "$v" =~ ^[A-Za-z0-9_./:@,+=-]*$ ]]; then printf '%s' "$v"
  elif [[ "$v" != *"'"* ]]; then printf "'%s'" "$v"
  elif [[ "$v" != *'"'* && "$v" != *'\'* ]]; then printf '"%s"' "$v"
  elif [[ "$v" != *'`'* ]]; then printf '`%s`' "$v"
  else die "A setting contains every quote character (' \" \`) and cannot be stored safely: ${v:0:12}..."
  fi
}

version_ge() { [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" == "$2" ]]; }

port_in_use() { ss -Hltn "( sport = :$1 )" 2>/dev/null | grep -q .; }

next_free_port() {
  local p="${1:-8080}" used
  used="$(grep -h '^PORT=' "$HRP_ETC"/*/instance.conf 2>/dev/null | cut -d= -f2 | tr -d '"' || true)"
  while port_in_use "$p" || grep -qx "$p" <<<"$used"; do p=$((p + 1)); done
  printf '%s' "$p"
}

apt_install() {
  export DEBIAN_FRONTEND=noninteractive
  if [[ -z "${_HRP_APT_UPDATED:-}" ]]; then apt-get update -y; _HRP_APT_UPDATED=1; fi
  apt-get install -y --no-install-recommends "$@"
}

# ---------- instance registry -----------------------------------------------

instance_dir()  { printf '%s/%s' "$HRP_ETC" "$1"; }
instance_conf() { printf '%s/%s/instance.conf' "$HRP_ETC" "$1"; }
list_instances() {
  local f
  for f in "$HRP_ETC"/*/instance.conf; do [[ -f "$f" ]] && basename "$(dirname "$f")"; done
}

load_instance() {
  local slug="$1" f
  f="$(instance_conf "$slug")"
  [[ -f "$f" ]] || die "No installation named '$slug'. Run 'hrpayrollctl list'."
  # shellcheck disable=SC1090
  source "$f"
}

write_instance_conf() {
  local f; f="$(instance_conf "$SLUG")"
  install -d -m 0750 "$(dirname "$f")"
  umask 077
  cat >"$f" <<EOF
# Managed by the $PRODUCT_NAME installer. Do not edit unless you know why.
SLUG=$(printf '%q' "$SLUG")
DOMAIN=$(printf '%q' "$DOMAIN")
EXTRA_ORIGINS=$(printf '%q' "${EXTRA_ORIGINS:-}")
PORT=$(printf '%q' "$PORT")
APP_USER=$(printf '%q' "$APP_USER")
APP_ROOT=$(printf '%q' "$APP_ROOT")
DATA_DIR=$(printf '%q' "$DATA_DIR")
BACKUP_DIR=$(printf '%q' "$BACKUP_DIR")
DB_NAME=$(printf '%q' "$DB_NAME")
DB_USER=$(printf '%q' "$DB_USER")
PG_BIN_DIR=$(printf '%q' "$PG_BIN_DIR")
PG_FLAVOR=$(printf '%q' "$PG_FLAVOR")
NGINX_FLAVOR=$(printf '%q' "$NGINX_FLAVOR")
NGINX_CONF=$(printf '%q' "$NGINX_CONF")
SSL_ENABLED=$(printf '%q' "${SSL_ENABLED:-0}")
SSL_EMAIL=$(printf '%q' "${SSL_EMAIL:-}")
SERVICE=$(printf '%q' "$SERVICE")
INSTALLED_AT=$(printf '%q' "${INSTALLED_AT:-$(date -Is)}")
EOF
  umask 022
  chmod 0600 "$f"
}

env_file() { printf '%s/%s/app.env' "$HRP_ETC" "$1"; }

# Read one key from the instance's app.env without sourcing it.
env_get() {
  local file="$1" key="$2"
  sed -n "s/^${key}=//p" "$file" | tail -n1 | sed -E "s/^'(.*)'$/\1/; s/^\"(.*)\"$/\1/; s/^\`(.*)\`$/\1/"
}

# Set or replace one key in app.env.
env_set() {
  local file="$1" key="$2" value tmp
  value="$(env_quote "$3")"
  tmp="$(mktemp)"
  if grep -q "^${key}=" "$file"; then
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k{print k"="v; next} {print}' "$file" >"$tmp"
  else
    cat "$file" >"$tmp"; printf '%s=%s\n' "$key" "$value" >>"$tmp"
  fi
  cat "$tmp" >"$file"; rm -f "$tmp"
}

# ---------- environment detection -------------------------------------------

AAPANEL=0
detect_aapanel() {
  if [[ -d /www/server/panel && -f /www/server/panel/class/common.py ]] || [[ -x /etc/init.d/bt ]]; then AAPANEL=1; fi
}

detect_os() {
  [[ -r /etc/os-release ]] || die "Cannot detect the operating system."
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_ID="$ID"; OS_VERSION="$VERSION_ID"; OS_PRETTY="$PRETTY_NAME"
  case "$(uname -m)" in
    x86_64) NODE_ARCH=x64 ;;
    aarch64|arm64) NODE_ARCH=arm64 ;;
    *) die "Unsupported CPU architecture $(uname -m)." ;;
  esac
}

# ---------- Node.js runtime -------------------------------------------------
# A private, checksum-verified Node runtime under /opt/hrpayroll so the app
# never depends on (or breaks) aaPanel's Node manager or another site's Node.

node_bin() { printf '%s/bin/node' "$HRP_NODE_LINK"; }
npm_bin()  { printf '%s/bin/npm' "$HRP_NODE_LINK"; }

ensure_node() {
  local want="$HRP_NODE_MAJOR" have=""
  if [[ -x "$(node_bin)" ]]; then have="$("$(node_bin)" -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"; fi
  if [[ "$have" == "$want" ]]; then echo "Node $("$(node_bin)" -v) already present."; return 0; fi

  command -v xz >/dev/null || apt_install xz-utils
  local base="https://nodejs.org/dist/latest-v${want}.x" tmp file sum
  tmp="$(mktemp -d)"
  curl -fsSL --retry 3 "$base/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
  file="$(awk -v a="linux-${NODE_ARCH}.tar.xz" '$2 ~ a"$" {print $2; exit}' "$tmp/SHASUMS256.txt")"
  [[ -n "$file" ]] || { rm -rf "$tmp"; echo "No Node $want build for linux-$NODE_ARCH."; return 1; }
  curl -fsSL --retry 3 "$base/$file" -o "$tmp/$file"
  sum="$(awk -v f="$file" '$2==f {print $1}' "$tmp/SHASUMS256.txt")"
  echo "$sum  $tmp/$file" | sha256sum -c - || { rm -rf "$tmp"; echo "Node download failed its checksum."; return 1; }
  install -d "$HRP_OPT"
  tar -xJf "$tmp/$file" -C "$HRP_OPT"
  ln -sfn "$HRP_OPT/${file%.tar.xz}" "$HRP_NODE_LINK"
  rm -rf "$tmp"
  "$(node_bin)" -v
}

# ---------- PostgreSQL ------------------------------------------------------

PG_FLAVOR=""; PG_BIN_DIR=""; PG_SUPER_MODE=""
detect_postgres() {
  if [[ -x /www/server/pgsql/bin/psql ]]; then
    PG_FLAVOR=aapanel; PG_BIN_DIR=/www/server/pgsql/bin
  elif ls /usr/lib/postgresql/*/bin/psql >/dev/null 2>&1; then
    PG_FLAVOR=system
    PG_BIN_DIR="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -n1)"
  else
    PG_FLAVOR=none
  fi
}

install_postgres() {
  apt_install postgresql postgresql-contrib
  systemctl enable --now postgresql
  detect_postgres
}

pg_server_running() {
  "$PG_BIN_DIR/pg_isready" -q -h 127.0.0.1 -p "${PG_PORT:-5432}" 2>/dev/null
}

# Superuser psql. Tries peer auth as the postgres OS user over the local
# socket, then password auth over TCP with PG_SUPER_PASSWORD.
pg_super() {
  case "$PG_SUPER_MODE" in
    peer)
      (cd / && runuser -u postgres -- "$PG_BIN_DIR/psql" -X -q -v ON_ERROR_STOP=1 -p "${PG_PORT:-5432}" "$@") ;;
    password)
      PGPASSWORD="$PG_SUPER_PASSWORD" "$PG_BIN_DIR/psql" -X -q -v ON_ERROR_STOP=1 \
        -h 127.0.0.1 -p "${PG_PORT:-5432}" -U "${PG_SUPER_USER:-postgres}" "$@" ;;
    *) echo "PostgreSQL superuser access was not established."; return 1 ;;
  esac
}

probe_pg_super() {
  PG_SUPER_MODE=peer
  if id postgres >/dev/null 2>&1 && pg_super -d postgres -tAc 'select 1' >/dev/null 2>&1; then return 0; fi
  if [[ -n "${PG_SUPER_PASSWORD:-}" ]]; then
    PG_SUPER_MODE=password
    pg_super -d postgres -tAc 'select 1' >/dev/null 2>&1 && return 0
  fi
  PG_SUPER_MODE=""
  return 1
}

create_database() {
  pg_super -d postgres -v dbuser="$DB_USER" -v dbpass="$DB_PASS" -v dbname="$DB_NAME" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'dbuser', :'dbpass')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'dbuser') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'dbuser', :'dbpass') \gexec
SELECT format('CREATE DATABASE %I OWNER %I ENCODING %L TEMPLATE template0', :'dbname', :'dbuser', 'UTF8')
  WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'dbname') \gexec
SQL
  pg_super -d "$DB_NAME" -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto;'
  PGPASSWORD="$DB_PASS" "$PG_BIN_DIR/psql" -X -q -h 127.0.0.1 -p "${PG_PORT:-5432}" -U "$DB_USER" -d "$DB_NAME" -tAc 'select 1' >/dev/null \
    || { echo "The new database user cannot log in over 127.0.0.1. Check pg_hba.conf allows md5/scram for host 127.0.0.1/32."; return 1; }
}

database_table_count() {
  pg_super -d "$1" -tAc "select count(*) from information_schema.tables where table_schema='public'" 2>/dev/null || echo 0
}

database_exists() {
  [[ "$(pg_super -d postgres -v n="$1" -tA <<<"select 1 from pg_database where datname = :'n'" 2>/dev/null)" == 1 ]]
}

# ---------- nginx -----------------------------------------------------------

NGINX_FLAVOR=""; NGINX_BIN=""; NGINX_VHOST_DIR=""
detect_nginx() {
  if [[ -x /www/server/nginx/sbin/nginx ]]; then
    NGINX_FLAVOR=aapanel; NGINX_BIN=/www/server/nginx/sbin/nginx; NGINX_VHOST_DIR=/www/server/panel/vhost/nginx
  elif command -v nginx >/dev/null 2>&1; then
    NGINX_FLAVOR=system; NGINX_BIN="$(command -v nginx)"; NGINX_VHOST_DIR=/etc/nginx/conf.d
  else
    NGINX_FLAVOR=none
  fi
}

install_nginx() {
  apt_install nginx
  systemctl enable --now nginx
  detect_nginx
}

nginx_version() { "$NGINX_BIN" -v 2>&1 | sed -n 's#.*nginx/\([0-9.]*\).*#\1#p'; }

nginx_reload() {
  "$NGINX_BIN" -t || return 1
  if [[ "$NGINX_FLAVOR" == aapanel ]]; then
    /etc/init.d/nginx reload 2>/dev/null || "$NGINX_BIN" -s reload
  else
    systemctl reload nginx
  fi
}

# Is this server_name already served by some other vhost file?
domain_taken_by_other_vhost() {
  local domain="$1" own="$2" f
  for f in "$NGINX_VHOST_DIR"/*.conf /etc/nginx/sites-enabled/*; do
    [[ -f "$f" && "$f" != "$own" ]] || continue
    if grep -Eq "server_name[^;]*[[:space:]]${domain//./\\.}([[:space:]]|;)" "$f"; then printf '%s' "$f"; return 0; fi
  done
  return 1
}

_nginx_proxy_block() {
  cat <<EOF
    client_max_body_size 25m;

    location ^~ /.well-known/acme-challenge/ {
        root $HRP_ACME_ROOT;
        default_type text/plain;
        try_files \$uri =404;
    }

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$http_connection;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
EOF
}

# write_vhost http|https  (uses DOMAIN, PORT, NGINX_CONF)
write_vhost() {
  local mode="$1" v6=0 listen443 h2line=""
  [[ -f /proc/net/if_inet6 ]] && v6=1
  install -d -m 0755 "$HRP_ACME_ROOT"
  {
    echo "# $PRODUCT_NAME — instance '$SLUG'. Managed by hrpayrollctl; edits are overwritten."
    echo "server {"
    echo "    listen 80;"
    (( v6 )) && echo "    listen [::]:80;"
    echo "    server_name $DOMAIN;"
    echo "    access_log $HRP_LOG_DIR/$SLUG-access.log;"
    echo "    error_log  $HRP_LOG_DIR/$SLUG-error.log warn;"
    if [[ "$mode" == https ]]; then
      cat <<EOF

    location ^~ /.well-known/acme-challenge/ {
        root $HRP_ACME_ROOT;
        default_type text/plain;
        try_files \$uri =404;
    }

    location / { return 301 https://\$host\$request_uri; }
}

EOF
      if version_ge "$(nginx_version)" 1.25.1; then listen443="listen 443 ssl;"; h2line="    http2 on;"
      else listen443="listen 443 ssl http2;"; fi
      echo "server {"
      echo "    $listen443"
      (( v6 )) && echo "    listen [::]:${listen443#listen }"
      [[ -n "$h2line" ]] && echo "$h2line"
      echo "    server_name $DOMAIN;"
      echo "    access_log $HRP_LOG_DIR/$SLUG-access.log;"
      echo "    error_log  $HRP_LOG_DIR/$SLUG-error.log warn;"
      cat <<EOF

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:hrpayroll_ssl:10m;
    ssl_session_timeout 1d;

EOF
    else
      echo
    fi
    _nginx_proxy_block
    echo "}"
  } >"$NGINX_CONF.new"
  mv -f "$NGINX_CONF.new" "$NGINX_CONF"
}

# ---------- TLS (Let's Encrypt) ---------------------------------------------

ensure_certbot() {
  command -v certbot >/dev/null 2>&1 || apt_install certbot
  install -d /etc/letsencrypt/renewal-hooks/deploy
  cat >/etc/letsencrypt/renewal-hooks/deploy/hrpayroll-reload-nginx.sh <<'EOF'
#!/bin/sh
# Reload whichever nginx serves the HR & Payroll sites after a certificate renewal.
if [ -x /www/server/nginx/sbin/nginx ]; then
  /www/server/nginx/sbin/nginx -t && { /etc/init.d/nginx reload 2>/dev/null || /www/server/nginx/sbin/nginx -s reload; }
elif command -v nginx >/dev/null 2>&1; then
  nginx -t && systemctl reload nginx
fi
EOF
  chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/hrpayroll-reload-nginx.sh
  systemctl enable --now certbot.timer 2>/dev/null || true
}

issue_certificate() {
  local email="$1"
  ensure_certbot
  local args=(certonly --webroot -w "$HRP_ACME_ROOT" -d "$DOMAIN" --non-interactive --agree-tos --keep-until-expiring)
  if [[ -n "$email" ]]; then args+=(--email "$email" --no-eff-email); else args+=(--register-unsafely-without-email); fi
  [[ -n "${HRP_CERTBOT_STAGING:-}" ]] && args+=(--staging)
  certbot "${args[@]}"
  [[ -s "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]
}

# Point APP_URL / ALLOWED_ORIGIN / PORTAL_URL at http or https for DOMAIN.
apply_urls() {
  local scheme="$1" file="$2" origins
  origins="$scheme://$DOMAIN"
  [[ -n "${EXTRA_ORIGINS:-}" ]] && origins="$origins,$EXTRA_ORIGINS"
  env_set "$file" APP_URL "$scheme://$DOMAIN"
  env_set "$file" PORTAL_URL "$scheme://$DOMAIN"
  env_set "$file" ALLOWED_ORIGIN "$origins"
}

# Can this server reach itself through the domain? Proves DNS points here
# before asking Let's Encrypt (whose failures are rate-limited).
acme_self_check() {
  local token; token="hrp-$(rand_hex 12)"
  install -d -m 0755 "$HRP_ACME_ROOT/.well-known/acme-challenge"
  printf '%s' "$token" >"$HRP_ACME_ROOT/.well-known/acme-challenge/$token"
  local got; got="$(curl -fsS -m 8 "http://$DOMAIN/.well-known/acme-challenge/$token" 2>/dev/null || true)"
  rm -f "$HRP_ACME_ROOT/.well-known/acme-challenge/$token"
  [[ "$got" == "$token" ]]
}

# ---------- app runtime -----------------------------------------------------

health_wait() {
  local port="$1" tries="${2:-60}" i
  for ((i = 0; i < tries; i++)); do
    if curl -fsS -m 3 "http://127.0.0.1:$port/api/health" 2>/dev/null | grep -q '"ok":true'; then return 0; fi
    sleep 1
  done
  return 1
}

app_run() {
  # app_run <dir> <cmd...>   — run as the instance user inside a release dir
  local dir="$1"; shift
  (cd "$dir" && runuser -u "$APP_USER" -- env HOME="$APP_ROOT" PATH="$HRP_NODE_LINK/bin:/usr/bin:/bin" NODE_ENV=production "$@")
}

npm_install_release() {
  local dir="$1" cache="/var/cache/hrpayroll/$SLUG"
  install -d -o "$APP_USER" -g "$APP_USER" -m 0700 "$cache"
  chown -R "$APP_USER:$APP_USER" "$dir"
  app_run "$dir" env ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm_config_cache="$cache" \
    npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false \
    "$(npm_bin)" ci --omit=dev --ignore-scripts --no-audit --no-fund
  # The release tree is read-only to the service user; only node_modules caches stay writable.
  chown -R root:"$APP_USER" "$dir"
  chmod -R u=rwX,g=rX,o= "$dir"
}

link_release_env() {
  local dir="$1"
  rm -f "$dir/.env" "$dir/.env.local" "$dir/.env.production"
  ln -s "$(env_file "$SLUG")" "$dir/.env"
}

run_migrations() { app_run "$1" "$(node_bin)" scripts/postgres-migrate.cjs; }

write_systemd_unit() {
  cat >"/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=$PRODUCT_NAME ($SLUG — $DOMAIN)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_ROOT/current
Environment=NODE_ENV=production
ExecStart=$(node_bin) server.cjs
Restart=always
RestartSec=3
TimeoutStopSec=20
LimitNOFILE=65535
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictSUIDSGID=true
ReadWritePaths=$DATA_DIR $BACKUP_DIR
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
}

write_backup_cron() {
  cat >"/etc/cron.d/$SERVICE" <<EOF
# Nightly encrypted PostgreSQL backup for $DOMAIN ($SLUG)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
${BACKUP_CRON:-15 2 * * *} root /usr/local/bin/hrpayrollctl backup $SLUG >>$HRP_LOG_DIR/$SLUG-backup.log 2>&1
EOF
  chmod 0644 "/etc/cron.d/$SERVICE"
}

write_logrotate() {
  cat >/etc/logrotate.d/hrpayroll <<EOF
$HRP_LOG_DIR/*.log {
    weekly
    rotate 8
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
}
EOF
}

# Switch current -> release and restart; returns non-zero if health fails.
activate_release() {
  local release="$1"
  ln -sfn "$release" "$APP_ROOT/current.new"
  mv -Tf "$APP_ROOT/current.new" "$APP_ROOT/current"
  systemctl restart "$SERVICE"
  health_wait "$PORT" 60
}

prune_releases() {
  local keep="${1:-3}" current
  current="$(readlink -f "$APP_ROOT/current")"
  ls -1dt "$APP_ROOT"/releases/*/ 2>/dev/null | sed 's#/$##' | tail -n +"$((keep + 1))" | while read -r r; do
    [[ "$(readlink -f "$r")" == "$current" ]] || rm -rf "$r"
  done
}
