#!/bin/bash
set -e

# ── Rue Bot Uninstaller ───────────────────────────────────────

BOLD='\033[1m'
DIM='\033[2m'
AMBER='\033[33m'
GREEN='\033[32m'
RED='\033[31m'
RESET='\033[0m'

log() { echo -e "${AMBER}●${RESET} $1"; }
ok()  { echo -e "${GREEN}✓${RESET} $1"; }

echo ""
echo -e "${BOLD}Rue Bot Uninstaller${RESET}"
echo ""

RUE_DIR="$(cd "$(dirname "$0")" && pwd)"
RUE_DATA="$HOME/.rue"
OS="$(uname -s)"

# ── Stop daemon ──────────────────────────────────────────────

log "Stopping daemon..."
lsof -i :18800 -t 2>/dev/null | xargs kill 2>/dev/null || true
ok "Daemon stopped"

# ── Remove auto-start ───────────────────────────────────────

log "Removing auto-start..."

if [ "$OS" = "Darwin" ]; then
  PLIST_FILE="$HOME/Library/LaunchAgents/com.rue.daemon.plist"
  if [ -f "$PLIST_FILE" ]; then
    launchctl unload "$PLIST_FILE" 2>/dev/null || true
    rm -f "$PLIST_FILE"
    ok "Removed launchd plist"
  else
    ok "No launchd plist found"
  fi
elif [ "$OS" = "Linux" ]; then
  SERVICE_FILE="$HOME/.config/systemd/user/rue.service"
  if [ -f "$SERVICE_FILE" ]; then
    systemctl --user stop rue.service 2>/dev/null || true
    systemctl --user disable rue.service 2>/dev/null || true
    rm -f "$SERVICE_FILE"
    systemctl --user daemon-reload 2>/dev/null || true
    ok "Removed systemd service"
  else
    ok "No systemd service found"
  fi
fi

# ── Unlink global command ────────────────────────────────────

log "Removing 'rue' global command..."
cd "$RUE_DIR"
npm unlink 2>/dev/null || true
ok "Global command removed"

# ── Ask about data ───────────────────────────────────────────

echo ""
echo -e "${AMBER}Keep user data?${RESET}"
echo -e "  ${DIM}Data directory: ${RUE_DATA}${RESET}"
echo -e "  ${DIM}Contains: messages, memory, projects, secrets, identity${RESET}"
echo ""
read -p "Delete all Rue data? (y/N) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  log "Removing data directory..."
  rm -rf "$RUE_DATA"
  ok "Data deleted: $RUE_DATA"
else
  ok "Data kept at: $RUE_DATA"
fi

# ── Done ─────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}${BOLD}Rue Bot uninstalled.${RESET}"
echo ""
echo -e "  ${DIM}To also remove the source code: rm -rf ${RUE_DIR}${RESET}"
echo ""
