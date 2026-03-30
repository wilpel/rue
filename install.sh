#!/bin/bash
set -e

# ── Rue Bot Installer ─────────────────────────────────────────
# Installs Rue Bot, sets up the daemon as a system service,
# and makes the `rue` command available globally.

BOLD='\033[1m'
DIM='\033[2m'
AMBER='\033[33m'
GREEN='\033[32m'
RED='\033[31m'
RESET='\033[0m'

log() { echo -e "${AMBER}●${RESET} $1"; }
ok()  { echo -e "${GREEN}✓${RESET} $1"; }
err() { echo -e "${RED}✗${RESET} $1"; exit 1; }

echo ""
echo -e "${BOLD}Rue Bot Installer${RESET}"
echo -e "${DIM}Always-on AI agent daemon powered by Claude Code${RESET}"
echo ""

# ── Check prerequisites ──────────────────────────────────────

log "Checking prerequisites..."

# Node.js
if ! command -v node &>/dev/null; then
  err "Node.js is required (v22+). Install from https://nodejs.org"
fi
NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  err "Node.js v22+ required (found v$(node -v))"
fi
ok "Node.js $(node -v)"

# npm
if ! command -v npm &>/dev/null; then
  err "npm is required"
fi
ok "npm $(npm -v)"

# Claude Code
if ! command -v claude &>/dev/null; then
  echo -e "  ${DIM}Warning: Claude Code CLI not found. Install from https://claude.ai/code${RESET}"
  echo -e "  ${DIM}Rue will install but won't work without it.${RESET}"
else
  ok "Claude Code CLI found"
fi

# ── Detect project directory ─────────────────────────────────

RUE_DIR="$(cd "$(dirname "$0")" && pwd)"
log "Installing from ${RUE_DIR}"

# ── Install dependencies ─────────────────────────────────────

log "Installing dependencies..."
cd "$RUE_DIR"
npm install --production=false 2>&1 | tail -1
ok "Dependencies installed"

# ── Build ────────────────────────────────────────────────────

log "Building..."
npm run build 2>&1 | tail -1
ok "Built successfully"

# ── Install web UI dependencies ──────────────────────────────

if [ -d "$RUE_DIR/web" ]; then
  log "Installing web UI dependencies..."
  cd "$RUE_DIR/web"
  npm install 2>&1 | tail -1
  ok "Web UI ready"
  cd "$RUE_DIR"
fi

# ── Link globally ────────────────────────────────────────────

log "Linking 'rue' command globally..."
npm link 2>&1 | tail -1
ok "'rue' command available globally"

# Verify
if command -v rue &>/dev/null; then
  ok "rue --version: $(rue --version)"
else
  echo -e "  ${DIM}Note: You may need to restart your shell for 'rue' to be available${RESET}"
fi

# ── Create data directory ────────────────────────────────────

RUE_DATA="$HOME/.rue"
mkdir -p "$RUE_DATA"/{memory/daily,memory/semantic,identity,events,messages,schedules,workspace/projects,workspace/events}
ok "Data directory: $RUE_DATA"

# ── Set up auto-start daemon ─────────────────────────────────

log "Setting up auto-start daemon..."

OS="$(uname -s)"
RUE_BIN="$(which rue 2>/dev/null || echo "$RUE_DIR/dist/index.js")"
NODE_BIN="$(which node)"

if [ "$OS" = "Darwin" ]; then
  # macOS: launchd plist
  PLIST_DIR="$HOME/Library/LaunchAgents"
  PLIST_FILE="$PLIST_DIR/com.rue.daemon.plist"
  mkdir -p "$PLIST_DIR"

  cat > "$PLIST_FILE" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.rue.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${RUE_DIR}/dist/index.js</string>
    <string>daemon</string>
    <string>start</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${RUE_DIR}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${RUE_DATA}/logs/daemon.log</string>
  <key>StandardErrorPath</key>
  <string>${RUE_DATA}/logs/daemon.err</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>${HOME}</string>
  </dict>
</dict>
</plist>
PLIST

  mkdir -p "$RUE_DATA/logs"

  # Load the service
  launchctl unload "$PLIST_FILE" 2>/dev/null || true
  launchctl load "$PLIST_FILE" 2>/dev/null || true

  ok "Daemon registered with launchd (auto-starts on login)"
  echo -e "  ${DIM}Plist: ${PLIST_FILE}${RESET}"
  echo -e "  ${DIM}Logs: ${RUE_DATA}/logs/daemon.log${RESET}"

elif [ "$OS" = "Linux" ]; then
  # Linux: systemd user service
  SERVICE_DIR="$HOME/.config/systemd/user"
  SERVICE_FILE="$SERVICE_DIR/rue.service"
  mkdir -p "$SERVICE_DIR"

  cat > "$SERVICE_FILE" <<SERVICE
[Unit]
Description=Rue Bot Daemon
After=network.target

[Service]
Type=simple
ExecStart=${NODE_BIN} ${RUE_DIR}/dist/index.js daemon start
WorkingDirectory=${RUE_DIR}
Restart=on-failure
RestartSec=5
Environment=PATH=/usr/local/bin:/usr/bin:/bin
Environment=HOME=${HOME}

[Install]
WantedBy=default.target
SERVICE

  systemctl --user daemon-reload 2>/dev/null || true
  systemctl --user enable rue.service 2>/dev/null || true
  systemctl --user start rue.service 2>/dev/null || true

  ok "Daemon registered with systemd (auto-starts on login)"
  echo -e "  ${DIM}Service: ${SERVICE_FILE}${RESET}"
  echo -e "  ${DIM}Status: systemctl --user status rue${RESET}"

else
  echo -e "  ${DIM}Auto-start not configured (unsupported OS: ${OS})${RESET}"
  echo -e "  ${DIM}Start manually: rue daemon start${RESET}"
fi

# ── Done ─────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}${BOLD}Rue Bot installed successfully!${RESET}"
echo ""
echo -e "  ${BOLD}Commands:${RESET}"
echo -e "    rue                  Open chat TUI"
echo -e "    rue daemon start     Start daemon manually"
echo -e "    rue daemon stop      Stop daemon"
echo -e "    rue ask \"...\"        Quick question"
echo -e "    rue info             Show status"
echo ""
echo -e "  ${BOLD}Web UI:${RESET}"
echo -e "    cd ${RUE_DIR}/web && npm run dev"
echo -e "    Open http://localhost:3100"
echo ""
echo -e "  ${BOLD}Telegram:${RESET}"
echo -e "    rue telegram setup <bot-token>"
echo -e "    rue telegram pair"
echo ""
