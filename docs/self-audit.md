# Ghostlight audits itself

Run with the read-only `ghost-auditor` custom agent in Kiro CLI (`kiro-cli chat --agent ghost-auditor`),
which computes every UI text/background pair with Ghostlight's own engine (`src/engine/color.js`).

| Pair | FG | BG | Ratio | Verdict |
|------|----|----|-------|---------|
| light on ink | #f4e9c8 | #0d0c0b | 16.13:1 | AAA |
| light on floor | #f4e9c8 | #171512 | 15.04:1 | AAA |
| muted on ink | #b7ad94 | #0d0c0b | 8.76:1 | AAA |
| muted on floor | #b7ad94 | #171512 | 8.17:1 | AAA |
| muted on floor-2 | #b7ad94 | #1f1c18 | 7.61:1 | AAA |
| candle on ink | #ffb547 | #0d0c0b | 11.12:1 | AAA |
| button text on candle | #1a1206 | #ffb547 | 10.54:1 | AAA |
| ectoplasm on floor | #9fe8d0 | #171512 | 12.95:1 | AAA |
| blood on floor | #ff6a5e | #171512 | 6.48:1 | AA |
| tag text on blood | #1a0505 | #ff6a5e | 7.00:1 | AAA |
| tag text on ectoplasm | #062019 | #9fe8d0 | 12.15:1 | AAA |

No ghosts in our own UI. (An earlier draft used `#ff5a4e` for "blood"; it was nudged to `#ff6a5e`
so small red labels stay comfortably above AA on the dark stage.)
