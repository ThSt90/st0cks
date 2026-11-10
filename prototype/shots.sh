#!/bin/bash
# Screenshots 393x852 (iPhone 15 Pro, 2x) mit Edge headless
E="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
B='file:///C:/Users/thoma/OneDrive/aktien-radar/st0cks/prototype/frame.html'
D='C:/Users/thoma/OneDrive/aktien-radar/st0cks/prototype/shots'
while IFS='|' read -r name q; do
  [ -z "$name" ] && continue
  "$E" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=393,852 --virtual-time-budget=2500 --screenshot="$D/$name.png" "$B?$q" </dev/null 2>&1 | tail -1
done <<'LIST'
01-markt-ampel|tab=markt&theme=dark
02-markt-warnungen|tab=markt&tile=1&theme=dark
03-markt-geldfluss|tab=markt&tile=2&theme=dark
04-markt-klumpen|tab=markt&tile=3&theme=dark
05-depot|tab=depot&tile=1&theme=dark
06-chancen|tab=chancen&theme=dark
07-detail-urteil|tab=chancen&open=avgo-broadcom&theme=dark
08-detail-zahlen|tab=chancen&open=avgo-broadcom&dt=1&theme=dark
09-chancen-hell|tab=chancen&theme=light
10-zustand-laden|state=loading&tab=markt&theme=dark
11-zustand-leer|state=empty&theme=dark
12-zustand-fehler|state=error&tab=markt&theme=dark
13-verlauf|tab=verlauf&theme=dark
14-mehr|tab=mehr&theme=dark
LIST
