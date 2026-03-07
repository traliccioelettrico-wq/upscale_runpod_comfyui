#!/bin/bash
# ============================================================
# update_mcp.sh — Aggiorna MCP SSH per Claude Code
#
# Uso:
#   ./update_mcp.sh <host> <porta>
#
# Esempio:
#   ./update_mcp.sh 69.30.85.123 22084
#
# Trovi host e porta su RunPod Dashboard → Connect → SSH
# ============================================================

SSH_KEY="$HOME/.ssh/id_ed25519"

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Uso: ./update_mcp.sh <host> <porta>"
  echo "Esempio: ./update_mcp.sh 69.30.85.123 22084"
  exit 1
fi

HOST=$1
PORT=$2

echo "Aggiornamento MCP SSH..."
echo "  Host : $HOST"
echo "  Porta: $PORT"
echo "  Key  : $SSH_KEY"

claude mcp remove ssh-mcp 2>/dev/null

claude mcp add --transport stdio ssh-mcp \
  -- npx -y ssh-mcp \
  -- --host=$HOST \
  --port=$PORT \
  --user=root \
  --key=$SSH_KEY \
  --timeout=120000 \
  --maxChars=0

echo ""
echo "✅ MCP aggiornato. Riavvia Claude Code per applicare."
echo ""
echo "Test connessione:"
echo "  ssh root@$HOST -p $PORT -i $SSH_KEY"
