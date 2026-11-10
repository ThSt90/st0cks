#!/bin/bash
# Screenshots der LIVE-App (docs/index.html) in 393x852 (iPhone 15 Pro), braucht: python -m http.server 8765 im Ordner st0cks
# Aufruf: bash tests/shots_live.sh <Praefix>   (Praefix z. B. "vorher" oder "nachher")
E="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
B='http://localhost:8765/prototype/frame_live.html'
D='C:/Users/thoma/OneDrive/aktien-radar/st0cks/tests/shots'
P="${1:-nachher}"
while IFS='|' read -r name q; do
  [ -z "$name" ] && continue
  "$E" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=393,852 --virtual-time-budget=4000 --screenshot="$D/$P-$name.png" "$B?$q" </dev/null 2>&1 | tail -1
done <<'LIST'
markt|tab=markt&theme=dark
markt-warnungen|tab=markt&tile=1&theme=dark
chancen|tab=chancen&theme=dark
chancen-hell|tab=chancen&theme=light
depot|tab=depot&tile=1&theme=dark
detail|tab=chancen&open=avgo-broadcom&theme=dark
verlauf|tab=verlauf&theme=dark
mehr|tab=mehr&theme=dark
LIST
