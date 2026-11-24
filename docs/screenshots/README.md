# Screenshots

Review images for Studio views. All data is ILLUSTRATIVE (fictional names, reserved `.example` hosts shown as `-fictional.app`).

| File | What it shows |
| --- | --- |
| `positioning-map-fa-web.png` | Positioning map (Visual V2.3), Persian, 1440 px, light. The horizontal axis is mirrored: low on the right, high on the left; the vertical axis sits on the right. |
| `positioning-map-fa-print.png` | The same map on its A4 print page (print media, about A4 width). |

Regenerate with Chrome installed:

```bash
STUDIO_E2E_REQUIRED=1 STUDIO_E2E_SCREENSHOTS=/tmp/shots npx tsx scripts/test.ts tests/studio-visual-competitors-browser.test.ts
cp /tmp/shots/positioning-fa-1440.png docs/screenshots/positioning-map-fa-web.png
cp /tmp/shots/positioning-print-fa.png docs/screenshots/positioning-map-fa-print.png
```
