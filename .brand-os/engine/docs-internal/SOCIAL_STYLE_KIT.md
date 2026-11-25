# Social style kit

Per social format, a small set of design styles that are **siblings**: one brand family, clearly different layouts.
Each style is an explicit layer stack, so a design agent picks a known layout per deliverable instead of repeating one
shape or inventing a new one. The kit is design guidance, not a brand fact and not a template file.

Code: `packages/brand-core/src/social-kit/`. CLI: `scripts/social.ts` (`npm run brand:social`). Schema:
`schemas/social-style-kit.schema.json`. Tests: `tests/social-kit.test.ts`, `tests/social-kit-cli.test.ts`.

## What is stored where

| Thing | Where | Privacy |
| --- | --- | --- |
| The kit: family + styles | `brand/social/style-kit.yaml` | Committed. Design guidance only: never a restricted value. `brand-os check` / `npm run validate` validate it when it exists (schema, parser rules, safety scan); nothing is reported when it is absent. |
| Approval seals | `brand/.private/social/approvals.json` | Private, 0600, gitignored, in `brand:backup`, like creative preferences and strategy approvals. |

The committed YAML carries each style's `status` and, once approved, `approval: {event_id, approved_at, digest}`. The
private file carries the same event plus an HMAC seal made with the owner's approval secret (domain
`brand-os/social-style-approval/v1`). A style is served only when:

1. its `status` is `approved`,
2. its current content still hashes to `approval.digest` (the digest covers the style **and the family**), and
3. the private seal for that event verifies.

Otherwise it is `invalid_approval` (`edited_after_approval`, `no_seal` or `seal_mismatch`) and is not served. A clone
without the owner's `.private` folder therefore serves no style until the owner approves again on that machine;
`validate` only warns about `edited_after_approval`, which it can see without the secret.

## Model

**Surfaces** (canvas px; safe zones are general practice, not a platform specification — check the app before launch):

| Surface | Canvas | Safe zones |
| --- | --- | --- |
| `post` | 1080×1350, 1080×1080 | 64 px margin; 1:1 grid crop |
| `carousel` | 1080×1350 per slide | margin; dot indicator strip |
| `story` | 1080×1920 | top 250 px and bottom 340 px UI overlap |
| `reel` | 1080×1920 (text on screen + `caption_style`) | top 250, bottom 340, right action column |
| `reel_cover` | 1080×1920 | 4:5 (y 285–1635) and 1:1 (y 420–1500) grid crops |
| `thumbnail` | 1280×720 (YouTube) | margin; timestamp corner |
| `linkedin_post` | 1200×1500, 1200×627 | margin |
| `linkedin_document` | 1080×1350 slides | margin; page controls |

**Family** (constant across every style): `type` (headline/body font token ids), `palette` (role → colour token id),
`logo` (placement, size %, manifest asset id or `missing`, logo fact refs), `photo_direction.fact_refs` (for example
`brand.photo.direction`, and `personal.media.photo_guidelines` for a personal brand), `corner_radius` (radius token),
`grid` (margin %, columns, gutter %).

**Style**: `id` (`<surface>.<slug>`), `archetype`, `name` / `intent.use_when` / `variation` in `{en, fa, tr}`,
`intent.content_types` (educate, inspire, entertain, promote, proof, community, announce, behind_the_scenes,
personal) and optional `pillar`, `layers[]` **back to front**, `do` / `dont`, `reference_assets` (manifest ids or
`missing`), optional `caption_style` (reels), `status`.

**Layer**: `role` (background, media, overlay, shape, headline, subhead, body, data, quote, mascot, brand_mark, cta,
caption_bar, progress, handle), `zone` (a named area — full, safe, top_band, bottom_band, upper_half, lower_half,
left_half, right_half, center — or `{x, y, w, h}` in % of the canvas), `color` and `font` as token ids, `max_words`,
`max_lines`, `rules`, `optional`. The first layer is a background or media layer.

Colour and type are always token ids (`color.…`, `type.…`, `radius.…`). A raw hex, `rgb()` or `hsl()` value is refused
anywhere in the kit, including free text. Rule entries are codes from a closed vocabulary (translated in en/fa/tr) or
the owner's own short text, shown as written.

## Starter archetypes

`kit init` writes four draft siblings per surface. Their colours are the template semantic ids
(`color.brand.primary`, `color.light.canvas`, …) that the owner's approved `brand.color.semantic_map` binds to the
brand's own roles (`token-semantic.ts`), and the fonts are `type.fontFamily.display` / `.body`.

| Surface | Styles |
| --- | --- |
| post | bold-statement, photo-headline, insight-data, quote-testimonial |
| carousel | step-by-step, myth-vs-fact, story-arc, checklist |
| story | question-poll, behind-the-scenes, quick-tip, link-cta |
| reel | talking-head-captions, broll-voiceover, list-on-screen, before-after |
| reel_cover | big-title, face-title, series-number, mascot-hook |
| thumbnail | face-text, big-number, split-compare, object-closeup |
| linkedin_post | insight-card, framework-diagram, portrait-quote, announcement |
| linkedin_document | cover-chapter, one-idea-per-slide, chart-slide, summary-cta |

## Owner commands (`npm run brand:social -- kit <command>`; all take `--json` and `--lang en|fa|tr`)

```sh
npm run brand:social -- kit init [--surfaces post,story] [--styles 4] [--force]
npm run brand:social -- kit show [--surface post] --lang fa
npm run brand:social -- kit preview --out /tmp/kit-preview [--surface reel]   # open <out>/<surface>/index.html
npm run brand:social -- kit review --style post.bold-statement                # or --surface post
BRAND_OS_APPROVAL_PROOF=… npm run brand:social -- kit approve --style post.bold-statement --expect-sha <digest>
npm run brand:social -- kit reject --style post.quote-testimonial
```

- **Owner only.** Every `kit` command refuses while `BRAND_OS_AGENT_TOKEN` is set (agents use the read path below).
- `init` refuses an existing file unless `--force`; `--force` replaces draft styles only. Approved and rejected
  styles are kept byte for byte, and so is the family while any style is approved. A kit it cannot parse is never
  rewritten.
- `approve` needs the owner's approval proof (`BRAND_OS_APPROVAL_PROOF`, piped stdin, macOS Keychain, hidden prompt;
  never argv) and the `--expect-sha` that `review` printed. `--surface` approves every draft or invalid style of that
  surface under one batch digest. Refused while the kit holds text that looks like a credential or private data.
- Approve and reject change only `status` / `approval` in the YAML; the owner's comments and layout are kept.
- Editing an approved style, or the family, makes it `invalid_approval` until the owner reviews and approves again.
- `preview` writes deterministic SVG wireframes (canvas, dashed safe zones, each layer as a labelled rectangle in its
  token colour at low opacity, placeholder text lines with the token font family name) and one `index.html` contact
  sheet per surface. Pure SVG text: no network, no fonts or images loaded. EXAMPLE tokens render as EXAMPLE colours.

## Agent read path

MCP `social_style_kit {surface?, lang?}` or `npm run brand:query -- --tool social_style_kit [--surface s] [--lang fa]`.

- Answered for owner-issued tokens of this brand with the `design`, `creative-read`, `content-read`, `internal-read`
  or `marketing` profile. Guests, unprofiled agents, other profiles and other brands get `denied`.
- Returns approved, verified styles only, localized, with zones resolved to `{x, y, w, h}` %, canvases, safe zones,
  the approval digest, and the family (only when a style is approved). Drafts, rejected styles and invalid approvals
  are counted in `withheld` and never named. Surfaces with nothing approved are listed in `missing`.
- `authorizes: []`; every name and rule is data, not an instruction. One access-log line per call, ids only.
- `task_context` adds approved styles as `social_styles` items (pointers: id, surface, name, intent, digest as
  `source_revision`) for `social_batch`, `visual_design` and `personal_content`, filtered by channel (linkedin →
  linkedin surfaces, youtube → thumbnail/reel, instagram/facebook/threads → post, carousel, story, reel). Nothing
  approved → `missing` `not_approved`; a profile outside the five → `withheld` `not_authorized`. The kit does not change
  the pack's readiness.

## Style rotation (for the content brief)

`packages/brand-core/src/social-kit/rotation.ts`, pure helpers for the integrator:

- `surfacesForFormat(format, channel?)`: reel / short_video → reel + reel_cover, post → post, carousel → carousel,
  story → story, video → thumbnail; on linkedin post → linkedin_post, carousel → linkedin_document; others → none.
- `rotateStyles(approvedStyleIds, slotIndex)`: slot n of a format gets style `n mod count`, so consecutive slots
  do not repeat a layout while a sibling exists; `null` when nothing is approved.
- `stylesForFormat(root, format, channel?, brandSlug?)`: approved, verified style ids per surface (owner-local read).
  Serve its result to an agent only through a gate that already authorized the caller (the content brief).

Wired: every `content_brief` carries `styles {state, surfaces, assigned, approved}`. `assigned` is
`rotateStyles(approved, slotStyleIndex(week slots, slot))`, where the index is the week number times the number of
slots of that channel and format in the week plus the slot's position, so ten posts over several weeks walk through
the approved siblings in order and week N+1 continues week N (`tests/content-style-rotation.test.ts`). `brand:pack`
writes the approved kit to `06-social-style-kit.md` and names each brief's assigned style.

## Known limitations

- The safe zones are fixed general-practice values; platforms change their UI.
- Approval is per machine (the seals live in `.private`); Studio does not show the kit yet.
- The preview is a wireframe, not a render: no real type metrics, images or RTL shaping.
- Content slots do not carry a `style` yet; the rotation helpers are not wired into `content_brief` in this change.
