#!/usr/bin/env bash
# =====================================================================================================
#  HR & Payroll - server install and update script (Ubuntu 24.04 with aaPanel)
#
#  Copy only this file to the server (aaPanel -> Files, e.g. /root) and run it as root, for example in
#  aaPanel -> Terminal. Every update is the same:  bash /root/hrpayroll-server.sh update  then Restart in aaPanel.
#
#  What it does
#    setup   Creates a read-only "deploy key" (SSH key) so this server can download the PRIVATE GitHub
#            repository, shows you the key to add on GitHub, downloads the code, installs the packages,
#            builds the web app, writes .env with new random keys, prepares the database and the first admin.
#            An existing install that was uploaded by hand is converted: its .env is kept.
#    update  Backs up the database and prepares the new version in a separate folder (code, packages, web
#            build, database changes) while the site keeps running; then swaps it in. Restart in aaPanel.
#    check   Health check: code version, .env, database, the running app and the public address.
#    key     Shows the public deploy key again.
#    db      Asks the database name, user and password again and updates the database.
#    admin   Creates the first administrator, or sets a new password for an administrator.
#    backup  Encrypted database backup (for aaPanel -> Cron).
#    vendor  Shows this server's OneNet vendor-console password (creates one if it is missing).
#    rollback Switches back to the version before the last update (then Restart in aaPanel).
#
#  Usage (as root; when you log in as another user such as onenetsol, put sudo in front):
#    sudo bash hrpayroll-server.sh setup
#    sudo bash hrpayroll-server.sh update
#    sudo bash hrpayroll-server.sh check
#    sudo bash hrpayroll-server.sh key | db | admin | backup | vendor
#
#  Settings you can change by putting them in front of the command, for example
#    APP_DIR=/www/wwwroot/hr BRANCH=main bash hrpayroll-server.sh setup
#      APP_DIR   where the code lives            (default /www/wwwroot/hr-payroll, the live install)
#      DATA_DIR  documents and backups, new installs only (default /www/hrpayroll-data, outside the web root)
#      BRANCH    Git branch to deploy            (setup suggests the newest branch on GitHub;
#                                                 update keeps the branch the server is on)
#      RUN_USER  user the app runs as            (default www, aaPanel's web user). It owns ONLY the data
#                                                 folders (documents, backups) and can read .env; the code, .git
#                                                 and node_modules belong to root, because root runs them here.
#      KEY_FILE  deploy key                      (default /root/.ssh/hrpayroll_deploy_ed25519)
#
#  Done in aaPanel, not by this script (on purpose):
#    - Node.js itself: aaPanel -> Website -> Node project -> Node version manager (install Node 22).
#    - The PostgreSQL database and its user: aaPanel -> Databases -> PgSQL -> Add database.
#    - Running the app, the domain, HTTPS, the firewall and the scheduled backup: aaPanel Node project,
#      Mapping, SSL, Security and Cron. The script prints the exact values at the end of setup.
# =====================================================================================================
set -euo pipefail

REPO_DEFAULT="git@github.com:onenet786/HR-Payroll-Management-System.git"
APP_DIR="${APP_DIR:-/www/wwwroot/hr-payroll}"
DATA_DIR="${DATA_DIR:-/www/hrpayroll-data}"
BRANCH="${BRANCH:-}"
RUN_USER="${RUN_USER:-www}"
KEY_FILE="${KEY_FILE:-/root/.ssh/hrpayroll_deploy_ed25519}"
ENV_FILE="$APP_DIR/.env"

# ---------- helpers ----------
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
info()  { printf '\033[36m==>\033[0m %s\n' "$*"; }
ok()    { printf '\033[32m OK\033[0m %s\n' "$*"; }
warn()  { printf '\033[33m !!\033[0m %s\n' "$*"; }
die()   { printf '\033[31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }
interactive() { [ -t 0 ]; }
ask() {   # ask "Question" "default"  -> prints the answer (or the default when not interactive)
  local q="$1" def="${2:-}" ans=""
  if interactive; then read -r -p "$q${def:+ [$def]}: " ans || true; fi
  printf '%s' "${ans:-$def}"
}
ask_yn() {   # ask_yn "Question" "y|n" -> 0 for yes, 1 for no
  local q="$1" def="${2:-y}" ans
  interactive || { [ "$def" = "y" ]; return; }
  while true; do
    read -r -p "$q (y/n) [$def]: " ans || ans="$def"
    case "${ans:-$def}" in
      y|Y|yes|YES|Yes) return 0 ;;
      n|N|no|NO|No)    return 1 ;;
      *) echo "  Please type y or n." ;;
    esac
  done
}
ask_secret() {
  local q="$1" ans=""
  if interactive; then read -r -s -p "$q: " ans || true; echo >&2; fi
  printf '%s' "$ans"
}

need_root() { [ "$(id -u)" -eq 0 ] || die "Run it as root: sudo bash $0 ${1:-}   (files and npm fail with 'permission denied' otherwise)."; }

need_git() {
  command -v git >/dev/null 2>&1 || die "git is not installed. Install it once with: apt-get install -y git   (then run this script again)."
  command -v ssh-keygen >/dev/null 2>&1 || die "ssh-keygen is missing. Install it with: apt-get install -y openssh-client"
}

need_installed() { [ -d "$APP_DIR/.git" ] || die "$APP_DIR is not installed yet. Run: bash $0 setup"; }

# Node.js installed by aaPanel's Node version manager (newest version 20 or later).
find_node() {
  local best="" v d
  for d in /www/server/nodejs/v*/bin; do
    [ -x "$d/node" ] || continue
    v="$(basename "$(dirname "$d")")"
    if [ "${v#v}" != "$v" ] && [ "$(printf '%s' "${v#v}" | cut -d. -f1)" -ge 20 ] 2>/dev/null; then
      if [ -z "$best" ] || [ "$(printf '%s\n%s\n' "$best" "$d" | sort -V | tail -1)" = "$d" ]; then best="$d"; fi
    fi
  done
  [ -n "$best" ] || die "Node.js 20 or newer was not found in /www/server/nodejs.
   Install it in aaPanel -> Website -> Node project -> Node version manager (choose Node 22), then run this again."
  NODE_BIN="$best"
  export PATH="$NODE_BIN:$PATH"
  ok "Node.js $("$NODE_BIN/node" -v) from aaPanel ($NODE_BIN)"
}

# pg_dump refuses a database newer than itself, so the newest client wins (the live database is PostgreSQL 18;
# aaPanel's /www/server/pgsql may be older). PG_DUMP_PATH in .env, when set, is always used instead.
find_pg_bin() {
  local d best="" bestv=0 v
  for d in /usr/lib/postgresql/*/bin /www/server/pgsql/bin; do
    [ -x "$d/pg_dump" ] || continue
    v="$("$d/pg_dump" --version 2>/dev/null | grep -oE '[0-9]+' | head -1)"
    if [ -n "$v" ] && [ "$v" -gt "$bestv" ]; then best="$d"; bestv="$v"; fi
  done
  if [ -n "$best" ]; then printf '%s' "$best"; return; fi
  command -v pg_dump >/dev/null 2>&1 && dirname "$(command -v pg_dump)"
}

# The branch with the newest commit on GitHub (work happens on branches such as B12; main can be far behind).
newest_branch() {   # newest_branch GIT_DIR
  git -C "$1" for-each-ref --sort=-committerdate --format='%(refname:lstrip=3)' refs/remotes/origin 2>/dev/null \
    | grep -v '^HEAD$' | head -1 || true
}

parse_repo() {
  local url="$1"
  case "$url" in
    git@*:*)      REPO_HOST="${url#git@}"; REPO_HOST="${REPO_HOST%%:*}"; REPO_PATH="${url#*:}" ;;
    ssh://git@*)  REPO_HOST="${url#ssh://git@}"; REPO_HOST="${REPO_HOST%%/*}"; REPO_PATH="${url#ssh://git@*/}" ;;
    https://*)    REPO_HOST="${url#https://}"; REPO_HOST="${REPO_HOST%%/*}"; REPO_PATH="${url#https://*/}" ;;
    *) die "Unrecognised repository address: $url" ;;
  esac
  REPO_PATH="${REPO_PATH%.git}.git"
  REPO_HOST_ALIAS="hrpayroll-${REPO_HOST}"
  REPO_SSH_URL="git@${REPO_HOST_ALIAS}:${REPO_PATH}"
}

# ---------- deploy key ----------
make_key() {
  mkdir -p /root/.ssh && chmod 700 /root/.ssh
  if [ -f "$KEY_FILE" ]; then
    ok "Deploy key already exists: $KEY_FILE"
  else
    info "Creating a deploy key (ed25519, no passphrase, used only for this repository)"
    ssh-keygen -t ed25519 -N "" -C "hrpayroll-deploy@$(hostname)" -f "$KEY_FILE" >/dev/null
    chmod 600 "$KEY_FILE"
    ok "Created $KEY_FILE"
  fi
  # A host alias makes git use this key only for this repository, without touching other keys on the server.
  local cfg=/root/.ssh/config
  touch "$cfg" && chmod 600 "$cfg"
  if ! grep -q "^Host ${REPO_HOST_ALIAS}\$" "$cfg"; then
    cat >> "$cfg" <<EOF

# HR & Payroll deploy key (added by hrpayroll-server.sh)
Host ${REPO_HOST_ALIAS}
    HostName ${REPO_HOST}
    User git
    IdentityFile ${KEY_FILE}
    IdentitiesOnly yes
EOF
    ok "Added host alias ${REPO_HOST_ALIAS} to $cfg"
  fi
  pin_host_key
}

# GitHub's published SSH host key (docs.github.com -> "GitHub's SSH key fingerprints"):
#   ED25519  SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU
# It is written directly instead of trusting whatever answers ssh-keyscan (an attacker on the network could answer
# it). For another Git host the scanned key is shown with its fingerprint and must be confirmed.
GITHUB_ED25519="AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl"
GITHUB_ED25519_FP="SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU"
pin_host_key() {
  local kh=/root/.ssh/known_hosts line fp scanned
  touch "$kh" && chmod 600 "$kh"
  if [ "$REPO_HOST" = "github.com" ]; then
    line="github.com ssh-ed25519 $GITHUB_ED25519"
    fp="$(printf '%s\n' "$line" | ssh-keygen -lf - 2>/dev/null | awk '{print $2}')"
    [ "$fp" = "$GITHUB_ED25519_FP" ] || die "The built-in GitHub host key does not match its fingerprint (script damaged?)."
    if ! grep -qxF "$line" "$kh"; then
      # Older (scanned) github.com entries are replaced by the published key.
      ssh-keygen -R github.com -f "$kh" >/dev/null 2>&1 || true
      rm -f "$kh.old"
      printf '%s\n' "$line" >> "$kh"
      chmod 600 "$kh"
      ok "GitHub host key pinned ($GITHUB_ED25519_FP)"
    fi
    return 0
  fi
  ssh-keygen -F "$REPO_HOST" -f "$kh" >/dev/null 2>&1 && return 0
  scanned="$(ssh-keyscan -t ed25519 "$REPO_HOST" 2>/dev/null | grep -v '^#' || true)"
  [ -n "$scanned" ] || die "Could not read the SSH host key of $REPO_HOST."
  fp="$(printf '%s\n' "$scanned" | ssh-keygen -lf - 2>/dev/null | awk '{print $2}')"
  warn "Host key of $REPO_HOST: $fp"
  echo "     Compare it with the fingerprint your Git host publishes before you accept it."
  { interactive && ask_yn "Is this the correct fingerprint?" "n"; } \
    || die "Host key not accepted. Add the correct line for $REPO_HOST to $kh yourself, then run this again."
  printf '%s\n' "$scanned" >> "$kh"
  ok "Host key of $REPO_HOST saved"
}

show_key() {
  [ -f "$KEY_FILE.pub" ] || die "No deploy key yet. Run: bash $0 setup"
  echo
  bold "---------------- Public deploy key (copy the whole line) ----------------"
  cat "$KEY_FILE.pub"
  bold "------------------------------------------------------------------------"
  echo
  echo "Add it to the private repository as a READ-ONLY deploy key:"
  echo "  GitHub: github.com/onenet786/HR-Payroll-Management-System -> Settings -> Deploy keys -> Add deploy key"
  echo "          Title: HR server ($(hostname))   Key: the line above   [ ] Allow write access (leave OFF)"
  echo
}

test_access() {
  info "Checking access to ${REPO_HOST}:${REPO_PATH}"
  local tries=0
  until git ls-remote "$REPO_SSH_URL" HEAD >/dev/null 2>&1; do
    tries=$((tries + 1))
    if ! interactive || [ "$tries" -ge 5 ]; then
      die "The server cannot read the repository yet. Add the deploy key shown above, then run this script again."
    fi
    warn "Not allowed yet. Add the deploy key shown above, then press Enter to try again (Ctrl+C to stop)."
    read -r _ || true
  done
  ok "The server can read the repository"
}

# ---------- .env ----------
set_env() {   # set_env FILE KEY VALUE   (replaces "KEY=..." or "# KEY=..." or appends)
  local file="$1" key="$2" value="$3" tmp
  tmp="$(mktemp)"
  KEY="$key" VALUE="$value" awk '
    BEGIN { done = 0 }
    $0 ~ "^#? *" ENVIRON["KEY"] "=" && !done { print ENVIRON["KEY"] "=" ENVIRON["VALUE"]; done = 1; next }
    { print }
    END { if (!done) print ENVIRON["KEY"] "=" ENVIRON["VALUE"] }
  ' "$file" > "$tmp" && cat "$tmp" > "$file" && rm -f "$tmp"
}
# Reads KEY=value from an .env file; ignores Windows line endings (\r), surrounding quotes and trailing spaces.
get_env() { grep -E "^$2=" "$1" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r' | sed -E 's/[[:space:]]+$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/' || true; }
urlencode() { node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$1"; }
random_key() { node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64"))'; }
# Vendor console password (login "onenet"): random per server, 20 URL-safe characters.
random_vendor_password() { node -e 'process.stdout.write(require("crypto").randomBytes(15).toString("base64url"))'; }

free_port() {   # first free TCP port from 8080
  local p=8080
  while ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$p\$"; do p=$((p + 1)); done
  printf '%s' "$p"
}

make_env() {
  if [ -f "$ENV_FILE" ]; then
    ok ".env already exists (not changed)"
    return
  fi
  info "Creating .env"
  cp "$APP_DIR/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  local domain email company port pgbin
  echo
  bold "Server settings (press Enter to keep the value in brackets; you can change them later in $ENV_FILE)"
  domain="$(ask "HR web address (domain), e.g. hr.yourcompany.com" "")"
  domain="${domain#https://}"; domain="${domain#http://}"; domain="${domain%/}"
  email="$(ask "Administrator / SSL contact e-mail" "")"
  company="$(ask "Company name" "")"
  port="$(ask "Internal port for the app" "$(free_port)")"
  pgbin="$(find_pg_bin || true)"

  set_env "$ENV_FILE" DATA_BACKEND postgres
  set_env "$ENV_FILE" PG_POOL_MAX 10
  set_env "$ENV_FILE" PG_SSL false
  set_env "$ENV_FILE" PG_SSL_REJECT_UNAUTHORIZED false
  set_env "$ENV_FILE" PORT "$port"
  set_env "$ENV_FILE" HOST 127.0.0.1
  set_env "$ENV_FILE" NODE_ENV production
  set_env "$ENV_FILE" DEBUG false
  set_env "$ENV_FILE" VITE_API_BASE_URL ""
  set_env "$ENV_FILE" VITE_API_POLL_MS 5000
  if [ -n "$domain" ]; then
    set_env "$ENV_FILE" APP_URL "https://$domain"
    set_env "$ENV_FILE" PORTAL_URL "https://$domain"
    set_env "$ENV_FILE" ALLOWED_ORIGIN "https://$domain"
  else
    warn "No domain given: set APP_URL, PORTAL_URL and ALLOWED_ORIGIN in $ENV_FILE later."
  fi
  set_env "$ENV_FILE" BACKUP_ENCRYPTION_KEY "$(random_key)"
  set_env "$ENV_FILE" MFA_ENCRYPTION_KEY "$(random_key)"
  set_env "$ENV_FILE" VENDOR_CONSOLE_PASSWORD "$(random_vendor_password)"
  [ -n "$company" ] && set_env "$ENV_FILE" MFA_ISSUER "$company HR"
  set_env "$ENV_FILE" BACKUP_DIR "$DATA_DIR/backups"
  set_env "$ENV_FILE" BACKUP_RETENTION_COUNT 14
  set_env "$ENV_FILE" DOCUMENT_STORAGE_PATH "$DATA_DIR/documents"
  set_env "$ENV_FILE" MFA_ENFORCE_PRIVILEGED false
  if [ -n "$pgbin" ]; then
    set_env "$ENV_FILE" PG_DUMP_PATH "$pgbin/pg_dump"
    set_env "$ENV_FILE" PG_RESTORE_PATH "$pgbin/pg_restore"
  fi
  # Remembered for the first administrator (setup) and the summary box; not secret.
  SETUP_DOMAIN="$domain"; SETUP_EMAIL="$email"; SETUP_COMPANY="$company"
  ask_database
  ok "Created .env with new random BACKUP_ENCRYPTION_KEY and MFA_ENCRYPTION_KEY"
  warn "Keep a copy of $ENV_FILE OFF this server: without BACKUP_ENCRYPTION_KEY the backups cannot be restored."
}

ask_database() {
  local dbname dbuser dbpass
  echo "Database: it must already exist in aaPanel -> Databases -> PgSQL -> Add database"
  echo "          (aaPanel creates a database user with the same name and the password you choose there)."
  dbname="$(ask "  Database name" "hrpayroll")"
  dbuser="$(ask "  Database user" "$dbname")"
  dbpass="$(ask_secret "  Database password (from aaPanel; leave empty to fill in later)")"
  if [ -n "$dbpass" ]; then
    set_env "$ENV_FILE" DATABASE_URL "postgresql://$(urlencode "$dbuser"):$(urlencode "$dbpass")@127.0.0.1:5432/$(urlencode "$dbname")"
    ok "Database settings saved"
  else
    warn "No database password given. When the database exists, run: bash $0 db"
  fi
}

database_ready() {
  local url; url="$(get_env "$ENV_FILE" DATABASE_URL)"
  [ -n "$url" ] && [ "${url#*CHANGE_ME}" = "$url" ] && [ "${url#*://}" != "$url" ]
}

# ---------- install / update steps ----------
install_packages() {
  local lock="$APP_DIR/package-lock.json"
  # aaPanel (or a manual "npm install") sometimes deletes or rewrites the lock file: take it back from Git.
  if git -C "$APP_DIR" ls-files --error-unmatch package-lock.json >/dev/null 2>&1; then
    if [ ! -f "$lock" ] || ! git -C "$APP_DIR" diff --quiet -- package-lock.json; then
      git -C "$APP_DIR" checkout -- package-lock.json && ok "Restored package-lock.json from Git"
    fi
  fi
  # The web app is built here, so the build tools (devDependencies) are needed too. The Electron and
  # Capacitor tools in the same package are never run on the server: skip their large downloads.
  export ELECTRON_SKIP_BINARY_DOWNLOAD=1 PUPPETEER_SKIP_DOWNLOAD=1
  # npm runs as root here, so package install scripts are NOT run (--ignore-scripts). Nothing the server needs has
  # one: esbuild finds its platform binary without its postinstall; the others are Electron/Windows build tools.
  if [ -f "$lock" ]; then
    info "Installing Node packages (npm ci; a few minutes the first time)"
    (cd "$APP_DIR" && npm ci --include=dev --ignore-scripts --no-audit --no-fund --loglevel=error)
  else
    warn "package-lock.json is missing: using npm install instead of npm ci"
    (cd "$APP_DIR" && npm install --include=dev --ignore-scripts --no-audit --no-fund --loglevel=error)
  fi
  ok "Packages installed"
}

build_web() {
  info "Building the web app (vite build)"
  # Same-origin API: the browser calls the address it opened, so the bundle works on any domain.
  (cd "$APP_DIR" && VITE_API_BASE_URL="" NODE_ENV=production NODE_OPTIONS="--max-old-space-size=3072" npx vite build --logLevel error) \
    || die "The web build failed (see above). The running app is not affected until you restart it."
  [ -f "$APP_DIR/dist/index.html" ] || die "The web build produced no dist/index.html."
  ok "Web app built (dist/)"
}

migrate_db() {
  if ! database_ready; then
    warn "Skipped the database update: DATABASE_URL in .env is not filled in yet. Run: bash $0 db"
    return 1
  fi
  info "Updating the database (postgres-migrate)"
  local out
  if out="$(cd "$APP_DIR" && timeout 300 node scripts/postgres-migrate.cjs 2>&1)"; then
    printf '%s\n' "$out" | grep -E '^Applied' | sed 's/^/     /' || true
    ok "Database is up to date"
  else
    warn "The database update FAILED:"
    printf '%s\n' "$out" | grep -m1 -iE 'error|ECONNREFUSED|does not exist|password' | sed 's/^/     /' || true
    case "$out" in
      *"role"*"does not exist"*|*"database"*"does not exist"*)
        echo "     The database or its user does not exist yet. In aaPanel -> Databases -> PgSQL -> Add database,"
        echo "     create it (name and user as entered here), then run: bash $0 db" ;;
      *"password authentication failed"*)
        echo "     Wrong database password. Check it in aaPanel -> Databases -> PgSQL, then run: bash $0 db" ;;
      *ECONNREFUSED*|*"timeout"*|*"Connection terminated"*|"")
        echo "     PostgreSQL is not running. Start it in aaPanel -> App Store -> PostgreSQL, then run: bash $0 db" ;;
      *) echo "     Fix the problem, then run: bash $0 db" ;;
    esac
    return 1
  fi
}

prepare_dirs() {
  mkdir -p "$DATA_DIR/documents" "$DATA_DIR/backups"
  chmod 700 "$DATA_DIR" "$DATA_DIR/documents" "$DATA_DIR/backups"
}

# The folders the app itself writes to while it runs (as RUN_USER): employee documents and backups (the app makes a
# safety backup before a data import). Paths come from .env; relative ones are relative to the app folder (its
# working directory). Without a setting, the app's own defaults apply.
data_dirs() {
  local docs bdir
  docs="$(get_env "$ENV_FILE" DOCUMENT_STORAGE_PATH)"; docs="${docs:-$(dirname "$APP_DIR")/hr-payroll-private-documents}"
  bdir="$(get_env "$ENV_FILE" BACKUP_DIR)"; bdir="${bdir:-$APP_DIR/backups}"
  case "$docs" in /*) ;; *) docs="$APP_DIR/$docs" ;; esac
  case "$bdir" in /*) ;; *) bdir="$APP_DIR/$bdir" ;; esac
  printf '%s\n' "$docs" "$bdir"
}

# Ownership: root runs code from the app folder (update, migrations, admin, backup), so the code, .git and
# node_modules belong to root and are only readable for the app user. Otherwise a compromised website running as
# www could plant code or Git settings that root then runs. RUN_USER owns only the data folders and can read .env.
fix_owner() {
  id "$RUN_USER" >/dev/null 2>&1 || { warn "User $RUN_USER does not exist: ownership not changed."; return 0; }
  local f d
  chown -R root:root "$APP_DIR"
  chmod -R go-w,go+rX "$APP_DIR"
  for f in "$APP_DIR/.env" "$APP_DIR/.env.local"; do
    if [ -f "$f" ]; then chown "root:$RUN_USER" "$f"; chmod 640 "$f"; fi
  done
  if [ -d "$DATA_DIR" ]; then chown "$RUN_USER:$RUN_USER" "$DATA_DIR"; chmod 700 "$DATA_DIR"; fi
  while IFS= read -r d; do
    d="$(readlink -m "$d")"
    case "$d" in
      /|/www|/www/wwwroot|/root|/root/*|"$APP_DIR"|"$APP_DIR"/.git|"$APP_DIR"/.git/*|"$APP_DIR"/node_modules|"$APP_DIR"/node_modules/*)
        warn "Not giving $RUN_USER the data folder $d (unsafe place: change it in .env)"; continue ;;
    esac
    case "$APP_DIR/" in "$d"/*) warn "Not giving $RUN_USER the data folder $d (it contains the app folder)"; continue ;; esac
    mkdir -p "$d"
    chown -R "$RUN_USER:$RUN_USER" "$d"
    chmod 700 "$d"
  done < <(data_dirs)
  ok "Code owned by root (read-only for $RUN_USER); .env readable by $RUN_USER; data folders owned by $RUN_USER"
}

# Older versions of this script gave the app folder to www and told Git to trust it (safe.directory). Those entries
# are removed: the folder belongs to root now, so Git needs no exception for it.
drop_old_trust() {
  local d
  for d in "$1" "$1/.git" "$1.new" "$1.new/.git"; do
    git config --global --fixed-value --unset-all safe.directory "$d" >/dev/null 2>&1 || true
  done
}

# True when the app folder, .git and everything outside node_modules belongs to root (node_modules is checked by
# its top folder only, to stay fast).
code_is_root_owned() {
  [ "$(stat -c %u "$APP_DIR" 2>/dev/null)" = 0 ] || return 1
  [ ! -e "$APP_DIR/node_modules" ] || [ "$(stat -c %u "$APP_DIR/node_modules")" = 0 ] || return 1
  # Data folders inside the app folder (documents, backups) belong to the app user on purpose: skip them.
  local prune=(-path "$APP_DIR/node_modules") d
  while IFS= read -r d; do
    d="$(readlink -m "$d")"
    case "$d" in "$APP_DIR"/*) prune+=(-o -path "$d") ;; esac
  done < <(data_dirs)
  [ -z "$(find "$APP_DIR" \( "${prune[@]}" \) -prune -o ! -uid 0 -print -quit 2>/dev/null)" ]
}

# Lists (up to 10) files in the app folder that do not belong to root, for the check message.
not_root_owned() {
  find "$APP_DIR" -path "$APP_DIR/node_modules" -prune -o ! -uid 0 -printf '     %u  %p\n' 2>/dev/null | head -10
}

# Fills the named array with the command prefix that runs a program as the app user (empty when not root).
as_app_user() {
  local -n _as="$1"; _as=()
  if [ "$(id -u)" -eq 0 ] && id "$RUN_USER" >/dev/null 2>&1 && command -v runuser >/dev/null 2>&1; then _as=(runuser -u "$RUN_USER" --); fi
}

run_backup() {   # quiet=1 for cron
  database_ready || { warn "No DATABASE_URL in .env: backup skipped."; return 1; }
  [ -n "$(get_env "$ENV_FILE" BACKUP_ENCRYPTION_KEY)" ] || { warn "No BACKUP_ENCRYPTION_KEY in .env: backup skipped."; return 1; }
  # pg_dump from .env when set there; otherwise aaPanel's PostgreSQL (dotenv never overrides a set variable).
  local dump; dump="$(get_env "$ENV_FILE" PG_DUMP_PATH)"
  if [ -z "$dump" ]; then local pgbin; pgbin="$(find_pg_bin || true)"; [ -n "$pgbin" ] && dump="$pgbin/pg_dump"; fi
  info "Database backup (encrypted)"
  # The backup folder belongs to the app user, so the backup runs as that user too: root never writes into a folder
  # www controls. The code it runs is root-owned (fix_owner).
  local as=(); as_app_user as
  if (cd "$APP_DIR" && "${as[@]}" env PG_DUMP_PATH="${dump:-pg_dump}" "$NODE_BIN/node" scripts/postgres-backup.cjs); then
    ok "Backup written to $(get_env "$ENV_FILE" BACKUP_DIR || echo "$APP_DIR/backups")"
  else
    warn "The backup FAILED (see above)."
    return 1
  fi
}

current_branch() { git -C "$APP_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo main; }

offer_admin() {
  interactive || return 0
  ask_yn "Create the first administrator now?" "y" || { echo "  Later: bash $0 admin"; return 0; }
  make_admin
}

make_admin() {
  local name email pass pass2 company edition input
  echo "  First administrator (an existing account with the same e-mail is kept as it is)."
  company="$(ask "  Company name" "${SETUP_COMPANY:-Company}")"
  name="$(ask "  Administrator name" "Administrator")"
  email="$(ask "  Administrator e-mail (used to sign in)" "${SETUP_EMAIL:-}")"
  edition="$(ask "  Edition: full (Pakistan compliance) or lite (small shop)" "full")"
  while true; do
    pass="$(ask_secret "  Password (at least 12 characters)")"
    pass2="$(ask_secret "  Password again")"
    [ "${#pass}" -ge 12 ] && [ "$pass" = "$pass2" ] && break
    warn "The passwords differ or are shorter than 12 characters. Try again."
  done
  local url; url="$(get_env "$ENV_FILE" APP_URL)"
  input="$(mktemp)"; chmod 600 "$input"
  C="$company" N="$name" E="$email" P="$pass" ED="$edition" U="$url" node -e '
    const e = process.env;
    process.stdout.write(JSON.stringify({ companyName: e.C, adminName: e.N, adminEmail: e.E, adminPassword: e.P,
      edition: e.ED === "lite" ? "lite" : "full", urls: e.U ? [e.U] : [], publicUrl: e.U || null, clientDataImport: false }));' > "$input"
  if (cd "$APP_DIR" && SETUP_INPUT_FILE="$input" node scripts/setup-installation.cjs); then
    ok "Administrator $email is ready (if the account already existed, its password was NOT changed: use 'bash $0 admin' -> reset)"
  else
    warn "Creating the administrator failed. Try again with: bash $0 admin"
  fi
  rm -f "$input"
}

reset_admin() {
  local email pass pass2
  email="$(ask "  Administrator e-mail (empty = the built-in administrator)" "")"
  while true; do
    pass="$(ask_secret "  New password (at least 12 characters; empty = generate one)")"
    [ -z "$pass" ] && break
    pass2="$(ask_secret "  New password again")"
    [ "${#pass}" -ge 12 ] && [ "$pass" = "$pass2" ] && break
    warn "The passwords differ or are shorter than 12 characters. Try again."
  done
  (cd "$APP_DIR" && RESET_EMAIL="$email" RESET_PASSWORD="$pass" node scripts/reset-admin-password.cjs) \
    && ok "Password set (a generated password is shown above once)" || warn "Resetting the password failed."
}

server_ip() { curl -s -m 5 https://api.ipify.org 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}'; }

next_steps() {
  local port domain ip node
  port="$(get_env "$ENV_FILE" PORT)"; domain="$(get_env "$ENV_FILE" APP_URL)"; domain="${domain#https://}"
  ip="$(server_ip)"; node="$NODE_BIN/node"
  echo
  bold "========================  Next steps in aaPanel  ========================"
  cat <<EOF
1. DNS:       at your domain provider, an A record:  ${domain:-hr.yourcompany.com}  ->  ${ip:-<this server's IP>}
                (do this first: the SSL certificate in step 4 can only be issued once the domain points here)
2. Node project  (Website -> Node project -> Add Node project)
     Project directory : $APP_DIR
     Start command     : node server.cjs          (or "Run script: start")
     Node version      : $(basename "$(dirname "$NODE_BIN")")
     Port              : ${port:-8080}
     Run as user       : $RUN_USER   (reads the code and .env; writes only the data folders)
3. Mapping:   in the Node project, Mapping -> add ${domain:-your domain}.
4. SSL:       in the Node project, SSL -> Let's Encrypt -> apply, then turn on "Force HTTPS".
5. Firewall:  aaPanel -> Security: ports 80 and 443 open; do NOT open port ${port:-8080} (the app listens on 127.0.0.1 only).
6. Cron:      aaPanel -> Cron -> Add task -> Shell script, daily 02:30:
                bash $(readlink -f "$0") backup      (aaPanel Cron runs as root: no sudo here)
7. Open https://${domain:-your-domain}, sign in as the administrator.
8. OneNet vendor console (sign-in screen, login "onenet"): password  $(get_env "$ENV_FILE" VENDOR_CONSOLE_PASSWORD)
                keep it in OneNet's records, not with the client; show it again with: bash $(readlink -f "$0") vendor

Every update from now on:
     sudo bash $(readlink -f "$0") update      then aaPanel -> Node project -> Restart
EOF
  bold "=========================================================================="
}

# An install that was uploaded by hand (no .git) is converted without downtime: the new copy is downloaded and
# built in APP_DIR.new while the live app keeps running from APP_DIR, .env is copied over, and only at the end
# are the folders swapped (the old one is kept as APP_DIR.before-git-<date>). The database is not touched.
LIVE_DIR="$APP_DIR"
ADOPTED_FROM=""
adopt_existing() {
  warn "$LIVE_DIR exists but was not installed from Git (files uploaded by hand)."
  echo "     The script builds a fresh copy from GitHub in ${LIVE_DIR}.new while the live app keeps running,"
  echo "     copies your .env into it, then swaps the folders. The old folder is kept. The database is not touched."
  ask_yn "Convert $LIVE_DIR now?" "y" || die "Stopped. Nothing was changed."
  [ -f "$LIVE_DIR/.env" ] || warn "$LIVE_DIR has no .env: you will be asked for the settings."
  rm -rf "${LIVE_DIR}.new"
  ADOPTED_FROM="$LIVE_DIR"
  APP_DIR="${LIVE_DIR}.new"; ENV_FILE="$APP_DIR/.env"
}

restore_adopted_env() {
  [ -n "$ADOPTED_FROM" ] || return 0
  local f docs
  for f in .env .env.local; do
    if [ -f "$ADOPTED_FROM/$f" ]; then cp -p "$ADOPTED_FROM/$f" "$APP_DIR/$f" && ok "Kept $f from the live install"; fi
  done
  if [ -d "$ADOPTED_FROM/backups" ] && [ ! -e "$APP_DIR/backups" ]; then cp -a "$ADOPTED_FROM/backups" "$APP_DIR/backups" && ok "Kept backups/ from the live install"; fi
  docs="$(get_env "$ENV_FILE" DOCUMENT_STORAGE_PATH)"
  case "$docs" in
    "$ADOPTED_FROM"/*) warn "DOCUMENT_STORAGE_PATH ($docs) is inside the app folder; after the swap it stays in the kept old folder. Move it outside and update .env." ;;
    ""|[!/]*) if [ -d "$ADOPTED_FROM/${docs:-documents}" ]; then warn "Employee documents are in $ADOPTED_FROM/${docs:-documents}. Move them outside the app folder and set DOCUMENT_STORAGE_PATH in .env."; fi ;;
  esac
}

swap_adopted() {
  [ -n "$ADOPTED_FROM" ] || return 0
  local old; old="${LIVE_DIR}.before-git-$(date +%Y%m%d-%H%M%S)"
  info "Swapping folders: $LIVE_DIR -> $old, new copy -> $LIVE_DIR"
  mv "$LIVE_DIR" "$old"
  mv "$APP_DIR" "$LIVE_DIR"
  APP_DIR="$LIVE_DIR"; ENV_FILE="$APP_DIR/.env"
  ok "The live folder is now the GitHub copy; the old files are kept in $old"
  warn "Restart the app NOW: aaPanel -> Website -> Node project -> Restart (it still runs the old code from memory)."
}

# ---------- commands ----------
cmd_setup() {
  need_root setup
  need_git
  local repo="${1:-}"
  [ -n "$repo" ] || repo="$(ask "Repository address" "$REPO_DEFAULT")"
  parse_repo "$repo"
  find_node
  make_key
  show_key
  if interactive; then read -r -p "Press Enter after you have added the deploy key... " _ || true; fi
  test_access

  drop_old_trust "$APP_DIR"
  if [ -d "$APP_DIR/.git" ]; then
    fix_owner   # an older install may still belong to www: root takes the code back before it runs Git in it
    BRANCH="${BRANCH:-$(current_branch)}"
    ok "Code already in $APP_DIR (updating it on branch $BRANCH)"
    git -C "$APP_DIR" remote set-url origin "$REPO_SSH_URL"
    git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
    git -C "$APP_DIR" checkout --quiet "$BRANCH"
    git -C "$APP_DIR" merge --ff-only --quiet "origin/$BRANCH"
  else
    if [ -d "$APP_DIR" ] && [ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ]; then adopt_existing; fi
    info "Downloading the code into $APP_DIR"
    mkdir -p "$(dirname "$APP_DIR")"
    git clone --quiet --no-checkout "$REPO_SSH_URL" "$APP_DIR"
    local newest; newest="$(newest_branch "$APP_DIR")"
    echo "     Branches on GitHub, newest first:"
    git -C "$APP_DIR" for-each-ref --sort=-committerdate --count=6 \
      --format='       %(refname:lstrip=3)  (%(committerdate:short))  %(subject)' refs/remotes/origin | grep -v '^       HEAD ' | cut -c1-110 || true
    BRANCH="${BRANCH:-$(ask "Branch to deploy" "${newest:-main}")}"
    git -C "$APP_DIR" checkout --quiet -B "$BRANCH" "origin/$BRANCH" || die "Branch $BRANCH does not exist on GitHub."
  fi
  ok "Code is at commit $(git -C "$APP_DIR" log -1 --format='%h %s')"

  restore_adopted_env
  prepare_dirs
  install_packages
  build_web
  make_env
  if migrate_db; then offer_admin; fi
  fix_owner
  swap_adopted
  next_steps
}

cmd_update() {
  need_root update
  need_git
  need_installed
  find_node
  drop_old_trust "$APP_DIR"
  # An older install may still belong to www: root takes the code back before it runs Git, npm or node in it.
  fix_owner
  # The live folder is never changed while the new version is prepared: the code is checked out, installed and
  # built in APP_DIR.new, and only when everything succeeded are the folders swapped (a second). The running app
  # keeps serving the old version until you press Restart. APP_DIR.previous keeps the old version for rollback.
  local live="$APP_DIR" stage="${APP_DIR}.new" prev="${APP_DIR}.previous"
  local branch="${BRANCH:-$(current_branch)}" before sha after changed
  before="$(git -C "$live" rev-parse --short HEAD)"

  info "Checking GitHub for new code (branch $branch; the live files are not touched)"
  git -C "$live" fetch --quiet origin "$branch" || die "Cannot download branch $branch. Check the deploy key: sudo bash $0 key"
  sha="$(git -C "$live" rev-parse "origin/$branch")"; after="$(git -C "$live" rev-parse --short "$sha")"
  if [ "$before" = "$after" ] && [ "${FORCE:-0}" != 1 ] && [ -f "$live/dist/index.html" ]; then
    ok "Already up to date ($after). Nothing to do. (FORCE=1 rebuilds anyway.)"
    return 0
  fi
  ok "New version: $before -> $after"
  git -C "$live" log --oneline "$before..$sha" 2>/dev/null | head -15 | sed 's/^/     /' || true

  # Files someone edited by hand on the server would be lost in the new copy: show them first.
  changed="$(git -C "$live" status --porcelain --untracked-files=no | grep -v ' package-lock.json$' || true)"
  if [ -n "$changed" ]; then
    warn "These files were changed by hand on the server and the new version will NOT contain those changes:"
    printf '%s\n' "$changed" | sed 's/^/     /'
    ask_yn "Continue anyway? (the changed files stay in $prev after the update)" "n" || die "Update stopped; nothing was changed."
  fi

  if [ "${SKIP_BACKUP:-0}" != 1 ]; then
    APP_DIR="$live"; ENV_FILE="$live/.env"
    run_backup || { ask_yn "The safety backup failed. Update anyway?" "n" || die "Update stopped; nothing was changed."; }
  fi

  info "Preparing the new version in $stage (the site keeps running)"
  rm -rf "$stage"
  git clone --quiet --no-checkout "$live" "$stage"
  git -C "$stage" fetch --quiet "$live" "$sha"
  git -C "$stage" checkout --quiet -B "$branch" "$sha"
  git -C "$stage" remote set-url origin "$(git -C "$live" remote get-url origin)"
  local f
  for f in .env .env.local; do
    if [ -f "$live/$f" ]; then cp -p "$live/$f" "$stage/$f"; fi
  done

  APP_DIR="$stage"; ENV_FILE="$stage/.env"
  prepare_dirs
  install_packages || die "Installing packages failed. The live site was NOT changed (half-done copy: $stage)."
  build_web
  # Database changes only add tables and columns, so the old version keeps working with them until the restart.
  migrate_db || die "The database update failed (see above). The live site was NOT changed; fix it and run update again."
  fix_owner

  info "Switching to the new version"
  rm -rf "$prev"
  mv "$live" "$prev"
  mv "$stage" "$live"
  # Backups written into the app folder (when BACKUP_DIR is not set) move along with it.
  if [ -d "$prev/backups" ] && [ ! -e "$live/backups" ]; then mv "$prev/backups" "$live/backups"; fi
  APP_DIR="$live"; ENV_FILE="$live/.env"
  fix_owner
  ok "Version $after is in place; the previous version is kept in $prev"
  echo
  if [ -z "$(get_env "$ENV_FILE" VENDOR_CONSOLE_PASSWORD)" ]; then
    warn "The OneNet vendor console is off on this server until it has its own password: run  sudo bash $0 vendor"
  fi
  bold "Now restart the app: aaPanel -> Website -> Node project -> HR & Payroll -> Restart."
  echo "Then check it with:      sudo bash $0 check"
  echo "If something is wrong:   sudo bash $0 rollback   (then Restart again)"
}

cmd_rollback() {
  need_root rollback
  local live="$APP_DIR" prev="${APP_DIR}.previous" tmp="${APP_DIR}.rollback-$$"
  [ -d "$prev/.git" ] || die "There is no previous version in $prev."
  echo "Current : $(git -C "$live" log -1 --format='%h %ci %s' 2>/dev/null)"
  echo "Previous: $(git -C "$prev" log -1 --format='%h %ci %s' 2>/dev/null)"
  warn "Database changes made by the update are NOT undone (they only add, so the previous version works with them)."
  ask_yn "Switch back to the previous version?" "y" || die "Nothing was changed."
  mv "$live" "$tmp"
  mv "$prev" "$live"
  mv "$tmp" "$prev"
  if [ -d "$prev/backups" ] && [ ! -e "$live/backups" ]; then mv "$prev/backups" "$live/backups"; fi
  fix_owner
  ok "Switched back. (Running rollback again returns to the newer version.)"
  bold "Now restart the app: aaPanel -> Website -> Node project -> HR & Payroll -> Restart."
}

cmd_check() {
  need_installed
  find_node
  local problems=0 port url code
  # aaPanel gives a Node project's folder to its run user (www) when it starts or restarts the app, so the code is
  # often www-owned between updates. That is reported, not fatal: root then runs no Git in the folder, and the
  # database check runs as www. "update" takes the code back for root before it runs Git, npm or migrations.
  local rooted=1
  if [ "$(id -u)" -eq 0 ] && ! code_is_root_owned; then
    rooted=0
    warn "The app folder belongs to $RUN_USER again (aaPanel does this when it restarts the app). Fine for running;"
    echo "     \"update\" takes it back for root before changing anything. GitHub comparison skipped."
  fi
  if [ "$rooted" = 1 ]; then
    ok "Code: branch $(current_branch), commit $(git -C "$APP_DIR" log -1 --format='%h %ci %s')"
    if git -C "$APP_DIR" fetch --quiet origin "$(current_branch)" 2>/dev/null; then
      local behind; behind="$(git -C "$APP_DIR" rev-list --count HEAD.."origin/$(current_branch)")"
      [ "$behind" = 0 ] && ok "No newer code on GitHub" || warn "$behind newer commit(s) on GitHub: run  bash $0 update"
    else
      warn "Cannot reach GitHub with the deploy key (bash $0 key)"
    fi
  fi
  [ -f "$ENV_FILE" ] && ok ".env present" || { warn ".env is missing"; problems=$((problems + 1)); }
  [ -f "$APP_DIR/dist/index.html" ] && ok "Web app built ($(stat -c %y "$APP_DIR/dist/index.html" | cut -d. -f1))" || { warn "dist/ is missing: run  bash $0 update"; problems=$((problems + 1)); }
  local as=(); as_app_user as
  if database_ready && (cd "$APP_DIR" && "${as[@]}" timeout 30 "$NODE_BIN/node" -e '
      require("dotenv").config({ path: [".env.local", ".env"], quiet: true });
      const { Pool } = require("pg"); const p = new Pool({ connectionString: process.env.DATABASE_URL });
      p.query("SELECT count(*)::int n FROM schema_migrations").then(r => { console.log("     migrations applied: " + r.rows[0].n); return p.end(); })
       .catch(e => { console.error("     " + e.message); process.exit(1); });'); then
    ok "Database reachable"
  else
    warn "Database not reachable (bash $0 db)"; problems=$((problems + 1))
  fi
  port="$(get_env "$ENV_FILE" PORT)"; port="${port:-8080}"
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "http://127.0.0.1:$port/api/health" || true)"
  [ "$code" = 200 ] && ok "App answers on port $port" || { warn "App does not answer on port $port (HTTP ${code:-none}): start or restart it in aaPanel -> Node project"; problems=$((problems + 1)); }
  url="$(get_env "$ENV_FILE" APP_URL)"
  if [ -n "$url" ]; then
    code="$(curl -s -o /dev/null -w '%{http_code}' -m 15 "$url/api/health" || true)"
    [ "$code" = 200 ] && ok "Public address works: $url" || { warn "$url/api/health answers HTTP ${code:-none} (check Mapping, SSL and DNS)"; problems=$((problems + 1)); }
  fi
  local bdir newest; bdir="$(get_env "$ENV_FILE" BACKUP_DIR)"; bdir="${bdir:-$APP_DIR/backups}"
  newest="$(ls -1t "$bdir"/*.enc 2>/dev/null | head -1 || true)"
  [ -n "$newest" ] && ok "Newest backup: $(basename "$newest") ($(stat -c %y "$newest" | cut -d. -f1))" || warn "No backup yet in $bdir (add the Cron task: bash $0 backup)"
  echo
  [ "$problems" = 0 ] && bold "All checks passed." || bold "$problems problem(s) found (see above)."
  [ "$problems" = 0 ]
}

cmd_db() {
  need_root db
  [ -f "$ENV_FILE" ] || die "$APP_DIR is not installed yet. Run: bash $0 setup"
  find_node
  info "Database settings"
  ask_database
  if migrate_db; then offer_admin; fi
  fix_owner
  echo
  bold "If the app is already added in aaPanel, restart it: Website -> Node project -> Restart."
}

cmd_admin() {
  need_root admin
  [ -f "$ENV_FILE" ] || die "$APP_DIR is not installed yet. Run: bash $0 setup"
  find_node
  database_ready || die "DATABASE_URL is not set yet. Run first: bash $0 db"
  if ask_yn "Create a NEW first administrator? (n = set a new password for an existing administrator)" "n"; then
    make_admin
  else
    reset_admin
  fi
}

cmd_backup() {
  need_installed
  find_node
  # The backup runs as the app user (run_backup), so the folder's owner does not matter here.
  run_backup
}

# The vendor console (edition and licence) needs a per-server password; the old date-based one is no longer accepted.
cmd_vendor() {
  need_root
  [ -f "$ENV_FILE" ] || die "$ENV_FILE not found. Run setup first."
  local pass
  pass="$(get_env "$ENV_FILE" VENDOR_CONSOLE_PASSWORD)"
  if [ -z "$pass" ]; then
    find_node
    pass="$(random_vendor_password)"
    set_env "$ENV_FILE" VENDOR_CONSOLE_PASSWORD "$pass"
    fix_owner
    ok "Created a vendor console password for this server."
    bold "Restart the app so it takes effect: aaPanel -> Website -> Node project -> HR & Payroll -> Restart."
  fi
  echo
  echo "OneNet vendor console: sign-in screen, login \"onenet\", password:  $pass"
  echo "Keep it in OneNet's records; it only opens the edition and licence console."
}

cmd_key() {
  parse_repo "${1:-$REPO_DEFAULT}"
  show_key
}

case "${1:-}" in
  setup)  shift; cmd_setup "$@" ;;
  update) shift; cmd_update "$@" ;;
  check)  shift; cmd_check "$@" ;;
  key)    shift; cmd_key "$@" ;;
  db)     shift; cmd_db "$@" ;;
  admin)  shift; cmd_admin "$@" ;;
  backup) shift; cmd_backup "$@" ;;
  vendor) shift; cmd_vendor "$@" ;;
  rollback) shift; cmd_rollback "$@" ;;
  *)
    awk 'NR>1 && /^set -euo/{exit} NR>1' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
