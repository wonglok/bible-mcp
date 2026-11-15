#!/usr/bin/env bash
# Play the soft chime once, then speak a short progress sentence.
#   scripts/announce.sh "Milestone 2 of 4: data exported."
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MSG="${1:-Milestone reached.}"
VOICE="${BIBLE_MCP_VOICE:-en-US-AriaNeural}"

afplay "$ROOT/assets/chime.wav" >/dev/null 2>&1 || true

PY="${BIBLE_MCP_PY:-/Users/loklok/.venvs/bible-mcp/bin/python}"
MEDIA="$(mktemp -t bible-mcp-msg).mp3"
if "$PY" -m edge_tts --voice "$VOICE" --rate=-4% --text "$MSG" --write-media "$MEDIA" >/dev/null 2>&1 \
   && [ -s "$MEDIA" ]; then
  afplay "$MEDIA" >/dev/null 2>&1 || true
else
  say -r 180 "$MSG"            # offline fallback, same sentence
fi
rm -f "$MEDIA"
