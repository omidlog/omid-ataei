# Assets

Source files and exports are different. Large video, 3D, and print masters should use Git LFS or `assets.bucket_url`, with a checksum in `asset-manifest.yaml`.

The SVG files in this template are EXAMPLE placeholders so links and checksums are real. They are not a logo or a character.

Approved assets must set `present: true` and match `checksum_sha256`. Missing assets stay `present: false`.

## SVG files

Every SVG must pass the publication check, or Studio, the docs build and MCP will not show it and `npm run validate` fails.

- `npm run brand:assets -- check` lists each SVG with the problem, its line and whether it can be fixed automatically.
- `npm run brand:assets -- normalize <asset.id>` fixes exports from Illustrator, Inkscape, Figma and similar tools when the only problems are a `<style>` block or `style=""` with simple colours, comments, metadata or editor data. Shapes are not changed. The original is kept in `brand/assets-src/` (never published) and the manifest records `derived_from`.
- Problems the normalizer refuses (scripts, embedded images, `<use>`, fonts, external links, animation) must be fixed in the source file: expand symbols, outline text, and export again.
- Gradients, clip paths and masks referenced with `url(#id)` inside the same file are fine.

## Approval

`npm run brand:assets -- approve --ids <asset.id>` is the owner's approval of the exact bytes (`approved_sha256`). It needs the owner proof and an agent never runs it. Normalizing an approved file keeps the approval only if the old and new files render to identical pixels; otherwise the asset goes back to draft and the owner approves the new file.
