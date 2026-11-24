# Changelog


## Unreleased — brand:migrate adds questions a newer template introduced

### Fixed

- `brand:migrate` now adds every question the template defines but a brand's question bank lacks (for example `brand.color.semantic_map`), and adds it to the starter profiles that ask it (`personal-brand`, `founder-core`). Before, an existing brand failed `validate` with "Question bank is missing starter question" after a template update. It also adds the field-registry rows and knowledge-graph edges the template defines and the brand's copies lack, so the brand's own `visual-plan` graph test passes after an update. Append-only and idempotent; no answer, fact or approval changes.

## Unreleased — Studio: open pull requests, automatic refresh, approved names, mixed fa/en text (BOS-02, BOS-11, BOS-20, BOS-21)

### Added

- BOS-02: the brand overview shows "N changes are waiting in open pull requests" with a link to each pull request and what it would change: facts (answer-ledger records), evidence (register and index entries), assets (manifest rows) and other files. Every other brand page shows the same as one compact line. Everything is labelled "Unmerged, not canonical"; no branch value, file name or diff line is shown or cached. The background sync reads each pull request's file list (`GET /repos/{owner}/{repo}/pulls/{n}/files`, new `GitHubClient.listPullFiles`), caches the counts in `state.json` with the history, re-reads a pull request only when its `updated_at` changed, and stops reading file lists for the rest of a sync after a GitHub error or rate limit (those counts show as "could not be read yet"). The History page shows the same counts.
- BOS-11: a background poll of each brand's default-branch head (`HeadPollJob`, one `GET git/ref/heads/<branch>` per ready brand per interval, read credential). When the head moved, the brand is marked dirty and the same read-only refresh as **Refresh** runs, so a merge appears within the interval without a webhook. New setting `STUDIO_HEAD_POLL_SECONDS` (default `180`; `0` off; otherwise 60 to 3600). Started only by `main.ts`, never by tests or CLI commands; a rate limit waits at least 15 minutes, errors back off up to an hour. `check-config` prints the interval.
- BOS-11: while no webhook secret is configured, the Account page shows one-step webhook setup: payload URL (`<public origin>/webhooks/github`), content type `application/json`, "Just the push event", and that the secret goes in GitHub and in `STUDIO_GITHUB_WEBHOOK_SECRET` (never printed). It also shows the poll interval.

### Fixed

- BOS-20: Studio shows the synced, approved `brand.name` (`name_status: approved`) on every surface: sidebar switcher, brand list, breadcrumbs, page titles, the overview hero, page headers and the GitHub & Claude Code header. The name recorded at registration is used only before that (first sync, or a name that is not approved yet). The registry file is not rewritten.
- BOS-21: owner-written text that mixes Persian and Latin script no longer renders out of order. Any value placed in a `dir="auto"` element goes through one central rule in `views/html.ts`: the element gets the direction of most of its words (not of its first letter), marked `data-bidi="mixed"`, and runs of the other script (file names, URLs, product names) are wrapped in `<bdi class="bidi-run">`. `.bidi-run` and `[data-bidi]` use `unicode-bidi: isolate` (in `studio.css` and, for the print views, `visual.css`). Values in one script only are unchanged.

### Tests

- `studio-pending-sync`: record counting, paginated GET-only file lists, caching and rate limits in the sync, the overview card and compact line in en/fa/tr with no branch content, the head poll (one GET per brand, moved head refreshes, rate-limit back-off, configuration), `/healthz` while GitHub fails, the webhook guide, approved names on every surface, and mixed fa/en markup (`dir`, `<bdi>`) in the helpers and on a real page.
- `studio-browser`: a mixed fa/en value with parentheses, a file name and a URL reads in logical order in the en and fa UI (skips without Chrome).
## Unreleased — Approval CLI: one command for everything pending, Keychain proof, change flow, agent provenance (BOS-01, BOS-04, BOS-06, BOS-07)

### Added

- `npm run brand:approve -- --all-pending [--exclude id,…] [--dry-run] [--json]` (BOS-01): lists pending fact drafts, change proposals, evidence awaiting verification and draft assets, grouped by kind, and approves them with one proof. Each item is reported `approved`, `skipped`, `refused` or `stale`. Facts and changes go through `ApprovalService.approveBatch`, evidence through `reviewEvidence`, assets through `approveAssets`; no rule is duplicated. Tentative drafts and template example or placeholder assets are skipped (approve those by id). It refuses to run while `BRAND_OS_AGENT_TOKEN` is set, `--proof` on argv is refused, and a wrong proof writes nothing. With nothing approvable it reads no proof.
- Opt-in macOS Keychain storage of the approval proof: `npm run brand:doctor -- --store-proof-keychain` stores `brand/.private/approval-secret` (service `brand-os-approval`, account = brand slug; the value goes to `security -i` on stdin, never argv, and is never printed); `--forget-proof-keychain` removes it. Both are refused under an agent token.
- One proof resolver for every command that takes the proof (`brand:approve`, `publish`, `evidence verify|reject`, `retract`, `assets approve`, `tokens:approve|publish`, `agent-token`, `brand:strategy`, `brand:content`, `brand:creative`, restricted `brand:knowledge`): `BRAND_OS_APPROVAL_PROOF` → piped stdin → macOS Keychain (only when the entry exists; never while `BRAND_OS_AGENT_TOKEN` is set; `BRAND_OS_KEYCHAIN=off` disables it) → hidden prompt. `brand:knowledge` skips the stdin step because stdin carries note text there. Core: `packages/brand-core/src/approval-proof.ts` (injectable Keychain runner); CLI: `scripts/proof.ts`.
- `npm run brand:interview -- --question ID --change "…" [--reason "…"] [--json]` (BOS-04): the non-interactive `change ID: value`. It files a `chg-…` proposal against the current approved version through the same `changeAnswer` path and prints the diff (approved vs proposed) and the impacted documents and questions. The reason is stored on the proposal and shown in `brand:review`. Stale handling is unchanged; restricted questions are refused on argv.
- `brand:interview --answer … --origin agent_suggestion` (alias `--suggested-by agent`) (BOS-06): records `source_type: agent_suggestion`, `authority: confirmed_by_owner` and `suggested_by: agent`, kept through approval. `brand:review` (text and JSON `draft.provenance`), generated drafts, the document model (`DocumentItem.provenance`, internal editions only) and Studio (badge "Agent-suggested, owner-confirmed", en/fa/tr) show it apart from owner-originated answers. `agent-skills/brand-interviewer/SKILL.md` requires agents to pass the flag when the value came from them.
- Tests: `approve-all-pending` (mixed batch of fact, change, stale change, evidence and assets; agent token, argv proof and wrong proof refused with nothing written; Keychain fake and resolver order; `--change`; `--origin`; dry-run wording; no `<placeholder>` beside a `<` redirect in docs and help).

### Changed

- `brand:approve --dry-run` (also with `--module` / `--ids`) no longer prints the review queue (BOS-07). It starts with `DRY RUN: N items would be approved. Nothing was changed.`, marks each item `would approve` or `would skip` with the reason, and ends with the same notice. `--json` returns `{ mode: "dry_run", dry_run: true, nothing_changed: true, notice, would_approve, would_skip, items[] }` instead of the queue. The real-approval JSON for `--module` / `--ids` is unchanged.
- CLI help and README never show a `<placeholder>` in a command that also uses the `<` redirect; README explains that `<` is a shell redirect and shows a complete example.
## Unreleased — Evidence labels: owner-published sources, mixed claims, idempotent verify (BOS-18, BOS-10)

### Fixed

- A source the owner controls no longer shows as independent verification. Before, every `link`, `document`, `public_record` or `third_party` entry counted as independent, so a claim backed only by the owner's own website or company site was labelled **Verified**. Such a claim is now **Owner-published / not independently verified** (`owner_published`) in brand-core labels, documents and their Markdown, `brand:evidence check`, `brand_retrieve` / `draft_personal_content`, the coach, Studio personal pages (en/fa/tr) and the assurance link check (`not_independent`; linking such an entry is refused).
- A field backed by an independent source and by the owner's word (testimony or an owner-published source) is **Partly verified** (`partly_verified`), never **Verified**. Internal documents and the evidence register name the owner-stated part by evidence id and quote. Studio shows it with a warning tone.
- `brand:evidence verify` on evidence that is already verified (and `reject` on rejected evidence) prints "already verified" / "already rejected", writes nothing and exits 0, so re-running leaves `git status` clean. `reviewEvidence` keeps its signature and adds `unchanged: true` to its result.

### Added

- `owned` on evidence-register entries (optional; absent in older registers). `brand:evidence add --owned` sets it. It is also inferred, on add and on every read, from the brand's own domains in approved facts: `personal.contact.public_channels` (work-email domains too), `personal.content.channels`, `personal.consulting.cta`, `personal.founder.ventures`, and `personal.experience.relationships` entries the person founded, co-founded, owns or co-owns that name a domain. Shared platforms match only the owner's own profile path; public mail providers never count. Inference only marks sources as owned, never the reverse, and a read never rewrites the register.
- `brand:evidence verify|reject --id a,b,c` (or `--ids`): several ids with one proof, each reported; exits 1 if any id fails.
- Core: `claimEvidence`, `verificationNote`, `isIndependentSource`, `withOwnership`, `CLAIM_VERIFICATIONS`, and `evidence-ownership.ts` (`ownedLocations`, `ownedMatch`).
- Tests: `personal-evidence-ownership`.

### Upgrading a brand

- No migration is required: entries without `owned` are inferred from the brand's approved domains when read. Labels can only become more conservative: a claim whose only verified source is the owner's own site turns from Verified to Owner-published, and a claim that requires `verified_evidence` with no other independent source is hidden from public readers at read time (run `brand:evidence check` to see which). For an owner-controlled source the domains cannot reveal (a company brochure or deck), record a new entry with `--owned` and withdraw the old one. A mixed field with redundant owner testimony shows Partly verified; withdraw the testimony if the independent source covers the whole claim.
## Unreleased — Owner feedback: privacy guard, coach follow-up, localized help, validate noise (BOS-05, BOS-08, BOS-09, BOS-13)

### Fixed

- BOS-05: the personal privacy guard no longer reads a social profile URL with `/@handle` (TikTok, Medium, YouTube, Threads, Mastodon) or a bare `@handle` as an email address. In `personal.privacy.*` questions a category name without a value ("date of birth", «تاریخ تولد», "doğum tarihi") is allowed; a name followed by a value, and every phrase that states a value, is still refused. A refusal now says which kind of pattern triggered it and where (line and word), never the value. New export `PRIVATE_CATEGORY_NAMES`; the category names moved out of `PRIVATE_CUES`.
- BOS-08: the coach chooses its clarifying question per question family (`clarifyQuestion`, `questionFamily`), so `personal.positioning.boundaries` gets a boundaries question instead of an audience one; the general `specificity` and `evidence_support` wordings no longer assume an audience or a company. A claim with verified, current, independent evidence gets no `evidence_support` note from the facet rubrics either. `COACH_RULE_VERSION` is `coach-rules/6`.
- BOS-09: every question carries Persian and Turkish `why_it_matters_i18n` and `examples_i18n` (optional sibling fields; English stays in `why_it_matters` and `examples`; "EXAMPLE ONLY:" kept in every language). `brand:interview`, `brand:next --json` (`help_locale`) and `show examples` use the session locale with English fallback. Reworded in en, fa and tr: `personal.media.visual_templates` ("Which templates should be built first?"), `personal.goals.kpis` ("For each goal, which number do you watch, and what is it today (with source and date)?") and `brand.verbal.voice_pairs` ("In your own words, …"). `brand:validate` checks drift in the prompt, `why_it_matters` and `examples` for en, fa and tr; a bank without the new fields stays valid with one warning, and `npm run brand:migrate` refreshes question text only (`refreshQuestionText`).
- BOS-13: `npm run validate` no longer warns "Token CSS has not been written". The docs build prints an informational note instead (`tokenCssBuildNote`); a stale built file is still an error.
- Tests: `personal-privacy-guard`, `coach-question-family`, `question-help-i18n`.
## Unreleased — BOS-15: one definition of "applies" for the CLI and Studio

### Fixed

- `brand:next` could report a personal brand's interview as complete while Studio showed the canvas, business plan, marketing plan and Strategy lab as mostly missing: the interview profile excluded `business.*` questions and the Studio frameworks included them. One rule now decides, `brandApplicability` (`packages/brand-core/src/applicability.ts`, predicate `questionApplies` in `conditions.ts`), used by `brand:next`, `brand:status` / completeness, the Brand Book, business and marketing plan documents, the canvas, SWOT / TOWS, Value Proposition Canvas, journey, SOSTAC, OKR, the full books, the publishing gallery and every Studio counter. If Studio shows an item as missing, `brand:next` asks it and `open` counts it.
- Coverage maths: a module, group, section or chapter with no applicable question shows "Not applicable to this profile" instead of "100 %" (Business OS module list, Command Center groups and framework map, Brand Book chapters). `completeness()` and the dashboard carry an `applicable` count per module.

### Changed

- Owner decision: for a `personal-brand` profile with a business facet, the frameworks describe the person's own practice. A framework question the profile does not ask shows the approved personal answer that describes the same thing (for example `business.customer.primary_segment` ← `personal.positioning.primary_audience`), under the personal id, with its own approval, verification and visibility and a `stands_for` reference; without a mapping it is not applicable, never missing. Ventures stay relationships. The table is `PERSONAL_FRAMEWORK_SOURCES`; the decision is in `docs-internal/PERSONAL_BRAND.md`.
- The `personal-brand` profile asks `brand.strategy.purpose`, `brand.strategy.vision`, `brand.strategy.values` and `brand.strategy.promise`. The profile file is brand-owned, so `npm run brand:migrate` adds them to an older `personal-brand.yaml` (additive, idempotent; `addPersonalStrategyQuestions`), and `brand:next` then reports them as open.
- `brand:next --json` has a `frameworks` object (`applies`, `practice`, `note`); for a personal profile it and `brand:status` point to `brand.profile: universal` with personal on, or a separate repository, for a full venture plan.
- Document sections can be `not_applicable` and list the questions the profile does not ask (`not_applicable`); visual entries carry `stands_for` and `na_reason: 'profile'`; book chapters have the unavailable reason `not_applicable`. New strings in en/fa/tr (Studio and visual catalogs). Studio rebuilds a cached projection without the module `applicable` counts once at the same commit.
- Tests: `studio-applicability` (personal without business facets, personal with business facets, universal with personal on; synthetic data).
## Unreleased — Logo system, asset add and example prune (BOS-03, BOS-12, BOS-16)

### Added

- `npm run brand:assets -- add <file> --id <asset.id> --name "…" [--kind …] [--tags a,b] [--visibility public|internal] [--license "…"] [--normalize | --render png [--size 1024]] [--dry-run] [--json]` (BOS-03). Copies the file into `brand/assets/<kind>/`, appends a `status: draft` record with `checksum_sha256`, `mime`, `preview` and tags, and runs `check` at once. An SVG that would fail the publication check is not written; the output names each problem (for example `<use>` around a raster, `url(#id)` to a missing id, `mix-blend-mode` in a style attribute) and the fix. `--normalize` fixes what the normalizer can at ingest; `--render png` rasterizes with resvg-js (already a dependency), keeps the SVG in `brand/assets-src/` and records `derived_from`. Agents may run it; `approve` stays owner-only.
- `npm run brand:assets -- prune-examples [--dry-run] [--json]` (BOS-12): removes template placeholders (row and file) only when an approved real asset of the same kind exists, or when their module (mascot) is off. A referenced, shared or modified file is kept with the reason.
- Logo system in the identity chapter and the Brand Book (BOS-16): `logo_construction.system` draws the file for light backgrounds on a light plate, the one for dark backgrounds on a dark plate, and the icon at favicon and avatar sizes. Roles come from tags (`on-light`, `on-dark`, `icon`/`mark`/`logomark`/`favicon`), else the documented file-name convention (`dark`/`black`, `light`/`white`/`reversed`…), which the internal edition labels.
- `brand.logo.masters` check (BOS-16): when the answer is recorded, before it is approved and in `validate`, a warning lists the matching asset ids when it names no exact id or manifest path (bare file names are matched).
- Tests: `logo-system`, `asset-manage`.

### Changed

- Master resolution (`pickMaster`): a bare file name that belongs to exactly one asset counts as a reference, and exactly two approved logos that form a light/dark pair resolve as one system (on-light file is the master) instead of `ambiguous`. `IDENTITY_MASTER_RULE` is 3, so Studio caches rebuild.
- `ambiguous` and `not_previewable` show the reason, the approved candidate ids (owner only) and a one-line fix in en/fa/tr.
- The Brand Book's logo chapter is never *Complete* while no master logo is drawn (capped at *Partial*, also in the Command Center mini-map).
- The `brand.logo.masters` prompt (en/fa/tr) asks for the asset id or full manifest path. A brand repository whose question bank still has the earlier prompt gets a validate warning instead of a drift error.
- Studio assets page: real assets first (published, approved, drafts), examples last; EXAMPLE rows hidden once an approved real asset of their kind exists; mascot placeholders, empty slots and the mascot filter hidden while the module is off (real mascot files stay), with a count of what was hidden; approved but unpublished assets carry *Not published · internal preview*.
## Unreleased — BOS-17 approved colours become draft tokens; BOS-19 composed personal drafts and personal documents in the gallery

### Added

- New interview question `brand.color.semantic_map` (color-system module, optional, internal; en/fa/tr; in the founder-core and personal-brand profiles): which owner colour role plays each template slot (`primary = <role>; onPrimary = <role>; canvas = <role>; …`, `none` keeps the template example). Core `token-semantic.ts` parses it against the approved roles and reports unknown slots, unknown roles and repeats.
- `brand:tokens:generate` suggests a semantic mapping when the slots are unmapped (role names, listed order, luminance and measured contrast; a colour meaning such as danger is only suggested for a role with that name). The suggestion is printed with a ready `brand:interview --question brand.color.semantic_map --answer "…"` command and is never applied (`report.semantic` in `--json`).
- `brand:approve` prints “Run `npm run brand:tokens:generate` to turn these into draft tokens.” after a batch that approved `brand.color.roles`, `brand.color.semantic_map`, `brand.type.scale` or `brand.logo.min_size` (text mode; the JSON contract is unchanged).
- Studio Design System: with approved colour roles and no generated role tokens, a notice says the approved colours are not tokens yet and gives `npm run brand:tokens:generate`; with role tokens but unmapped slots, a notice names `brand.color.semantic_map`. Template example colours then sit in a collapsed “Template examples (not your brand)” section, never next to the approved colours (en/fa/tr).
- Personal pack documents (core `documents/compose.ts`): each section carries one composed draft paragraph per language edition, labelled “Draft for owner approval”, built by fixed templates from the facts approved in that language only (language read from the script; approved per-language forms from `personal.identity.localized_headline` / `name_forms`). Facts without an approved translation are listed as untranslated and left out; nothing is machine-translated, and the only added words are per-locale neutral connectors. `brand:document` prints the drafts above a “Sources” heading; `draft_personal_content` returns them per section in `composed`.
- Studio Personal Brand page: each section leads with the composed draft of one edition, chosen by `?locale=fa|en|tr` (read-only; default language first), the untranslated facts named, and the fact cards below as “Sources” (en/fa/tr).
- Publishing gallery: for a brand with `modules.personal.enabled`, the personal documents that apply (nine without the speaker-author facet) are listed with the same audience × readiness model (public and internal for the outward packs; content strategy and evidence register internal only; no investor edition), with `npm run brand:document -- --type <kind> --audience …` shown as text. They count in the Command Center’s “Exports ready” through the existing gallery cells (no coverage code changed).
- Tests: `token-semantic`, `personal-drafts`, `studio-personal-drafts`.

### Changed

- Every approved colour role now becomes `color.brand-role.<role>` (lower case), whatever its name. Template ids (`color.brand.primary`, `color.light.canvas`, `color.semantic.danger` …) are generated only from an approved `brand.color.semantic_map`; a role named `primary` no longer becomes `color.brand.primary` by itself. An already approved token is kept and reported, as before; an unapproved generated `color.brand.<role>` from an earlier run is reported as removed.
- Professional Bio and the other personal sections count words in the composed draft of the first edition (`length.basis: composed_draft`), not in the concatenated facts.
- Tests updated: `brand-tokens`, `journeys`, `task-context` (role tokens and the semantic map), `personal-documents` (composed word count).

## Unreleased — CI: private brands skip the public docs prepare

### Fixed

- `npm run prepare:docs` with no `--audience` (and no `DOCS_AUDIENCE` of `public` or `internal`) no longer requests a public build. It picks from `brand.publish_docs`: a private brand prepares the internal audience and prints a notice. Before, the CLI defaulted to public, so the `validate` workflow failed on every brand Studio creates (private by default). An explicit `--audience public` or `DOCS_AUDIENCE=public` on a private brand is still refused; `deploy-docs.yml` is unchanged.
- Tests: `ci-workflow` spawns the real CLI against a private starter workspace.

## Unreleased — Audit: Visual V3 area (V3.1 lists, V3.2 SWOT/TOWS and VPC, V3.3 journey, SOSTAC, OKR)

### Fixed

- Key-result units (V3.3) and cost items (V3.1) now refuse the spoken Persian «تومن», the Turkish `dolar`, `avro` and suffixed `lira` (`lirası`), and the ₹ ₽ ₩ ₪ symbols. Before, `هزار تومن` or `Türk lirası` passed as a key-result unit, so a money target could enter a list that is not restricted. Non-currency units (`learners`, `نفر`, `öğrenci`) still pass.
- `brand/interview/knowledge-graph.yaml` regenerated from the question bank: it gains the V3.3 journey-stage and OKR edges it was missing (additions only). `materialize` writes only missing files, so a new test now fails when the committed graph drifts from the bank.

## Unreleased — Visual V5.1: standards verification, module audit, cross-brand pilot, release gate

### Added

- `npm run visual:audit` (`scripts/visual-audit.ts`, core `visual/audit.ts`): per-module visual audit on the 0–5 rubric (defined in `docs-internal/VISUAL.md`), computed from checks on the checkout. Output: table, `--md` or `--json`, en/fa/tr (`--lang`). V3.x modules not yet built show as pending.
- `npm run visual:gate [-- --release]`: release gate. Fails when a public module scores below 4, the registry or policy is invalid, or (release mode) a cited external standard has no `verified_on` and reviewer. Owner-only, expiring overrides go in `visual/release-gate.json`. Runs in the template's `validate` CI job with `--pilot`.
- Cross-brand pilot (`visual/pilot.ts`, `visual/fixtures-pilot.ts`): two synthetic brands built through the normal engine path prove the visual modules are brand-agnostic.
- Tests: `visual-audit`.

### Changed

- Framework registry: required `reviewer` field (`"pending"` until a person checks the source). A `verified_on` without a named reviewer, a reviewer without a date, or a future date is refused. The V5.1 pass verified nothing that had not been checked: every entry stays pending.
- After merging main (V3.2, V3.3): the audit scores `swot_tows`, `value_proposition`, `customer_journey`, `sostac_overview` and `okr_tree` (all internal, 4/5) instead of listing them as pending; the `strategy` and `plan` catalogs are checked; an internal module that Studio still renders in a public edition has that edition inspected for drafts and badges. The V3.2/V3.3 registry entries (`SWOT`, `TOWS`, `VPC`, `CUSTOMER-JOURNEY-MAP`, `SOSTAC`, `OKR`) gain `reviewer: "pending"` and are listed as release blockers until checked. Tests: `visual-audit` (V3.2/V3.3 scoring, a leaky public edition fails, pending mechanism).

## Unreleased — Visual V3.3: Customer journey swimlane, SOSTAC overview, OKR tree

### Added

- Three optional list questions on the V3.1 `repeating_entity` model (`packages/brand-core/src/entities-plan.ts`): `business.marketing.journey_stages` (stage name, customer goal, touchpoints, actions, emotion on a five-point scale, pain points, opportunities, evidence; links to customer segments), `business.goals.objectives` (name, why, period) and `business.goals.key_results` (target, unit and source required; current, baseline and measured-on optional; one objective link). Question bank, field registry and module records regenerated (additions only).
- `entities.ts`: `number` and `date` field kinds (Persian digits accepted, stored canonical), a per-field refusal rule and `max_links`. Key-result units refuse currencies in any script: money stays in the restricted finance answers.
- Visual documents `customer_journey`, `sostac_overview`, `okr_tree` (`visual/plan.ts`, blocks in `visual/model-plan.ts`), built through `itemFor` like the canvas: labelled drafts, named gaps, public edition approved and published only. Progress is drawn only from a recorded baseline; key results whose objective is not visible are listed apart, never re-parented. Framework registry: `CUSTOMER-JOURNEY-MAP`, `SOSTAC` (registered trade mark of PR Smith), `OKR`, all `informed_by`.
- Studio (GET only): `/market/customer-journey`, `/strategy/sostac`, `/strategy/okrs`, each with an A3 landscape print view (`/print[?edition=public]`). The swimlane (a real table with an emotion curve) and the OKR tree follow the page direction, so Persian mirrors them; SOSTAC keeps its canonical stage order in the reading direction. Ids only in the details disclosure and the internal print appendix; Persian folios, versions and counters in Persian digits. Designed empty states. en/fa/tr text (`visual/i18n-plan.ts`), nav entries, ILLUSTRATIVE fixtures in `npm run visual:golden`.
- Tests: `visual-plan` (validator, documents, public edition, legacy text, fixtures, catalogs), `studio-visual-plan` (pages, print, public edition, no ids in the main view, fa/tr, empty states, cache rebuild).

## Unreleased — Visual V3.2: SWOT / TOWS and Value Proposition Canvas

### Added

- Eleven optional, internal list questions (`repeating_entity`, module `business-company`): `business.swot.strengths`, `weaknesses`, `opportunities`, `threats`, `tows`, and `business.fit.jobs`, `pains`, `gains`, `products`, `relievers`, `creators`. Standard choices: SWOT confidence (evidenced, owner's view, hypothesis), TOWS type (SO, ST, WO, WT), job type (functional, social, emotional), pain severity, gain relevance (required, expected, desired, unexpected), product kind. en/fa/tr labels.
- Item sources: SWOT, TOWS and canvas items may cite an approved answer id, a knowledge note (`kn_…`), an evidence record (`ev-0001`) or an https page without user name or password (`| sources: …` in a line, or `--sources` with `brand:interview --entity`). Checked for form; readers resolve them and never guess.
- A TOWS strategy's type narrows its links (an SO strategy links only to strengths and opportunities); relievers link to pains, creators to gains, jobs/pains/gains/products to customer segments.
- `swot_tows` and `value_proposition` visual documents (`visual/strategy-lists.ts`): SWOT 2×2, TOWS cells by recorded type (untyped strategies stay unplaced), the six canvas zones, fit read only from recorded links (counts, no score), numbered source notes. Public edition: approved, published lists only, and only approved-answer and web sources (others counted). Web sources keep origin and path only.
- Studio (GET only): `/brands/<slug>/strategy/swot-tows` and `/strategy/value-proposition` under Strategy Lab, with A4 print views (`/print`, `?edition=public`). Standard topology kept in Persian (LTR grids, RTL text), Persian digits for source marks, counts and print folios, ids only in details and the appendix, designed empty states. Projection `visual.strategy` (under `assertNoSecrets`); older caches rebuild once.
- Framework registry entries `SWOT`, `TOWS`, `VPC` (`informed_by`). Fixtures `illustrativeSwotTows`, `illustrativeValueProposition` (ILLUSTRATIVE / MOCK DATA) in `npm run visual:golden`.
- Tests: `visual-strategy` (bank, sources, link rules, operations, builders, fixtures, i18n), `studio-visual-strategy` (pages, print, public edition, canaries, read-only routes, fa/tr).

### Changed

- Each generated question owns its `source_types` list, so `brand/interview/question-bank/business.yaml` has no YAML aliases. With V3.2 the file would have crossed the YAML parser's default limit of 100 aliases and stopped loading. Values are unchanged; `knowledge-graph.yaml` also gains the V3.1 and V3.2 edges it was missing.

## Unreleased — Audit: Visual V3, plan views are never public

### Changed

- Studio no longer offers or serves a public print of the customer journey, SOSTAC overview or OKR tree (`?edition=public` answers 404, and the page has no public print link). V3.3 maps these to the marketing plan and the business plan, which the V4.1 public profile never receives. Before, Studio served their public edition without the profile gate, the same gap the V4 audit closed for the public Business Report. `visualProfilePermits(profile, kind)` is exported from `@brand-os/brand-core/visual`. Owner question in the audit report.

## Unreleased — Audit: Visual V4 area (V4.1 Command Center and Publishing gallery, V4.2 full books)

### Fixed

- Publishing gallery: an investor cell never links to a print view (there is no investor edition yet; the internal one shows labelled drafts).
- Command Center strip in Persian: the coverage heading no longer letter-spaces Persian text, and the half-filled "partial" square mirrors in RTL.
- Docs: the draft-mark comment in `visual/publishing.ts` matches the code (public draws a published asset without its mark; investor does not draw a draft-tagged asset); `docs-internal/STUDIO.md` screens table lists the Command Center and the Publishing gallery.
- Tests: investor cells carry no print link; the Persian gallery has no English leftovers.
- Separate PR (redaction logic): the public Brand Book passes the same public-profile redactor as every other public print, and the Business Report has no public edition.

## Unreleased — Visual V3.1: repeating_entity question type and structured BMC (D3)

### Added

- Question type `repeating_entity`: a list of items with their own fields, stable ids (`seg-1`, `act-2` …, never reused) and links to items of other list questions. Stored as one canonical string (`brand-os.entity-list/1`), validated on every path (interview, change proposals, approval). `packages/brand-core/src/entities.ts`.
- Four optional `business-company` questions: `business.model.segments`, `business.model.key_activities`, `business.model.key_resources`, `business.model.cost_items` (no money amounts). Question bank and field registry regenerated (additions only).
- `brand:interview -- --question <id> --entity add|edit|move|remove|list`: one item per call; drafts, or a change proposal on an approved list. Nothing is approved.
- `brand:migrate` converts legacy free text in a list question into a reviewable draft (or a change proposal for an approved fact) and flags text it cannot read as a list; nothing is dropped or silently rewritten.
- Business Model Canvas: list items in their zones, recorded links by name (unresolved targets named as not shown), a links panel, a designed empty state for a list zone with no items. The business plan gains a "Business Model Canvas lists" section; Studio renders lists read-only. `brand_retrieve` returns list items in `meta.entity`. en/fa/tr throughout.
- Tests: `repeating-entity` (validator, round trip, operations, approval flow, migration, CLI), `repeating-entity-readers` (brand_retrieve, Coach, canonical ids), V3.1 cases in `visual-bmc` and `studio-visual`.

### Changed

- The canvas zones Key activities and Key resources are answered by the new list questions instead of a "no question yet" gap; Customer segments and Cost structure also read their list. `relationships` is `{ modeled: true, links }` when list items exist, else `{ modeled: false, reason: 'no_list_items' }`.
- Full Brand Book / Business Report (V4.2, after merging main): an approved list prints as its items (name, choice labels in the page language, detail, links by item name, numbered in the page's digits), never an item id. A draft, withheld or unpublished list carries no items into a book, and a report no longer embeds the canvas zone block (drafts, item ids); it keeps the framework reference. fa/tr book labels for the four list questions. Book reference screenshots unchanged.

## Unreleased — CI

- CI: the `brand tests` step timeout in `validate.yml` rises from 10 to 18 minutes (the suite now takes about 10 minutes on GitHub runners) and the `verify` job timeout from 20 to 28.

## Unreleased — Runtime: batch not-ready exits non-zero (PR-E owner decisions)

### Changed

- `brand:runtime social-batch` exits **3** when production readiness is `not_ready` (was 0). The drafts, `batch-summary.json` and `production-readiness.json` are still written; one en/fa/tr line goes to stderr so `--json` stdout stays clean. Scripts that ran `social-batch` with `--require logo` and no `--root` now see exit 3.
- `docs-internal/BRAND_RUNTIME.md` records the seven PR-E owner decisions (contrast and duplicates review only, only the logo requirable, partial data a warning, no signing, access-log line ids only in `brand/.private`, not-ready exit 3).

## Unreleased — Visual V4.1: Command Center, Publishing gallery, audience redaction

### Added

- `packages/brand-core/src/visual/publishing.ts`: export profiles `public`, `investor`, `internal`; `redactVisualDocument` and `redactDocumentModel` (restricted never shown; finance, `.private`-sourced, unapproved and unknown-id values and draft marks never in public or investor; competitor analysis internal only; business and marketing plans never public); `buildPublishingGallery` (document types × profiles, readiness on redacted output, counts only, review-due count); `coverageCells`.
- Studio Publishing gallery at `/brands/<slug>/governance/documents` (GET only, en/fa/tr, RTL), in the Publishing & Governance group.
- Tests: `visual-publishing`, `studio-publishing` (synthetic brands only).

### Changed

- Overview is now the **Command Center** (R4): a 30-second strip (decisions needed, review due, contradictions, exports ready) and a coverage mini-map per framework lead the page; the template update panel moved lower. Labels in en/fa/tr (Command Center / مرکز فرمان / Komuta Merkezi).
- Public visual editions in the Studio projection pass the core public-profile redactor; the projection gains `publishing` (older caches rebuild on sync).
## Unreleased — Pilot and workflow acceptance (fixes pack PR-F)

### Added

- `npm run brand:acceptance -- (--demo | --root <checkout>) --out <empty dir> [--lang en|fa|tr] [--json]`: runs the four journeys of the fixes pack (single visual, ten Instagram posts, website brief, paid-ad brief) end to end through the real stdio MCP server and the real `brand:runtime` / `brand:visual-dna` CLIs, and records PASS / FAIL / NOT_TESTED per check with id-only evidence for FIX-01…FIX-08. Owner checkouts are read through a temporary snapshot and hashed before and after; refused under an agent token; no model, no network, `authorizes: []`. Report contract `schemas/acceptance-report.schema.json` (`brand-os/acceptance-report/v1`); printed summary in en/fa (RTL)/tr. Synthetic fixture in `scripts/acceptance/fixture.ts` (demo brand plus restricted canaries, an approved paid strategy, an approved motion fact and a draft logo answer). Guide and end-to-end setup guide: `docs-internal/ACCEPTANCE.md`. Tests: `acceptance-harness`.

### Fixed

- A stale pack is no longer rendered: with `--root`, `brand:runtime social-batch --pack` stops with `stale_pack` before writing when an approved fact the pack cites changed or is no longer approved, and `brand:runtime readiness` adds the blocking check `context.source_drift`. Without `--root` nothing changes. (`packSourceDrift`, found by the acceptance harness.)

## Unreleased — Nontechnical agent onboarding (fixes pack GAP-11, docs and test only)

### Added

- `docs-internal/AGENT_ONBOARDING.md` (en), `AGENT_ONBOARDING.fa.md` (fa, RTL), `AGENT_ONBOARDING.tr.md` (tr): a plain-language owner guide to set up one fresh authorised agent over the existing local stdio MCP server and agent token: create the approval secret, issue a token (proof read from the secret file, never argv), connect Claude Code with `claude mcp add --scope local` (token never in history or the repo), verify, see what is refused, revoke.
- `docs-internal/AGENT_ONBOARDING_HOSTED.md`: design note listing what a hosted remote MCP would need. **Not built**; needs an owner decision and a new security review.
- Test `fresh-agent-setup`: walks the guide's commands as child processes in a temporary synthetic brand (secret, issue, `brand:query` check, stdio MCP read of allowed data, out-of-profile/restricted/forged arguments withheld, owner-only actions refused, revoke, restart fails closed), and checks that every `npm run` command and profile named in the three guides exists.

No runtime behaviour, profile, tool or Studio route changed.

## Unreleased — Research notes linked to the evidence register (GAP-09 follow-up)

### Added

- `npm run brand:assurance-link -- list | link --note kn_… --evidence ev-NNNN | unlink --note kn_…` (`[--date] [--expect] [--as-of] [--lang] [--json]`): owner-only. Links an Assurance research note, at its current revision, to an evidence-register entry. Refused under `BRAND_OS_AGENT_TOKEN`; no MCP tool, Studio route or agent profile reaches it. en/fa/tr text.
- `assurance/links.ts`: links stored in `brand/.private/assurance/evidence-links/<note>.json` (brand workspace, gitignored, 0600, atomic, locked), append-only hash-chained revisions with ids and dates only. A tampered, foreign or non-owner history is refused.
- Tests: `assurance-links`, `assurance-link-cli` (synthetic temp brands only).

### Changed

- The bridge (`brand-os.assurance-bridge/3`) counts a linked note as `independent` while the register entry qualifies on the `--as-of` day (verified, not owner testimony, same question, not past its review date) and the note is unchanged; otherwise `owner_stated`. The snapshot lists `evidence_links` (ids and a state); a new non-blocking gap `independent_evidence` points at `brand:assurance-link`. A qualifying link makes a PRR-08 judgment stale. Unapproved answers still lower the ratio; never a certification.

## Unreleased — Visual V4.2: full Brand Book and Business Report PDF

### Added

- `npm run brand:export-visual -- --doc brand-book|business-report`: the full Brand Book and the Business Report as A4 portrait books on the V1.2 engine (cover, imprint, contents with real folios, running heads, numbered notes), en/fa/tr, internal and public editions, HTML and digital PDF. Persian mirrors the book and uses Persian digits for folios and chapter numbers.
- Core `visual/full-book.ts` (`BookDocument`, `composeBook`, `buildBook`): chapters from the Brand Book and business plan sections, the "Visual identity" plates and the Business Model Canvas. Approved values only: drafts print as labels, recommendations are dropped, restricted values (finance figures) are never printed in any edition; the public edition shows no draft or restricted mark.
- Designed "not yet available" pages for chapters with nothing approved, planned chapters (Motion, Applications) and chapters that print on their own today (Mascot atlas, Competitive landscape). Nothing is invented.
- en/fa/tr text for the books, including fa/tr field labels for every printed question (`visual/i18n-full-book.ts`); ILLUSTRATIVE / MOCK DATA fixture `illustrativeBook`.
- Studio projection `visual.books` (read by the export command; no new Studio route).
- Visual QA: 10 new baselines (Brand Book cover, contents, Strategy; Business Report contents, Executive summary; en and fa), overflow and RTL checks, and PDF read-back checks (contents point at printed pages, folios, embedded fonts, Vazirmatn on fa pages, no draft or restricted value).

### Changed

- The book engine is generic (`renderBook`, `layoutBook`, `bookGalley`); the identity book's output is byte-identical. Plate heads accept a book-wide number. A contents page with more than seven entries uses compact rows.


## Unreleased — Coach contradiction and facet rubrics (fixes pack GAP-08)

### Added

- `coach/rules.ts`: a narrow rule registry for `consistency_review`. `potential_tension` from `premium-vs-lowest-price` (guards: entry tier, plan, trial, launch offer, student/nonprofit price) and `availability-held-back`, each with one explanatory question in en/fa/tr; `needs_verification` from `evidence-claim-unverified` and `sensitive-claim-wording` (guarantees, certifications, rankings, awards; negated mentions and banned-claim lists excluded). `confirmed_conflict` still comes only from `findContradictions`.
- `rule_checks` on `consistency_review` results (additive, optional in the schema): every rule's outcome, including `not_tested` when an input is open. Printed as "Rules checked".
- `coach/facet-rubrics.ts`: six personal facet rubrics in `quality_review` — founder role vs ownership, consultant client confidentiality, creator dated audience numbers and sponsorship disclosure, artist usage rights, speaker dated talks and publications. They link existing canonical questions and add no field.
- Finding codes `consistency_tension`, `consistency_verification`, `facet_ownership_separate`, `facet_companion_open`, `facet_claim_undated` with en/fa/tr text.
- Tests: `coach-rules` (synthetic brands only), including the no-false-conflict pricing and market cases.

### Changed

- `COACH_RULE_VERSION` is `coach-rules/2`. `follow_up` and the automatic Coach moments are unchanged.

## Unreleased — Visual V3.5: finance security design (proposal, docs only)

### Added

- `docs-internal/FINANCE_SECURITY_DESIGN.md`: **proposal awaiting owner approval** (decision D4). Finance data classes, threat model, storage and readers (owner vs agent token vs Studio), redaction per audience and export profile, audit logging, invariants that must never reach agents or Studio, open owner decisions FD1–FD8 with a recommendation each, proposed en/fa/tr strings. No code, route, tool or profile changed; restricted finance stays out of Studio, agents and Git.

## Unreleased — Visual V3.4: mascot atlas and evolution sheet

### Added

- Mascot atlas (`mascot_atlas` block): every expression, pose and product state from approved catalog artwork only, backed by an approved, checksummed, previewable, non-example asset; each plate carries the recorded usage and do / don't notes. Draft artwork is never drawn: the internal edition lists it as "in review", the public edition leaves it out. A file still tagged `draft` stays out of the public edition. Designed empty state when nothing is approved.
- Six-stage evolution sheet (`mascot_evolution` block): stages in order with approved stage artwork; missing or undefined stages are clear placeholders; the template's example configuration is labelled.
- Studio: `GET /brands/<slug>/visual/mascot[/print[?edition=public]]`, read-only, en/fa/tr with RTL and Vazirmatn, ids only in details and the print appendix; one link on the Assets page's mascot card. Sync rebuilds caches written before the atlas existed.
- Framework registry entry `MASCOT-MODEL-SHEET`; ILLUSTRATIVE fixture in `npm run visual:golden`.
- Tests: `visual-mascot`, `studio-visual-mascot`, `studio-visual-mascot-browser`.

## Unreleased — Visual V2.4: grouped Studio nav, stable routes, Brand Book editorial reader

### Added

- Studio sidebar grouped by intent (R1): **Command**, **Strategy Lab**, **Brand Studio**, **Market & Content**, **Publishing & Governance**, with standard page names (Business Model Canvas, Business plan, Marketing plan, Competitor analysis). Every page stays in the navigation; the competitor matrix and the Coach notes card (an Overview anchor) are now listed too. Group labels en/fa/tr.
- Stable brand routes (R2): `/brands/<slug>/strategy/business-model`, `/strategy/business-plan`, `/brand/book`, `/brand/book/visual-identity`, `/brand/design-system`, `/brand/assets`, `/brand/creative-decisions`, `/brand/personal`, `/market/marketing-plan`, `/market/competitors`, `/market/content-calendar`, `/market/knowledge`, `/governance/history`, `/governance/github` (print views keep `/print`).
- Brand Book page as an editorial chapter reader (R3, `apps/studio/src/views/visual-book.ts`): book opener with contents, chapter openers with numbers in the reader's digits, approved values as prose, do/don't spreads, the V2.1 colour/type/logo plates as specimens, version footers (approved version, commit, date), technical ids only under **Source ids**. Drafts are labelled *Draft, not approved* and never shown as published; the draft tag on a logo master stays visible to the owner.
- Tests: `studio-visual-book` (reader), redirect and nav test in `studio-server`, reader browser checks in `studio-visual-browser` (four widths, en/fa, light/dark, AA contrast).

### Changed

- The old flat paths answer **301** to the stable paths for one release (query kept; `/business?doc=marketing-plan` → `/market/marketing-plan`). Auth is unchanged: guests go to `/login?next=<path>`, unregistered slugs get 404. No new non-GET route.
- The V3.4 mascot atlas moves to the stable path `/brands/<slug>/brand/mascot[/print]` (Brand Studio); `/visual/mascot[/print]` answers 301 like the other old paths.
- Business OS is split into **Business plan** (Strategy Lab) and **Marketing plan** (Market & Content); both keep `documentView`, as do personal documents.

## Unreleased — Production readiness and quality gate (fixes pack PR-E, GAP-05)

### Added

- `productionReadiness()` (`@brand-os/brand-core/runtime`): a separate `brand-os/production-readiness/v1` projection over a `task_context` pack. `TaskContextPack.readiness` keeps its meaning (context only) and is copied unchanged. `production_ready` is `ready` only when no deterministic rule blocks; it is not approval and carries no score; `human_review_required` is always true. Every check names its rule owner, input (ids and counts only), verdict and whether it blocks. Hard rules: pack digest, blocked context, no verified renderer (only `social_batch` has one), unsupported count/format/channel, missing approved copy, a banned claim (the content-bridge guard, shared with `postChecks` as `copyClaimConflicts`), and a logo the owner marked required that is missing, changed, withheld, not SVG or not verifiable. Optional assets never block. Artifact stage re-hashes every file, re-runs both SVG gates on the bytes, checks the pack pin and a required logo in every post, and lifts the runtime's own checks with their owners; non-hard runtime failures (contrast) become `needs_human_review`.
- MCP tool `production_readiness` (strict schema; pre-render; builds the pack with `task_context` and asset verdicts with `visual_dna` under the same caller context; metadata only; guests, unprofiled agents and other brands denied first; one access-log line, ids only).
- `brand:runtime readiness --pack <file> [--root <dir>] [--batch <dir>] [--require logo] [--locale fa|en|tr] [--json]` (exit 3 when not ready) and `--require logo` on `social-batch`, which also writes `production-readiness.json` (`batch-summary.json` is unchanged). en/fa/tr labels, fa RTL.
- `schemas/production-readiness.schema.json`; guide section in `docs-internal/BRAND_RUNTIME.md`; `task-context` skill step 8. Tests: `production-readiness` (synthetic demo brand only); `audit` pins the tool.

### Changed

- The runtime reads its logo through the Visual DNA resolver (Visual DNA owner decision 6): `loadApprovedLogo` resolves the pack's logo ids as the owner process and reads the bytes with `readVerifiedAsset(…, 'renderer')`; a file that differs from the pack's pinned checksum is `pack_pin_differs`. Not-embedded reasons are now `visual_dna:<state>:<reason>` codes. The resolver's append-only access-log line is the only write under `brand/`. The runtime resolves with the default `use_scope: public` (#44), so a portrait with internal-only rights is never embedded. The synthetic demo logo records its licence.

## Unreleased — Visual V1.3: visual QA (screenshot baselines, PDF text/font checks, RTL checks)

### Added

- `tests/studio-visual-qa.test.ts` (Studio/Chrome CI job), on the ILLUSTRATIVE / MOCK DATA fixtures: reference screenshots of the A3 Business Model Canvas and the A4 Brand Book visual-identity chapter (cover, contents, colour plate) in en and fa, compared with `tests/visual-baselines/*.png` (fonts awaited, animation off, deterministic text rasterisation, tolerant diff); on a mismatch the actual, baseline and diff images are written to `dist/visual-qa/` and uploaded as the CI artifact `visual-qa-diff`.
- `npm run visual:baselines`: re-renders and overwrites the baselines, for intended visual changes only.
- Digital PDF checks on the `brand:export-visual` book: headings, contents entries with the right page numbers, folios (Persian digits in fa), and every font embedded including the bundled OFL Inter, Rajdhani and Vazirmatn. No bleed or PDF/X claim.
- RTL checks: `dir="rtl"`, headings without overflow or words split across lines, mirrored contents leaders and folios, canonical (not mirrored) canvas.
- `tests/helpers/visual-qa.ts`: PNG codec, pixel diff and Chrome-PDF reader on Node `zlib`, no new dependency.

### Known

- On the fixture, the A3 canvas print footer is clipped by about 7 mm; recorded as a `todo` test.

## Unreleased — Owner review judgments for assurance scores (GAP-09 follow-up)

### Added

- `npm run brand:assurance-review -- list | record`: owner-only. `list` shows the Assurance controls that need a person's judgment (today PRR-08) with their state, and `record --control PRR-08 --judgment yes|partly|no --note "…" [--date] [--expect]` records one. Refused under `BRAND_OS_AGENT_TOKEN`; no MCP tool, Studio route or agent profile reaches it. en/fa/tr text.
- `assurance/reviews.ts`: judgments stored in `brand/.private/assurance/reviews/<control>.json` (brand workspace, gitignored, 0600, atomic, locked), as append-only hash-chained revisions. A tampered, foreign or symlinked history is refused.
- Tests: `assurance-reviews`, `assurance-review-cli` (synthetic temp brands only).

### Changed

- The bridge (`brand-os.assurance-bridge/2`) reads the judgment in force on the `--as-of` day while what it judged (cited facts and research notes) is unchanged, so `brand:assurance assess` can give a score. A judgment whose basis changed is listed as `stale_judgment` (blocking). The snapshot carries the revision id, never the owner's note. Unconfirmed answers still lower the ratio; notes are still owner-stated; never a certification.

## Unreleased — Coach UX: automatic, context-aware guidance

### Added

- `coach/moments.ts`: one policy for when the Strategic Coach speaks on its own (strategic id namespaces or evidence claims, free text or a measure, never restricted) with a closed list of silence reasons. Decision record `docs-internal/COACH_UX_DECISION.md`.
- `brand:interview` prints at most one coach note after an important first answer (interactive and agent mode); `--json` gains an additive `coach` object.
- `brand:approve` (and `--dry-run`) prints up to three coach notes on the batch's drafts before the proof prompt. Never blocks; JSON unchanged.
- Studio Overview: a read-only "Before you approve: coach notes" card (en/fa/tr), hidden when empty. Screenshots in `docs/screenshots/coach-ux/`.
- `BRAND_OS_COACH=off` silences the automatic moments for one shell.
- Tests: `coach-moments`, `coach-moments-cli`, `studio-coach`.

## Unreleased — Visual V1.2: print engine (book_a4_portrait)

### Added

- Typed print profiles (`@brand-os/brand-core/visual` `PRINT_PROFILE_SPECS`): `book_a4_portrait`, `canvas_a3_landscape` (unchanged), `deck_16_9` (planned stub). en/fa/tr book text (`BOOK_TEXT`).
- The Brand Book "Visual identity" print view is now an A4 portrait book: cover, imprint, contents with the printed page numbers and dotted leaders, running heads (book title verso, chapter recto), outer-edge folios (mirrored, with Persian digits, in fa), numbered notes on the page of their reference, tables continued with a repeated header, headings kept with what follows, no orphan page. New stylesheet `visual-book.css`; the canvas print output is unchanged byte for byte.
- `npm run brand:export-visual`: owner-machine export of the identity book or the canvas to self-contained HTML and, with a local Chrome, PDF from a measured two-pass layout with an overflow check. Never inside `brand/` or `.private`, refused under an agent token. Studio stays GET-only.
- Tests: `studio-visual-print-book`; book checks added to `studio-visual-browser` and `studio-visual-identity`.

## Unreleased — Visual DNA owner policy decisions and the `published` status fix

### Fixed

- Manifest status `published` was counted as unapproved: `brand_retrieve kind: asset` skipped it and Visual DNA reported it `missing`. `published` now reads exactly like `approved`; `approved_sha256`, checksum, safe-path, SVG, size, rights and licence checks still apply (replaced bytes are `changed`).

### Changed

- Visual DNA: the brand's own logo, wordmark, logomark or brand mark (`asset.logo.*` and the other mark ids, or a mark tag) with an empty or `TBD` licence is `approved` with `rights.license_basis: own_brand_mark`. Third-party assets still need a recorded licence: client logos, marks tagged `third-party`, `partner`, `client-logo`, `stock` or `licensed`, and every icon, photo, illustration and mascot artwork (`withheld / license_missing`). Approved references now carry `license_basis` (`recorded` or `own_brand_mark`).
- Visual DNA: new `use_scope` (`public` by default; MCP input, `--use-scope` on `resolve` and owner `read`, echoed in the result). Internal-scope rights cover a portrait or other rights-sensitive subject for internal use; public use without public-scope rights stays `withheld / rights`. `rightsBlocker` takes the use and defaults to `public`, so every publication gate is unchanged.
- Tests: `visual-dna-policy` (own mark with empty/TBD licence approved; third-party, partner, client logo, icon and mascot art with TBD withheld; exemption skips no other check; internal portrait approved for internal use and withheld for public use; public rights cover both; pending, expired, holderless and missing rights cover neither; strict `use_scope`; `published` approved; published with replaced bytes or an approval for other bytes `changed`; other statuses missing). `visual-dna-agent` checks `--use-scope` on the CLI.

## Unreleased — Assurance: owner-local bridge to approved brand facts (GAP-09)

### Added

- `npm run brand:assurance -- snapshot | assess | verify`: an owner-local, read-only bridge from a brand's approved facts, internal research notes and open contradictions to the existing Assurance evaluator. Reproducible snapshot digest, `--pin` / `verify` against a kept snapshot, no score while anything blocking is missing, restricted facts withheld below the `restricted` audience, en/fa/tr output, refused under `BRAND_OS_AGENT_TOKEN`, writes nothing, never a certification.
- `@brand-os/brand-core/assurance/workspace` entry point (the pure `assurance` index still reads no file).
- Tests: `assurance-workspace`, `assurance-cli` (synthetic temp brands only).

### Fixed

- Assurance `completeness.blocked_by` reported every `needs_review` blocker as `source_changed`; it now names the control's own reason (for example `reviewer_required`).


## Unreleased — Visual DNA reference resolver (fixes pack PR-C, GAP-03)

### Added

- `packages/brand-core/src/visual-dna` (`@brand-os/brand-core/visual-dna`): a read-only, metadata-first resolver for visual references. It reads asset ids through `brand_retrieve kind: asset`, a mascot emotion/stage/use case/angle through `brand_retrieve kind: mascot`, and creative-memory variants through `creative_context`, all under the caller's one context. Each reference is `approved`, `withheld`, `missing` or `changed`, with source, checksum, size, usage rights and the effective `model_use` (`not_allowed` unless recorded). Extra checks: `approved_sha256` must match, 20 MiB size limit, rights-sensitive subjects need granted rights, a licence must be recorded, a creative variant whose asset changed is `changed`. A missing pose or angle stays missing; nothing is substituted. No new store and no `brand/visual-dna/` folder. `authorizes: []`, every permission flag false (including `upload`).
- MCP tool `visual_dna` (strict, bounded schema; metadata only, never file bytes; guests, unprofiled agents and other brands denied; creative references for `creative-read` only).
- `brand:visual-dna resolve` (as the agent token in the environment, or as the owner) and `brand:visual-dna read <asset.id> --for renderer|local_model|external_provider [--stdout]`: owner-only, one checked asset; refuses a use its `model_use` forbids (`local_only` art never goes to an external provider); hashes and SVG-checks the same bytes it returns; writes no file; `upload_authorized: false`.
- `schemas/visual-dna.schema.json`, `docs-internal/VISUAL_DNA.md`, en/fa/tr notices and reasons (fa RTL). Skills `task-context` and `mascot-creator` check references with `visual_dna`.
- Tests: `visual-dna` (same asset by id and by catalog, wrong angle missing, drafts hidden from agents, changed / approval-for-other-bytes / symlink / active SVG / licence / rights, profile limits, strict input, creative references and stale variants, locales, no writes, owner read and `model_use`), `visual-dna-agent` (stdio MCP and CLI). `audit` pins `visual_dna` in the tool list.

## Unreleased — Task Context MCP tool (GAP-02)

### Added

- `task_context` stdio MCP tool: one read-only pack of approved context per task (`task_type` or the owner's `request`, plus `channel`, `deliverable_count`, `locale`, `request_mode`, `output_format`, `scope_id`). Same core (`buildTaskContext`) and the same single caller context as `brand:query --tool task_context`, through a shared `runTaskContextTool`. Access is checked before a request is classified; the request text is never logged, hashed or returned. `authorizes: []`, every permission flag false. No new profile, store, write path or hosted API.
- Skill `agent-skills/task-context/SKILL.md`; `social-designer`, `ui-designer`, `marketing-creative` and `brand-designer` call `task_context` first, once.
- `docs-internal/AI_CONNECTORS.md`: setting the tool up for a new Claude Code session (token in the server environment, never in a prompt or a committed file).
- Tests: `task-context-agent` (stdio server: listing, Persian ten-post request, digest equal to the core pack, guest, cross-brand, revoked, forged arguments, profile isolation, schema bounds, no request text in the log). `audit` now pins `task_context` in the tool list.

### Changed

- `brand:query --tool task_context` now checks access before classifying `--request`: a guest gets `denied` instead of `need_task_type`.

## Unreleased — Fix: Visual identity shows the approved master logo

### Fixed

- The Visual identity chapter showed "awaiting asset" for a brand with an approved, previewable logo that was not tagged `master`. The master is now resolved deterministically: an asset named (exact asset id or manifest path) in the approved `brand.logo.masters` answer, else one tagged `logo` + `master`, else the only approved logo; several unnamed logos give a designed `ambiguous` state. Only approved, checksummed, previewable, non-example files qualify; the public edition still needs the file published. The internal edition marks a master that carries a `draft` tag or is not published. en/fa/tr.

## Unreleased — Fix: canonical question ids in legacy brand queries (BUG-01)

### Fixed

- `get_logo_rules` and `get_motion_guidelines` (MCP and `brand:query`) asked for `brand.logo.primary`, `brand.logo.clearspace` and `brand.motion.easing`, which no question owns, so they always reported those fields missing. They now read `brand.logo.masters|variants|clear_space|min_size|misuse` and `brand.motion.principles|duration|reduced`, the same ids as the Task Context `logo_rules` / `motion_rules` keys. The response envelope, permissions and missing/withheld markers are unchanged; each tool lists more ids. Easing curves and milliseconds remain tokens (`get_brand_tokens`).
- Every named fact tool reads its ids from one exported map, `NAMED_FACT_TOOL_IDS`. Test: `tests/named-tool-ids.test.ts` (registry coverage, approved/draft/unanswered, guest, wrong profile, cross-brand, stdio MCP).
- Skills `motion-designer` and `mascot-animator` name the real motion ids.

## Unreleased — Visual V2.3: positioning map (owner axes, evidenced points only)

### Added

- Owner decision D2: `brand/.private/competitive/axes.json` is an owner-only record of two axes (label and pole names in en, optional fa/tr, private rationale). `npm run brand:competitive -- axes set|show|validate`. The tool never suggests, ranks or invents an axis.
- `brand/.private/competitive/positions.json`: one qualitative band (`low | lower_mid | mid | upper_mid | high`, never a number) per subject (own brand or competitor) and axis, citing a Knowledge market observation like any competitor observation. `position add|remove`, `positions`.
- `brand:competitive share` adds an optional allow-listed `positioning` section: axis labels and poles, and per subject and axis a state (`evidenced | stale | conflicting | needs_review | unknown`), the bands as recorded and source labels (class, public host, date). Stale = only sources older than 90 days (the research threshold for market observations); conflicting = sources disagree, kept as a range. Never shared: rationale, axis ids, note ids, claim keys, quotes, non-reviewed subjects. A file without the section is still a valid V2.2 file; a tampered section withholds the whole file.
- Visual block `positioning_map` in the renderer registry, on the existing competitor comparison page (plate 03) and its print view (own A4 portrait page): only subjects with a dated source on both axes are plotted; own brand as a lime diamond; stale = dashed ring; conflicting = dashed range box, never resolved; everyone else in a "Not placed" margin with each axis's state; source footnotes share the matrix numbering. Designed empty and withheld states; en/fa/tr with RTL and Vazirmatn; competitor ids only in the details. Illustrative fixture axes and placements (reserved `.example` hosts).
- Studio rebuilds a cache written before the map existed, once, at the same commit.
- Persian edition (owner decision 2026-11-23): the map's horizontal axis is mirrored, low on the right and high on the left, with the vertical axis on the right. Points, conflict ranges, poles and the arrow are mirrored together on screen and in print. en/tr are unchanged. Also decided: the stale threshold stays at 90 days, and the own brand needs one recorded source per axis (an owner statement counts). Screenshots in `docs/screenshots/`.
- Tests: `competitive-positioning`, `visual-positioning`, `studio-visual-positioning`; `studio-visual-competitors-browser` now covers the map (widths, en/fa, light/dark, contrast, print) and the axis direction in en/tr/fa on screen and in print.

No scores, no fabricated numbers, no axis suggestions. No framework or ISO claim.

## Unreleased — Visual V2.2: competitor share path and comparison matrix

### Added

- `npm run brand:competitive -- share [--dry-run]` (owner decision D1): writes a quote-free, redacted landscape of owner-reviewed competitors to `brand/competitive/shared/landscape.json` for the owner to review and commit. Allow-list projection only (names, relationship, markets, verified domain, per-criterion state, short labels, source class/public host/date, public prices as recorded with rate labels). Never shared: quotes, note ids, claim keys, URLs, status reasons, unverified domains, hypotheses, owner or first-party source hosts. Idempotent; a removed competitor disappears. Refused under an agent token.
- Studio: read-only "Competitor comparison matrix" page `/brands/<slug>/visual/competitors` and its print view (A4 portrait opener, A4 landscape matrix page) on the existing print path. New visual blocks `competitor_matrix` and `price_strip` in the renderer registry; designed empty and withheld states; en/fa/tr. Internal edition only. One banner link from the Business model page.
- Studio's tar allowlist admits exactly `brand/competitive/shared/landscape.json` under `brand/competitive/`; the strict reader withholds the whole file on any unexpected field.
- Tests: `competitive-share`, `visual-competitors`, `studio-visual-competitors`, `studio-visual-competitors-browser`.

Nothing is ranked, scored or converted. No positioning map (V2.3). No framework or ISO claim.

## Unreleased — Assurance registry and assessable controls (Trust v2 PR-A)

### Added

- `@brand-os/brand-core/assurance`: a pure library with the six-level claim ladder (levels only go down; an unverified edition or unchecked source is `reference_only`; `externally_reviewed` and `certified` need an attestation of the right kind), a methodology registry (one original assessable method; unchecked W3C/OWASP/BMC entries at most `informed_by`; ISO named only; no edition guessed), a bridge that checks a visual page's framework claim against the registry, 15 typed controls of the original Positioning Readiness v1 rubric over existing question ids, a deterministic evaluator with ten statuses (no ratio unless the denominator is real, changed sources force `needs_review`, restricted inputs withheld), en/fa/tr text for every code, a plain-text gap report and `SYNTHETIC DEMO — NOT A REAL BRAND` fixtures.
- Guide `docs-internal/ASSURANCE.md` with the coverage matrix.
- Tests: `assurance-registry`, `assurance-controls`, `assurance-assess`, `assurance-i18n`.

No command, Studio route, store, approval, MCP tool or agent scope was added. Nothing here is a certification or a compliance statement.

## Unreleased — Task Context Engine, core and CLI (Slice 1)

### Added

- `npm run brand:query -- --tool task_context`: one read-only, source-cited context pack for one task
  (`visual_design`, `social_batch`, `website_design`, `product_ui`, `paid_campaign_brief`, `brand_identity`,
  `personal_content`). It reuses the existing readers — `brandRetrieve` for facts, hash-approved tokens, approved
  assets and mascot artwork, the Strategy Feed for an approved content / paid-media / SEO revision, `creative_context`
  for scoped preferences — with the caller's own token deciding every source. No new store and no new agent profile.
- `--request` runs a deterministic en/fa/tr classifier in the CLI (task type, deliverable count including Persian and
  Arabic digits, channel). An unclear or ambiguous request returns `need_task_type`; the engine never guesses a task.
  The request text is not stored, not logged and not copied into the pack. No model is called.
- Every pack reports `authorizes: []` with `publish`, `schedule`, `spend` and `deploy` false, cites `source_id` and
  `source_revision` per item, lists gaps as existing FieldQuestion ids, and carries `digests.context_sha256` over its
  canonical JSON (`verifyPack`). An approved value that says "not decided" is a gap, never a source. A source the
  caller may not read is a `missing[]` entry with reason `not_authorized`, with no hint of what it holds; withheld
  facts are named only by category (`facts.restricted`).
- Contract `schemas/task-context.schema.json` (`brand-os/task-context/v1`), checked with Ajv in the tests.
- Preflight audit and guide `docs-internal/TASK_CONTEXT.md`: reuse matrix, permission matrix per profile and source,
  field coverage per pack key, and what this slice does not ship. Tests: `task-context` (12), `task-context-cli` (1).

### Notes

- Reading a pack writes nothing; a test compares the whole `brand/` tree before and after. An on-demand batch request
  is not an approved calendar week, and creates none.
- No MCP tool, no skill change and no Studio change in this slice. Found on the way and not fixed here:
  `get_logo_rules` and `get_motion_guidelines` ask for question ids that do not exist in the bank.

## Unreleased — Strategic Coach & Answer Assurance (Coach PR 1)

### Added

- `npm run brand:coach`: an owner-local, read-only advisory layer over the existing interview. `analyze --mode follow_up` returns 0 or 1 clarifying question; `--mode quality_review` returns an explainable status with at most two named deficits; `--mode consistency_review` reports the interview's own deterministic contradictions. `next` coaches the question answered last. `--lang en|fa|tr`, `--json`.
- Every result is `authority: derived_advice` with `authorizes: []`. The coach writes nothing — no answer, fact, config value, approval, strategy, calendar, asset or cache file — and the tests assert the brand is byte-for-byte unchanged after an analysis.
- `follow_up` prefers an existing canonical question and returns its id instead of writing a second version of it. A gap inside the answer gets one localized clarifying question. The chooser is pure in (question, answer revision), so one answer never spawns a second question; `decide later`, `skip` and `unknown` on the target end it for good.
- `quality_review` rubric: relevance, specificity, completeness for the documents the answer feeds, measurability, evidence support, clarity and internal coherence. No score, no percentage, no confidence. `measurability` applies only to questions that ask for a measure, so a qualitative brand answer is never penalised for having no numbers. A deficit on an approved answer sets `requires_change_request` and points at the human change flow.
- `consistency_review` is an adapter: `findContradictions` stays the only implementation of those rules and its results are reported by id, unchanged. `potential_tension` and `needs_verification` are in the contract but not emitted yet, and every result says so.
- No finding quotes, paraphrases or digests the owner's words; text is built from closed vocabularies, question ids and the coach's own lexicon. Restricted questions are refused outright, with no value and no digest. Every mode is denied while `BRAND_OS_AGENT_TOKEN` is set, and no MCP tool or `brand_retrieve` kind exposes the coach.
- Nothing calls a model or the network in this version.
- `schemas/coach-result.schema.json` (reference contract; the Zod schema in `packages/brand-core/src/coach/model.ts` stays authoritative). Guide: `docs-internal/STRATEGIC_COACH.md`. Tests: `coach-core` (25), `coach-cli` (7), with SYNTHETIC DEMO fixtures only.


## Unreleased — Visual V1.1 + V2.1: renderer registry and Brand Book "Visual identity" chapter

### Added

- Renderer registry (`views/visual-registry.ts`) and shared visual primitives (`views/visual-primitives.ts`): state chip, legend, ghost geometry, source footnote, mini-map. No visual change to the canvas.
- Framework registry `packages/brand-core/src/visual/frameworks.json` with `schemas/framework-registry.schema.json`, validated by `npm run validate` (no certification claims; checked claims need a date). Business Model Canvas, WCAG 2 contrast ratio and the Brand OS identity chapter are registered.
- Brand Book "Visual identity" chapter in Studio (`/brands/<slug>/visual/identity`, print view `/print`, `?edition=public`): colour palette with declared combinations and a computed WCAG 2 contrast grid, typography specimen in en/fa/tr, logo construction from the approved master asset (tags `logo` + `master`). Drafts are never drawn; each plate has a designed "awaiting approved asset" state. Ids only under "Details and sources" and in the print appendix. en/fa/tr.
- Golden examples for the chapter (complete and awaiting) in `npm run visual:golden`.

## Unreleased — Content planner skill and agent integration guide (Content Bridge Slice D)

### Added

- Skill `agent-skills/content-planner`: the owner's flow from approved facts to an approved content strategy and approved weeks (an agent proposes and reviews, never approves), and the content agent loop (`content_calendar` → `content_brief` with a pin → `content_report`; stop on `stale_pin` or `not_found`).
- Guide `docs-internal/CONTENT_AGENT_INTEGRATION.md`: connecting an external content bot read-only over stdio MCP or `brand:query`, token issue and revocation, the three JSON schemas and digest verification, what `authorizes: []` and the permission flags mean, en/fa/tr notes, and a CLI journey demo with real output.
- Test `content-journey` (2): the full journey through the real CLIs and MCP server, and a check that the skill and guide name only existing commands, tools and schemas.

### Changed

- The `brand:strategy review` note for a `content` strategy now says `content-read` agents read it (true since Slice C).


## Unreleased — Visual Blueprint P0: business model canvas

### Added

- `@brand-os/brand-core/visual`: a versioned semantic `VisualDocument` (blocks, data states, missing reasons, framework claim) and a nine-zone business model canvas built through the document model's `itemFor`, so approval, drafts, restriction and publication follow the same rules as the Brand Book. Gaps name the question to answer; nothing is guessed.
- Studio: read-only **Business model** page (`/brands/<slug>/visual`) and an A3-landscape print view (`/visual/print`, `?edition=public` without drafts), en/fa/tr, light/dark, reduced motion. No new non-GET route.
- Reading polish after owner review: standard name "Business Model Canvas"; question ids, next questions and helper text moved out of the canvas into a closed "Details and sources" area (screen) and print page 2; editorial type scale and whitespace in the zones.
- `npm run visual:golden`: golden examples from an ILLUSTRATIVE / MOCK DATA fixture. Guide `docs-internal/VISUAL.md`. Tests: `visual-bmc`, `studio-visual`, `studio-visual-browser`.

## Unreleased — Content agent tools (Content Bridge Slice C)

### Added

- Agent token profile `content-read` (`brand:agent-token issue --profile content-read`). It reads facts as `marketing`, approved `content` strategies through `strategy_list` / `strategy_get`, and the new content tools. Existing tokens are unchanged.
- MCP tools `content_calendar` (approved, current calendar weeks in a date range, optionally one channel) and `content_brief` (one slot: voice, banned claims, audience, resolved key message / offer / CTA, channel plan, cited competitive angle, approved creative preference ids). Both are also in `brand:query`. Stable JSON with revision and digests; drafts and weeks that need review are only counted; a stale week pin is refused; restricted facts are never sent.
- MCP tool `content_report`: an agent reports a slot as `produced`, or `published` with an https URL. It is stored as an observation next to the calendar and changes no week, strategy or fact. The URL is checked for form and never opened. It grants no permission to publish.
- `npm run brand:content -- reports`: the owner's view of those reports (en/fa/tr).
- Tests: `content-agent` (7). Guide: `docs-internal/CONTENT_BRIDGE.md`.

## Unreleased — Content strategy and voice rules (Content Bridge Slice A)

### Added

- Strategy records gain a `content` type with a typed `content_strategy` block: content languages, pillars that cite the approved pillars fact, channels with role, formats and cadence (null until the owner decides), approved fact ids per role (voice, claims, audience, messaging, pillars, channels, offers, CTA, languages, objective), owner-written extra rules, pinned SEO / paid-media strategy revisions and explicit gaps. Review, approval, rejection and withdrawal are the existing `brand:strategy` commands.
- `npm run brand:content -- strategy`: proposes a content strategy from approved facts. It never writes voice: facts are cited by id, and anything missing, still `TBD`, or only the owner can decide is listed as a gap in en/fa/tr. `--out` writes a proposal file to edit, `--store` stores a draft.
- `npm run brand:content -- show`: the owner's voice rules projection of the approved content strategy (voice text, do / don't pairs, banned claims, availability rule, pillars, channels, gaps), resolved from approved facts. Drafts are never shown.
- A changed cited fact or a replaced cited SEO / paid-media strategy puts the content strategy in `needs_review`. Restricted facts such as the budget are refused. No agent reads content strategies yet.
- Guide `docs-internal/CONTENT_BRIDGE.md`. Tests: `content-strategy`, `content-cli`.

## Unreleased — Identity audit and logo brief (Identity Slice D)

### Added

- `npm run brand:identity`: the owner's identity audit and logo brief. `next` and `answer` run a short en/fa/tr diagnosis (path, why change, observed problem or preference, success, what must not change, recognition evidence, real uses, scripts, rollout). `equity` records preserve / refine / replace / evaluate / unknown per element; measured recognition needs a cited study note. `link-creative` links a Creative Learning project for concept rounds. `brief` prints a Markdown or JSON draft; `reviewed` records what the owner read.
- The brief covers new identities, retain, evolve and rebrand: problem and canonical inputs by fact id, existing assets, the equity matrix and migration risks, the competitor visual landscape from the Slice C identity projection only, 2–3 routes with why / why not / risks / red lines, uses and production checks, an unweighted rubric, the decision record, the approval hand-off and every missing item. It writes nothing and authorizes nothing.
- Creative Learning gains a `logo` surface. Selection there is never an approved mark.
- Skill `agent-skills/logo-identity-strategist` (before `logo-designer`). Guide `docs-internal/IDENTITY_BRIEF.md`. Tests: `identity-brief`, `identity-cli`.

## Unreleased — Cross-functional competitive drafts (Identity Slice C)

### Added

- `getCompetitiveContext(ws, purpose, {market, lang})`: one read-only projection of the competitive landscape per purpose (identity, positioning, marketing, pricing, seo, expansion). Marketing, pricing, SEO and identity drafts all read it, so they share competitor ids and cited refs. It returns `missing`, `candidate_only` or `evidence_insufficient` instead of empty lists.
- `brand:competitive memo --purpose marketing|pricing|seo|identity [--market] [--lang en|fa|tr] [--json]`: a marketing opportunity memo, a pricing benchmark memo, a cited SEO supplement or a visual landscape assessment. Drafts only: conflicts and stale sources are listed as unresolved, prices are never ranked or converted and carry rate labels, options are hypotheses with no number, approved facts are cited by id and revision. Nothing is written.
- `brand:competitive context --purpose …` and `brand:competitive import-seo-names [--dry-run]`. The import adds SEO interview names as unverified `seo_interview` candidates only when the owner runs it; existing names are reported, never merged.
- Tests: `competitive-context`, a second `competitive-cli` journey.

## Unreleased — Competitive landscape (Identity Slice B)

### Added

- `npm run brand:competitive`: an owner-only, per-brand competitor index in `brand/.private/competitive`. Owner-named businesses become unverified `candidate` records (`cmp_<uuid>`) with relationship (direct, indirect, substitute, aspirational benchmark) and geography (local, regional, international) as separate dimensions.
- Observations cite Knowledge research notes (recorded with `brand:seo research capture|replay`, topic `market_observation`) as `{note_id, revision, claim_key, observed_at}`. No quote is copied. A public price is accepted only when the cited quote shows the amount, currency and stated terms.
- `brand:competitive matrix` builds a deterministic landscape: matrix cells (`observed`, `unverified`, `hypothesis`, `historical`, `conflicting`, `needs_review`, `unknown`), prices listed but never ranked or converted, an en/fa/tr gap checklist and the inferences it never supports. Changed, stale, superseded or archived sources visibly degrade. No network, no brand-fact writes, refused under an agent token.
- Guide: `docs-internal/COMPETITIVE.md`. Tests: `competitive`, `competitive-cli`.

## Unreleased — Identity intake (Identity Slice A)

### Added

- The Studio new-brand wizard asks three optional questions on the Profile step: logo today, what to do with the identity, and how deep a change (only for refine or rebrand). They are in en, fa and tr, mirrored on the review step and prefilled by Edit and retry. Contradictions such as "no logo" + "keep" are refused.
- The answers are stored as an unapproved owner hint in `onboarding.identity` of `brand/brand.config.yaml` (`authority: unapproved_owner_intake`). They are never a fact, publication grant or asset, and no MCP, `brand:query`, public docs or Studio brand page shows them. Brands without the block read as unknown / undecided.
- `brand:init --logo-presence --identity-intent --change-depth`. Without these flags `brand:init` is unchanged. `brand:validate` warns about an invalid block.
- Guide: `docs-internal/IDENTITY_INTAKE.md`. Tests: `identity-intake`, `studio-identity-intake`, and the browser wizard journey.

## Unreleased — Strategy records and Strategy Feed (Spec Sprint 3)

### Added

- `npm run brand:strategy`: propose (`--file` or `--from-seo`), list, show, review (field diff, sources, blockers), approve (owner proof plus `--expect-sha`), reject, withdraw. Revisions are immutable under `brand/.private/strategy/records/` (gitignored) and cite approved facts and `knowledge:kn_…@sha256` research notes only.
- Agent-token profiles `strategy-seo-read` and `strategy-ads-read`, and the read-only `strategy_list` / `strategy_get` tools in the stdio MCP and `brand:query`. Only the approved, currently valid revision is served, as stable JSON with content, approval, source and feed digests. Restricted fields and the other kind's recommendations are listed under `redacted`. A stale pin is refused. Reading grants no permission to execute, spend or publish.
- Tests: `strategy-store`, `strategy-seo-import`, `strategy-cli`, `strategy-feed`. `audit` pins the two new tool names.

## Unreleased — Engine fixes

### Fixed

- A retracted (`brand:retract`, status `deprecated`) answer no longer counts as answered. Completeness counts a retracted required question as unanswered again, the interview queue and `brand:next` ask it again, and it no longer satisfies `depends_on`. Ledger history of the retracted answer is unchanged. New helper `isOpenAnswer` in `@brand-os/brand-core`. Tests: `brand-core-completeness`, `personal-evidence`.

## Unreleased — Phase 10 prep: Studio VPS deployment package

Theme: everything the launch operator needs to run the read-only Studio at `studio.omidataei.com` on the owner's VPS, behind the existing edge Caddy. **Nothing is deployed by this change.** Docs: `docs-internal/phase-10/`.

### Breaking changes

- None for brand repositories, the CLI, MCP or the docs build.
- Studio: with `STUDIO_TRUST_PROXY=1`, rate limits now use the rightmost `X-Forwarded-For` entry instead of the leftmost. Beyond loopback, requests for any hostname other than the public origin's get `421`.

### Added

- `infra/production`: Dockerfile (digest-pinned, multi-stage, non-root), Compose for `/opt/brand-os-studio` (only `172.18.0.1:8083`, read-only, 512 MiB, health check), `.env.example`, `Caddyfile.studio`, `smoke-test.sh`, `backup.sh`, `restore.sh`; root `.dockerignore` allowlist.
- `npm run studio:build` (esbuild bundle); `studio bootstrap-owner` and `studio check-config`.
- `/healthz` reports `503` when the data directory is not writable. The HTTP listener uses a 65 s keep-alive and a 16 KiB header limit.
- Tests: `studio-hardening`, `studio-cli`, `studio-deploy`, `studio-browser-production`; CI workflow `studio-image.yml` (image build, Compose run, smoke test, restore drill).
- Docs: `docs-internal/phase-10/` (architecture, deployment contract, operations, deploy runbook, Grok handoff, Claude editing workflow, security review).

### Fixed

- Studio registry: `studio register` and `unregister` run next to a live server (for example via `docker compose exec`) used to be invisible to the server until restart, and the server's next save, such as a new brand, overwrote them. The registry now reloads the file whenever it changed on disk.

### Not included

- The live launch (VPS, Caddy reload, TLS, owner enrollment, GitHub tokens, test repository). See `GROK_HANDOFF.md`.

## Unreleased — Creative Learning Sprint 2 (agent read path, aspect proposals, Studio decisions)

Guide: `docs-internal/CREATIVE_LEARNING.md`.

### Added

- `creative-read` agent-token profile and the read-only `creative_context` MCP tool (local stdio): approved scoped creative preferences and cited selection/rejection reasons. Drafts and superseded preferences are only counted; verbatim feedback only from shared notes. One access-log line per call.
- `brand:creative aspects suggest|list|approve|reject`: keep/avoid aspects suggested from feedback text by a deterministic fa/en/tr lexicon. Pending until the owner approves with the approval proof; never auto-applied.
- `brand:creative share --id cp_… [--dry-run]`: writes a derived summary of an approved decision to `brand/creative/shared/` for the owner to commit.
- Studio: read-only **Creative decisions** page for merged shared decisions (en/fa/tr).

### Security

- Existing tokens gain nothing; every other profile, guests and other brands are denied `creative_context`. Local note text, drafts, proposals and secret-looking text never reach agents or Studio. Studio admits only `brand/creative/shared/cp_<uuid>.json` under `brand/creative/`.

## Unreleased — Creative Learning MVP (Sprint 1)

Theme: auditable memory of the owner's design choices, built on the Knowledge Inbox. Guide: `docs-internal/CREATIVE_LEARNING.md`.

### Added

- `packages/brand-core/src/creative/` (subpath export `@brand-os/brand-core/creative`): projects, variants, feedback links, selection, scoped preferences with owner approval and supersession, and next-session context with `knowledge:kn_…@<sha256>` provenance.
- `npm run brand:creative` (`scripts/creative.ts`).
- `agent-skills/creative-memory/SKILL.md`.

### Security

- Owner-only: refused under `BRAND_OS_AGENT_TOKEN`; records in gitignored `brand/.private/creative`; restricted notes cannot be linked; brand-wide approval refused; approved facts, ledger and publication state are never written.

## Unreleased — Knowledge Inbox (Baalda-inspired)

Theme: capture messy ideas per brand, find them in fa/tr/en, link them, and turn them into draft proposals without ever bypassing approval. Guide: `docs-internal/KNOWLEDGE.md`.

### Breaking changes

- None. Brands without `brand/knowledge` keep working with zero notes and no flag.

### Security

- Studio's archive filter now blocks every `brand/knowledge/**` path except `brand/knowledge/shared/*.md`, checked before any other rule (it was a blocklist, so committed caches or link files would have reached Studio).

### Added

- `packages/brand-core/src/knowledge/`: note model (`kn_<uuid>`, reader-computed sha256 revision), local-by-default store under `brand/.private/knowledge`, AES-256-GCM restricted notes, revision-checked edits with anchors, per-note locks, snapshots and recovery, idempotent append, archive/restore, fa/tr/en search, links/backlinks/related/duplicates, fail-closed share to Git, doctor and migrate.
- `npm run brand:knowledge` (`scripts/knowledge.ts`).
- `brand:backup` now includes `brand/knowledge`.
- `brand:knowledge propose` / `provenance`: note → draft proposals over the existing intake, with `knowledge:<id>@<sha256>` provenance, stale detection and a preview of every quotation that would enter tracked interview files.
- `knowledge-read` agent-token profile and read-only MCP tools `knowledge_list`, `knowledge_search`, `knowledge_read`, `knowledge_backlinks`, `knowledge_suggest_proposal` (shared notes only). Existing profiles unchanged.
- `agent-skills/knowledge-inbox/SKILL.md`.
- Studio: read-only **Knowledge** section for merged shared notes (labelled unverified ideas), en/fa/tr, filters, search, detail with backlinks and linked questions. No new write route.
- Tests: `knowledge-storage`, `knowledge-search`, `knowledge-security`, `knowledge-cli`, `knowledge-proposals`, `knowledge-agent`, `studio-knowledge`; Knowledge page browser checks in `studio-browser`.

## Unreleased — SVG checker, normalizer and asset approval

Theme: an editor's SVG export should not be silently refused. Brand OS now says what is wrong, fixes what is safe to fix without changing the drawing, and ties asset approval to exact bytes.

### Breaking changes

- `npm run validate` now fails when a present SVG in the asset manifest is not publishable. The message names the problem and, when it is fixable, the command. Run `npm run brand:assets -- check` after a template update.
- The check is stricter in two places: a prefixed XHTML element such as `<h:script>` is now refused (the regex gate missed it), and a non-SVG namespace or an unknown element is refused unless the normalizer can remove it.

### Added

- `checkSvg`: structured, namespace-aware SVG check with codes, lines and `fixable`. Internal `url(#id)` and gradient `href="#id"` references are allowed. A leading XML declaration is allowed.
- `npm run brand:assets -- check | normalize <id> | approve --ids <id>`.
- Normalizer on SVGO 4.1.0 (five plugins, no shape changes), originals kept in `brand/assets-src/`, `derived_from` and `normalizer` in the manifest, a pixel-identical render check (resvg) before an approval is carried.
- Asset approval of exact bytes (`approved_sha256`), with the owner proof rules of the other approval commands.
- Studio names the SVG problem and shows the fix command (en/fa/tr).
- Fixtures from Illustrator, Inkscape and Figma; tests `svg-check`, `svg-assets`, `studio-svg-issues`.
- devDependencies: `svgo` 4.1.0, `@resvg/resvg-js` 2.6.2.

## Unreleased — Phase 9: Read-only Brand OS Studio

Theme: one private place to create brands and see their approved state, while all editing stays in Claude Code. Guide: `docs-internal/STUDIO.md`.

### Breaking changes

- None for brand repositories, the CLI, MCP or the docs build. Studio is a new, optional app.

### Added

- `apps/studio`: private, authenticated, read-only Studio at `/brands/<slug>` with owner sign-in (password and TOTP), the New Brand wizard, provisioning status, Overview, Brand Book, Design System, Assets & Mascot, Business OS, Personal Brand (Phase 8, read-only), History & Review and the GitHub & Claude Code handoff (copy repository URL, copy starter prompt, private-access notice).
- Owner-only provisioning of one private repository per brand from the template using the core initializer, with retries, partial-create cleanup and concurrency locks. This is Studio's only write.
- Read path from the merged default branch with safe archive extraction, projections from brand-core, cached SHA and sync time, stale and error states, and a signed push webhook.
- en, fa (RTL) and tr interface catalogs; light and dark themes; responsive layout.
- `npm run studio:start`, `npm run studio`, `npm run studio:hash-password`, `npm run test:e2e`; `apps/studio/.env.example`.
- Tests: `studio-github`, `studio-provision`, `studio-sync`, `studio-server` and `studio-browser` (real headless Chrome when installed), 205 tests in total.

### Not included

- Server deployment (Phase 10). No Studio is running anywhere because of this change.

## Unreleased — Phase 8: Personal Brand OS

Theme: one engine for people as well as companies. A personal brand is an optional module with combinable facets, explicit relationships to organizations, evidence and rights for public claims, and ten source-backed deliverables. Guide: `docs-internal/PERSONAL_BRAND.md`. Review: `docs-internal/archive/PHASE_8_PERSONAL_BRAND_REVIEW.md`.

### Breaking changes

- None for existing brands. A config without `modules.personal` is treated as disabled, and `brand:migrate` adds the block with `enabled: false`.
- Assets with `subject: portrait | person | case_study | client_logo | testimonial`, or tagged `portrait`, `headshot`, `case-study`, `client-logo` or `testimonial`, are no longer public without a granted, public, unexpired `rights` record.
- The MCP server lists one more tool, `draft_personal_content`. Clients that pin the exact tool list need an update.
- `DocumentItem` has a new `verification` field (null for non-personal items), and `DocumentSection` may carry a `length` report.

### Added

- `brand:init --profile personal-brand --facets <list>` and `--personal true`; `modules.personal { enabled, facets }`.
- Personal question bank (`brand/interview/question-bank/personal.yaml`): identity, positioning, story, experience and credentials, evidence and portfolio, thought leadership and channels, visual presence, privacy and contact, plus founder, consultant, creator, artist and speaker facets. Prompts in English with fa and tr locale data.
- Condition `config.modules.personal.facets has|lacks <facet>` and `config.brand.profile`; `moduleEnabled()` shared by the dashboard, compiled pages and docs build.
- Exclusive interview profiles (`exclusive: true`): questions outside the profile are not applicable for completeness.
- `relationships` structured answer type with relation, dates and ownership state.
- Privacy guard for personal answers, proposals and evidence (`personal-privacy.ts`).
- Evidence and rights register with `brand:evidence list|add|verify|reject|withdraw|check`, publication requirements (`verified_evidence`, `rights_permission`) and `brand:retract`.
- Asset `subject` and `rights` fields in `schemas/asset.schema.json`.
- Documents: `personal-brand-book`, `professional-bio`, `linkedin-pack`, `website-pack`, `media-kit`, `speaker-kit`, `content-strategy`, `portfolio-pack`, `services-pack`, `evidence-register`.
- `draft_personal_content` (MCP and `brand:query`): approved facts for one deliverable, always a draft.
- Personal pages in the docs build (`Personal Brand`, `Approved Personal Book`) when the module is on.
- Tests: `personal-brand`, `personal-evidence`, `personal-documents` and journey D (157 tests in total).

### Changed

- `design`, `marketing` and `finance` agent profiles read only the person-facing personal modules (finance none). Career history, evidence and privacy boundaries are `internal-read` only.
- `factIsPublic`, MCP retrieval and the public claims list re-check evidence, rights and privacy at read time.
- `brand:migrate` adds the personal bank, profile, field-registry and knowledge-graph entries and config block when missing.
- `brand:init` and `brand:reset` clear the evidence register, so a new brand never inherits another brand's evidence.

## 0.2.0 — 2026-11-20

Theme: approved brand truth that agents can actually use. Scoped agent access, an agent-driven interview, batch approval and publication, cited documents and tokens from structured answers, finance and mascot retrieval, end-to-end journeys, and an internal review dashboard.

### Breaking changes

- `brand:approve --proof <secret>` (and any proof on argv) is refused. The proof comes from `BRAND_OS_APPROVAL_PROOF`, piped stdin, or a hidden prompt.
- Mascot catalog statuses `not_started` / `draft` / `in_review` fail validation until `npm run brand:migrate` converts them to the lifecycle enum.
- `brand:init --languages` defaults to `en`. Pass `--languages en,fa,tr` to enable the optional Persian and Turkish locales (previously all three were enabled by default).
- `mcp:serve` and `brand:query` exit on an unknown, revoked, or other-brand `BRAND_OS_AGENT_TOKEN` instead of running as guest.

### Final phase

- End-to-end journeys rebuilt in `tests/journeys.test.ts`: A (education app with mascot: English-first CLI init, a labelled localized Persian interview turn, a Turkish locale case, review, batch approval, mascot art, Brand Book and plans, tokens, publication, agent retrieval, guest isolation, change and regeneration), B (B2B without mascot: branching, documents, finance, retrieval, privacy, template upgrade) and C (unauthorized reads and approval, cross-brand tokens, draft and restricted leakage, token drift, invalid assets, stale proposals, interrupted migration, backup corruption, failed model output, prompt injection, missing credentials, invalid extraction). All use temporary brand copies and the mock provider.
- Internal review dashboard: `buildDashboard` in brand-core and a `/dashboard` docs page with coverage per module, the review queue and open contradictions (including intake conflicts). Only internal builds get data; the public build gets a stub, and the navbar links the page only in internal builds.
- Fix: backups now include `brand/migrations.yaml` and `brand/engine.lock`, so restoring a backup also undoes a half-written migration.
- Fix: documents show an approved restricted fact as approved and withheld, not as missing.
- English-first sweep: help text lists `en|fa|tr`, module guidance no longer names Persian first, and the spec's language requirement and sample question are English-first with fa/tr as labelled locale data.
- `docs-internal/archive/CLAUDE_FINAL_REVIEW.md`: what changed, what was not done and why, tests run, unverified areas, required credentials, remaining risks, and scores.
- README: English-first quickstart, change and approval workflow, agent access, languages and locales.

### Earlier phases

- `brand:doctor` checks Node, `BRAND_OS_DATA_KEY` (presence and length only), the approval secret file and its mode, config parsing, the publication policy brand id, and that `.env` is ignored. `--create-approval-secret` creates the secret without printing it.
- `.env.example` documents `BRAND_OS_DATA_KEY`.
- Fix: Persian answers longer than 12 characters are recorded for the current question. Only `note:` starts free-form capture.
- Fix: re-approving an approved fact is refused, and approval versions never reset to 1.
- Fix: fact, ledger, policy, private store, and draft writes are atomic (temp file, fsync, rename).
- Fix: restore validates every path before writing anything.
- `brand:query --include-unapproved` now says it is ignored.
- Audit: `docs-internal/archive/CLAUDE_INDEPENDENT_AUDIT.md`.
- Agent access: `brand:agent-token issue|list|revoke` (needs the owner proof from env or a hidden prompt). Tokens are hashed at rest, bound to one brand, and mapped to a read-only profile: `internal-read`, `design`, `marketing`, or `finance`.
- `mcp:serve` and `brand:query` resolve `BRAND_OS_AGENT_TOKEN` once at startup. They fail closed on an unknown, revoked, or other-brand token.
- New MCP tool `brand_retrieve`. The 17 existing tools now share its retrieval path. Results carry brand id, classification, approval state, revision, source path, and missing ids.
- Restricted values are never returned to agents. Agents only ever receive approved items.
- `brand/.private/access-log.jsonl` records who read which ids, never the values. The public scan rejects token files and raw tokens.
- Review queue: `brand:review --module <id> | --ids <…> [--json]` diffs each draft or pending change against the approved revision and lists impacted documents and questions. `--full` keeps the older recap.
- Batch approval: `brand:approve --module <id> | --ids <id,chg-…>` approves with one proof and reports every item. A wrong proof writes nothing. Stale and competing change proposals are refused, not guessed.
- `brand:publish --ids | --module [--unpublish]` publishes approved public facts only. Approval and publication stay separate. An approved replacement for a published fact is unpublished until published again.
- Breaking: `brand:approve --proof <secret>` is refused. The proof comes from `BRAND_OS_APPROVAL_PROOF`, piped stdin, or a hidden prompt.
- Questions may declare `approval_grant`. Validation fails if a restricted question uses anything but `financial`.
- Approval and publication logic moved from `engine.ts` to `approval.ts`.
- Agent-driven interview: `brand:interview --question <any id> --answer … --json` and `brand:next --json`. `brand:next` gives adaptive next questions with reasons, plus conflicts, follow-ups, tentative and unresolved answers, and owner-only restricted questions.
- `brand:propose --file` takes a zod-validated proposal batch. Each item has `question_id`, `value`, `state` (`proposed`/`tentative`/`unresolved`), `confidence`, a verbatim `quotation`, an optional `follow_up` and an optional `correction`. Proposals become drafts with provenance in `brand/interview/intake-log.yaml`. Unknown, restricted, and not-applicable ids are refused, as are invented quotations. A different existing draft becomes a conflict to ask about. A correction to an approved fact becomes a pending change proposal.
- Model provider adapter (`packages/brand-core/src/llm/`) has three providers. `none` is the default. `mock` is deterministic and local. `anthropic` calls the API over fetch and is active only with `llm.provider: anthropic` and `ANTHROPIC_API_KEY`. The adapter has a timeout, input and output limits, and a per-run request budget. Prompts fence owner text as data. Restricted-looking passages are withheld before any provider sees them. Output is schema-validated and goes through the same intake. `brand:interview --assist` falls back to deterministic rules when no provider is configured or the provider fails.
- `note:` capture no longer uses a hardcoded Persian keyword list. It uses locale cue data (en base; fa and tr equal) that also handles mixed-language answers. It keeps tentative and unresolved states, and never stores "unknown" as a value.
- `founder-core` interview profile (40 questions, no restricted ones). `brand.profile` narrows next-question selection. `brand:validate` checks profile files and warns about a profile with no file.
- New skill: `agent-skills/brand-interviewer/SKILL.md` (next → ask → propose → summarize → human approval).
- Structured answer types `color`, `font`, `logo_spec` and `voice_pairs`. Answers are validated and stored as one canonical string (`primary #123A73; surface #FFFFFF`). Persian/Arabic-Indic digits and Arabic-script separators are accepted; role names that become token ids must be ASCII. Founder-core now asks `brand.color.roles` (color), `brand.type.scale` (font), `brand.logo.min_size` (logo_spec) and the new `brand.verbal.voice_pairs`; `brand.type.fallback` and `brand.logo.clear_space` left the profile in their favour (still 40 ids).
- Yes/no words for boolean answers moved to i18n locale data (en base; fa and tr equal).
- `brand:tokens:generate [--dry-run] [--json]` turns approved structured answers into draft DTCG tokens in `brand/tokens/generated/`. Drafts from unapproved answers are never generated. An id already in `brand/tokens/approvals.yaml` is never overwritten; the run reports `refused_approved`. Contrast failures are reported.
- `brand:tokens:approve --ids` records the value hash of generated tokens (EXAMPLE base tokens are refused) and `brand:tokens:publish --ids [--unpublish]` adds hash-approved ids to `approved_token_ids`. Same proof rules as `brand:approve`. Generated tokens are retrievable by agents only after approval, and by guests only after publication.
- Brand Book, business plan summary and marketing plan on one section model (`packages/brand-core/src/documents/`). Each item is tagged `approved`, `assumption`, `recommendation` or `missing` with its source ids. Restricted values are withheld. Public editions carry only approved and published facts. `brand:document --type brand-book|business-plan|marketing-plan [--audience internal|public] [--json]`.
- Docs portal `/brand-book` page: color swatches, type specimens, logo spec and voice do/don't tables, rendered from the audience projection. UI strings are English with fa and tr in `apps/docs/i18n/`; styles use logical properties for RTL.
- Fix: `change <id>: unknown` (and `skip`, `n/a`) marks the disposition instead of storing the word as a draft value. On an approved fact it is refused.
- Finance library (`finance.ts`) and `brand:finance --input <file outside the repo | restricted:<name>>`: CAC, margin-adjusted LTV, LTV:CAC, churn and retention, MRR/ARR, gross profit and margin %, net burn, runway, break-even and scenario projections. Each result carries unit, period, basis (actual/forecast/hypothetical, the weakest of its inputs) and formula, or an explicit missing/invalid/undefined result. Inputs are validated; mixed periods are refused, not converted. Inputs inside tracked directories are refused; `brand/restricted/finance/` is gitignored.
- Mascot lifecycle: catalog `status` is now `defined | pending | created | reviewed | approved | published | deprecated`, on each row and on optional `artwork[]` variants (stage, angle, intensity, outfit, accessories, asset id, preview, animation refs, version, license). `brand:validate` checks the lifecycle against the asset manifest, stages and angles. Breaking: legacy `not_started`/`draft`/`in_review` fail validation until `brand:migrate` converts them (no artwork → `defined`; an `approved` row without artwork is reported and set to `defined`).
- Mascot finder: `brand_retrieve` `kind: mascot` with `filters` (`emotion`, `stage`, `use_case`, `angle`), also `brand:query --kind mascot --emotion … --stage … --use-case … --angle …`. Returns approved or published artwork only, with an explanation of what is missing otherwise. A disabled mascot module is `not_applicable`.

## 0.1.0

First template slice of Brand OS.

- Repository skeleton, Docusaurus portal (English, Persian RTL, Turkish), and local search.
- DTCG token sources with CSS and TypeScript export and contrast checks.
- Twenty brand modules, twelve Business OS modules, optional mascot catalog (90 states, 6 example stages, 8 angles, 15 motions), and optional gamification.
- Interview CLI: one question at a time, ledger, drafts, resume, approval, impact, and restricted-field handling.
- Schemas, validation, tests, and GitHub Actions.
- Agent instructions, ten skills, and a local read-only tool adapter.

Known limits are listed in `docs/IMPLEMENTATION_STATUS.md`. No approved brand facts are included.

## Unreleased — Brand Runtime: ten Instagram posts (first vertical slice)

- `npm run brand:runtime -- social-batch --demo --out <dir>`: a `social_batch` `task_context` pack for the SYNTHETIC DEMO brand (temp workspace) becomes ten deterministic SVG drafts, per-post manifests citing pack source ids and revisions, and a batch summary. Checks are calls into existing layers (SVG checker, publication gate, normalizer, Content Bridge claim guard, design-tokens contrast, Strategic Coach, Assurance). No model, no network, `authorizes: []`. Guide: `docs-internal/BRAND_RUNTIME.md`.
- Asset records: optional `model_use` (`not_allowed` | `local_only` | `external_allowed`); absent means `not_allowed`.

## Unreleased — Brand Runtime: `--pack`, approved type scale, Coach tagline exemption

- `brand:runtime social-batch --pack <file>` renders a real brand's `task_context` pack file, verified like the demo; `--root` (owner only, same brand, read-only) adds the Coach and the approved logo. Coach results are `warnings[]` and never block.
- Drafts use the approved `brand.type.scale` (family, fallbacks, sizes ×2, line heights; weights only from approved tokens). `--final --font-file` outlines text locally with the owner's TTF/OTF; drafts stay live text.
- Strategic Coach: `brand.verbal.tagline` and `brand.strategy.promise` are short by design and no longer `too_brief_for_output`.

## Unreleased — Coach area audit

- Strategic Coach: a scoped `consistency_review` no longer loses the field's own conflict when more than 20 conflicts are open; open ledger records and retired question ids are no longer counted as answered; `next` does not name a restricted last answer; fa/tr matching folds Arabic kaf/yeh and Turkish `İ`; the rendered criterion and the "does not apply" reason are localized. `COACH_RULE_VERSION` is now `coach-rules/2`, and Studio rebuilds a coach card cached under an older rule version.
- Docs: `STRATEGIC_COACH.md` status and test counts, the silence-reason list in `COACH_UX_DECISION.md`, and the snapshot claim in `IMPLEMENTATION_STATUS.md` now match the code.
- Merged with GAP-08 (Coach rules and facet rubrics). Both changes had moved `COACH_RULE_VERSION` to `coach-rules/2` independently; the combined rules are now `coach-rules/3`, so advice cached under either `/2` is rebuilt.

## Unreleased — GAP-09 follow-ups: paid-media interview question, company stays company

### Added

- Interview question `business.marketing.paid_media` (business marketing module, single choice `undecided` / `yes` / `no`, internal, en/fa/tr). It is in the question bank, field registry and marketing record.

### Changed

- `brand:assurance` reads `runs_paid_media` from the approved answer to `business.marketing.paid_media`. `--paid-media yes|no` is deprecated: it still works, but only while the question has no approved answer, and it prints an en/fa/tr notice on stderr. An approved answer always wins. A missing paid-media item now points at the question instead of the flag.
- `brand:assurance` no longer turns a company brand into a person when the personal module is on. `entity_kind: person` comes only from `brand.profile: personal-brand`. A founder's personal brand in a company repository is recorded separately as `snapshot.personal_brand` and does not change the subject or the digest. Bridge version `brand-os.assurance-bridge/2`.
- Tests: `assurance-followups` (paid-media question and source, deprecated alias, company stays company, person profile, en/fa/tr text), plus a deprecated-flag case in `assurance-cli`.

## Unreleased — Audit: Trust area fixes (Assurance / GAP-09)

### Fixed

- `brand:assurance-review record` refuses a judgment note that looks like a credential (the Knowledge credential check). The note is stored in plain text; nothing is written and the text is never echoed.
- `brand:assurance snapshot|assess --pin` refuses a snapshot kept for another brand or method (`invalid_pin`) instead of reporting its revisions as changed sources.
- `brand:assurance verify` explains, in en/fa/tr, a digest change with no changed cited source (an answer approved, a research note added, or a judgment recorded for that day).
- Persian text of the bridge and review commands uses «واقعیت» instead of the English word "fact", and the Persian comma «،» in lists.
- `docs-internal/ASSURANCE.md`: an owner `yes` replaces PRR-08's evidence minimum; a same-day judgment changes that day's snapshot; dates are UTC days. Tests: `assurance-audit`.
- After merging main (GAP-09 evidence links): `brand:assurance-link list` in Persian uses the Persian comma «،» and shows the register status (pending, verified, rejected, withdrawn) in en/fa/tr instead of the English token. `verify` with `--pin` keeps both the brand/method check and the evidence-link comparison.

## Unreleased — Audit: Runtime area fixes

### Fixed

- `task_context`: a `request` with no `locale` now builds the pack in the language the request was written in (a Persian request gets `fa`, RTL labels). The classifier detected it before, but the result was dropped. An explicit `locale` still wins.
- `brand:runtime social-batch`: a logo that is not embedded (changed, unpinned, withheld, owner-only, not SVG) is listed in every post manifest with `embedded: false` and its reason, instead of being silently absent.
- `writeBatch` refuses a dangling symlink and a linked parent directory that leads into a `brand/` folder (checked on the real path before and after the directory is created).
- Production readiness: an asset id the Visual DNA resolver would refuse no longer voids every asset verdict; that asset stays `not_tested`. `social-batch --root` resolves every approved pack asset (logos first), the same ids `readiness --root` resolves, so both report the same asset verdicts.
- `docs-internal/BRAND_RUNTIME.md` and `docs-internal/TASK_CONTEXT.md` match the code (writer rules, `social-batch` exit code, locale from the request, test counts).

## Unreleased — Audit: Visual V2 area fixes

### Fixed

- Brand Book reader (V2.4): an agent suggestion is labelled "Agent suggestion. Not approved and not an owner decision." instead of "Template guidance"; tentative and estimated drafts say so; a question the owner marked unknown, skipped, not applicable or deprecated says that instead of "Still to answer". en/fa/tr. Test: `studio-visual-book`.
- Docs: `IMPLEMENTATION_STATUS.md` rows for V2.1, V2.2, V2.3 and the print engine use the stable V2.4 paths; `STUDIO.md` lists `/visual/mascot[/print]` among the 301 legacy paths.

## Unreleased — Audit: Visual V2 stale states at view time

### Fixed

- Competitor comparison page (Studio): the shared landscape freezes each state on the day the owner ran `brand:competitive share`. The page now ages those states to the day it is built: a matrix cell or price shared as `observed`/`unverified` reads `historical`, and a positioning placement shared as `evidenced` reads `stale`, once its newest source is past the 90-day market-observation threshold (one day is given back, because only the day is shared). States only go down; conflicts, needs-review and unknown are unchanged; the shared file is not touched. Golden fixtures (no day given) draw as shared. Test: `visual-positioning` (aged at build time).

## Unreleased — Audit: fixes pack area (GAP-08 coach rules)

### Fixed

- `premium-vs-lowest-price`: a negated cheap price ("we are never cheap", «ارزان نیستیم», "ucuz değil") no longer raises a trade-off question. The cheap-price markers use the same negation guard as `sensitive-claim-wording`; Persian `نیست` and Turkish `değil` with personal endings count after the word.
- Coach registry rules no longer read a question the owner's config turned off (module disabled, skip condition). `consistency_review` said `needs_verification` for such a field while `quality_review` said `not_applicable`.
- `COACH_RULE_VERSION` is `coach-rules/4` (verdicts changed for the same input). Tests: `coach-rules`.

## Unreleased — Audit: fixes pack area (GAP-09 evidence links)

### Fixed

- `brand:assurance`: a research note linked to a verified evidence-register entry counts as `independent` only for a control that names the entry's claim question. A note tagged with two questions no longer makes the other question's control look independently evidenced; there it stays `owner_stated`. Test: `assurance-links`.

## Unreleased — Audit: Visual V1 area fixes

### Fixed

- `brand:export-visual`: an output folder reached through a link (the folder itself or a parent) into `brand/` or a `.private` folder is refused. The check runs on the real path, before and after the folder is created. A link left in place of an output file (HTML, PDF or a temporary galley/check file) is refused, not followed.
- `brand:export-visual` reads the working copy. When `brand/` has uncommitted changes, it says so, and the book imprint prints "plus changes in brand/ not yet committed" next to the source commit (en/fa/tr). It also says when the Chrome measuring pass fails and the estimates are used.
- `tests/studio-visual-browser.test.ts`: restored the V1.2 print-book checks on real Studio data (one PDF page per sheet, no text block overflow, contents numbers = printed folios, folios on the outer edge in en/fa). The merge of #40 had dropped them, but `docs/IMPLEMENTATION_STATUS.md` still listed them.
- `tests/studio-visual-qa.test.ts`: the digital PDF check now compares each contents entry's own page number with the PDF page that prints the section. Before, it only checked that the digit appeared somewhere on the contents page.
- `docs-internal/VISUAL.md`: the mascot print view no longer says the V1.2 engine is not on main. It records that the competitor and mascot print views still use the earlier `.vz-page--book` page, so those CSS rules are live.

## Unreleased — Studio: Persian mascot label ماسکات

### Changed

- Studio (fa): the mascot is spelled «ماسکات» everywhere in Studio (nav «دارایی‌ها و ماسکات», assets page, setup wizard, Publishing gallery «اطلس ماسکات»), matching the book and the atlas (owner decision 2026-11-24). Test: `studio-visual-mascot`.
- Not changed in this PR: `docs/screenshots/coach-ux/coach-overview-fa.png` still shows the old spelling (it could not be regenerated here; regenerate with `STUDIO_E2E_SCREENSHOTS=<dir>` on `tests/studio-coach.test.ts`). Brand-core Persian text outside Studio (question bank, Visual DNA labels) still uses «مسکات».

## Unreleased — Owner decisions: Visual V4 audit

### Changed

- Business Report: stays internal only (owner decision 2026-11-24). The code already matched: the projection builds no public edition, `--doc business-report --edition public` is refused, and `--edition` has no investor value. No behaviour change; the gallery offers no public or investor command for it (test).
- Investor profile: a published logo master that still carries a `draft` tag is now drawn without any mark, the same as public. An unpublished draft-tagged master and draft-tagged mascot artwork stay hidden in both profiles. Test: `visual-publishing`.
- Publishing gallery: the full Brand Book's public and internal cells show the real local export command (`npm run brand:export-visual -- --doc brand-book --edition public|internal`) as text, instead of "Print layout not built yet" (en/fa/tr; the command stays LTR in Persian). Studio never runs it. The investor cell is unchanged (no investor edition). New cell export kind `command`, core `publishingExportCommand`. Tests: `visual-publishing`, `studio-publishing`.

## Unreleased — Owner decision: undecided paid-media answer wins over --paid-media (2026-11-24)

### Changed

- `brand:assurance`: an approved `undecided` answer to `business.marketing.paid_media` now wins over the deprecated `--paid-media yes|no`. `subject.runs_paid_media` stays `unknown` (source `approved_fact`), the blocking item still points at the question, and the digest is the same with or without the flag. stderr says the flag was ignored and the interview answer is used (en/fa/tr). An approved `yes`/`no` already won; with no approved answer the flag still fills the gap. Bridge version `brand-os.assurance-bridge/4`. Tests: `assurance-followups`, `assurance-cli`.

## Unreleased — Audit: fixes pack minor findings (batched)

### Fixed

- `brand:coach` creator / speaker rubrics: a year-shaped count next to an audience word ("2000 subscribers", "followers: 1450", «۲۰۰۰ نفر», "2000 abone") is a count, not a year, so `facet_claim_undated` now fires when the number has no date. Test: `coach-rules`.
- `brand:coach` `sensitive-claim-wording`: `brand.mascot.forbidden`, `personal.media.avoid` and `personal.privacy.never_publish` list things to leave out, so a marker there is not a claim (like `brand.verbal.forbidden`). Test: `coach-rules`.
- `brand:coach consistency_review`: when registry findings are cut at the 20-finding cap, one slot is kept for a `potential_tension`, so a tension named in `rule_checks` is never missing from the findings. A review scoped to one question keeps the brand-wide rule checks (no question ids). Tests: `coach-rules`.
- `COACH_RULE_VERSION` is `coach-rules/5` (verdicts changed for the same input).
- `brand:assurance-link link --date <past day>` reports the link's state as of today, not as of the backdated day. Test: `assurance-links`.
- `brand:acceptance`: the restricted-value and secret leak check also finds a value in its JSON-escaped form (a value with `"`, `\` or a newline). Test: `acceptance-harness`.
