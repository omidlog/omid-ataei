# Implementation status

Updated for 0.2.0 (2026-11-20). “Fixed” or “Done” means a test or a build exercises the behavior. “Partial” means a real subset works and the gap is named. The final review with scores is `docs-internal/archive/CLAUDE_FINAL_REVIEW.md`.

## Audit findings

| ID | Status | Note |
| --- | --- | --- |
| P0-1 | Fixed | Restricted values are encrypted under gitignored `brand/.private`. Ledger and docs store an opaque id only. |
| P0-2 | Fixed | `materialize` creates missing files and does not overwrite existing catalogs, assets, or module pages. |
| P0-3 | Fixed | Approved, audience-visible facts are written to `published/claims` during docs prepare, with approver and source id. |
| P0-4 | Fixed | MCP uses `@modelcontextprotocol/sdk` stdio. A client test lists tools, calls them, and sends Persian text. |
| P1-1 | Partial | Free-form answers become quoted draft proposals (`note:`, `brand:propose`, `brand:interview --assist`) and are never approved. An Anthropic adapter exists but is off unless configured with a key, and its live behavior is not tested (tests use a mock and a stubbed fetch). A browser interview UI is not built. |
| P1-2 | Fixed | Token, mascot, component, social, and search tools read the brand files and approved records. |
| P1-3 | Fixed | `--actor owner` cannot approve. Approval requires the human proof in `brand/.private/approval-secret`. |
| P1-4 | Partial | `upgradeCore` / `brand:migrate` bump `brand/engine.lock`, migrate fact files and mascot statuses, and leave answers, approved facts, config and module prose byte-identical (Journey B). `npm run template:update` (see `docs/template-sync.md`) applies template core files to a brand repository on a new branch from a local template clone, using `.brand-os/sync.json` and the commit recorded in `brand/template-version.json`; brand files are never touched. Studio shows **Updates available** and opens (never merges) an update pull request on a new branch through the GitHub API (fake GitHub in tests; not yet run against real GitHub). A periodic Studio job checks every brand (check only by default; with `STUDIO_TEMPLATE_AUTO_PR=1` it keeps at most one open update pull request per brand). Versioned migrations (`.brand-os/migrations/`, ordered, core files only, `delete` only so far) run in both `template:update` and Studio's update pull request and are listed there. Brand repositories that do not use Studio can turn on the optional **Template update** GitHub Action (`.github/workflows/template-update.yml`, off until the `BRAND_OS_TEMPLATE_TOKEN` secret exists; keeps one update pull request open, never merges). `tests/template-sync-e2e.test.ts` runs create, template change, update pull request, merge and an empty second update against local git repositories and a fake GitHub. Template sync is complete in code and tests; none of it has run against real GitHub yet. |
| P1-5 | Fixed | `brand:init` writes the brand name and slug into `brand-manifest.json`. |
| P1-6 | Fixed | Stage validation checks unique ids and contiguous order. Six stages are only the example file. |
| P1-7 | Fixed | A disabled mascot omits module docs and emits an empty catalog JSON, so state ids are not in the data bundle. |
| P1-8 | Partial | Portal color, type, and radius read DTCG variables. Alias cycles are reported. Draft and approved tokens are separated in the tool, not by a second compiler pipeline. |
| P1-9 | Partial | `renderBusinessArtifacts` fills plan, marketing, PRD, roadmap, sales, support, finance, and OKR pages from the ledger and leaves unknowns unknown. They are not full models. |
| P1-10 | Fixed | Public builds copy only approved public assets inside `brand/assets`. The asset schema and path boundary are checked. |
| P1-11 | Fixed | A public prepare throws when `publish_docs` is private. The EXAMPLE template is public because it has no confidential facts. `brand:init` defaults to private. |
| P2-1 | Partial | English is the base language; fa (RTL) and tr are optional locales. Interview prompts, the Brand Book page and the dashboard page are translated. Module body copy is still English in the fa and tr builds. `docs-internal/LOCALIZATION.md` describes the approval path. |
| P2-2 | Fixed | Five more skills: strategist, logo, mascot animator, marketing creative, brand QA. |
| P2-3 | Partial | The docs site still has one token-backed button plus the component registry. There is no product component package or Figma node map. |
| P2-4 | Partial | The gallery can preview a published SVG. Unapproved files are not given download links. |
| P2-5 | Partial | Snapshot file is still local. There is no Figma API client. |
| P2-6 | Not fixed | `import existing:` records a URL and does not fetch it, to avoid turning the tool into an open web client. |
| P2-7 | Partial | Name, availability, and placeholder contradictions exist. There is no general schema rule language. |
| P2-8 | Fixed | Audit tests cover canaries, materialize, publishing, approval proof, upgrade, retrieval, alias cycles, MCP, and hidden mascot data. |
| P2-9 | Partial | Search reads approved facts and, when asked, draft markdown. There are no embeddings. |
| P2-10 | Partial | Reset backs up the ledger under `brand/.private/backups`. There is no multi-user lock service or retention policy beyond gitignore. |

## v0.2 (phases 1–7)

Findings and the invariant checklist are in `docs-internal/archive/CLAUDE_INDEPENDENT_AUDIT.md`.

| ID | Status | Note |
| --- | --- | --- |
| G1 | Fixed | Writes go through `fsutil.writeAtomic` (temp file, fsync, rename). Test: `tests/onboarding.test.ts`. |
| G2 | Fixed | Re-approval is refused. Versions are monotonic. Test: `tests/onboarding.test.ts`. |
| G7 | Fixed | Restore validates all paths before writing. Test: `tests/onboarding.test.ts`. |
| G8 | Fixed | `brand:doctor --create-approval-secret`. Test: `tests/doctor.test.ts`. |
| Persian routing | Fixed | Only `note:` starts capture. Test: `tests/onboarding.test.ts`. |
| G11 | Fixed | Owner-issued agent tokens (hashed, brand-bound, four read-only profiles) are resolved once at startup by `mcp:serve` and `brand:query`. Both use one retrieval path, `brandRetrieve`. There is an access log without values. Restricted values stay withheld from every agent. Test: `tests/agent-access.test.ts`. Design: `docs-internal/adr/0003-agent-access.md`. |
| G3 | Fixed | `brand:approve`, `brand:publish`, and `brand:agent-token` read the proof through one resolver: `BRAND_OS_APPROVAL_PROOF`, piped stdin, the macOS Keychain (opt-in via `brand:doctor --store-proof-keychain`, never under an agent token; tested with a fake, not against a real Keychain), or a hidden prompt. `--proof` on argv is refused without echoing it. Approve and publish also refuse to run while `BRAND_OS_AGENT_TOKEN` is set. Test: `tests/approval-batch.test.ts`. |
| G5 | Fixed | `brand:publish --ids|--module [--unpublish]` is wired to the approval service. Only approved public-classified facts with a value are published; the allowlist in `publication-policy.yaml` is written atomically. Approving a replacement for a published fact withdraws its publication until it is published again. Test: `tests/approval-batch.test.ts`. |
| G6 | Fixed | Optional `approval_grant` on questions is preferred over the id guess. Restricted questions always need `financial`, and `brand:validate` fails when a restricted question declares anything else. Test: `tests/approval-batch.test.ts`. |
| Batch review | Done | `brand:review --module|--ids [--json]` shows drafts and pending changes against the approved revision with impact. `brand:approve --module|--ids` approves with one proof and reports every item. Approval logic lives in `packages/brand-core/src/approval.ts`; the engine delegates to it. A change to an approved fact is a pending proposal and the approved revision stays canonical until that proposal is approved against its version. `brand:approve --all-pending [--exclude …]` approves every pending fact, change, evidence item and draft asset with one proof through the same approval, evidence-verify and asset-approve paths; `--dry-run` prints a `DRY RUN: N items would be approved. Nothing was changed.` plan. `brand:interview --change` files a change proposal without the interactive prompt, and `--origin agent_suggestion` records agent-suggested, owner-confirmed answers. Test: `tests/approve-all-pending.test.ts`. |
| Agent interview | Done | `brand:interview --question <any id> --json`, `brand:next --json`, and `brand:propose --file` (zod-validated batch, verbatim quotations, drafts only, restricted and unknown ids refused, conflicts recorded in `brand/interview/intake-log.yaml`). Skill: `agent-skills/brand-interviewer/SKILL.md`. Test: `tests/interview-ai.test.ts`. |
| LLM adapter | Done (mock-tested) | `packages/brand-core/src/llm/` has providers `none`, `mock` and `anthropic`. The adapter has a timeout, input and output limits, and a request budget. Owner text is fenced as data. Restricted-looking passages are withheld before any provider. Restricted data is never sent; `allow_restricted_to_provider` is rejected by validation. Output is schema-validated. `--assist` falls back to deterministic rules. No test calls the network. |
| Founder-core profile | Done | `brand/interview/profiles/founder-core.yaml` (40 ids, no restricted ones) is selected with `brand.profile`. Owner decision: review the list. |
| Deterministic extraction | Partial | Keyword cues per locale (en base; fa and tr) cover offer, audience, B2B, pricing, and tentative, undecided, and correction markers. Everything else needs a model or an agent. |
| Structured brand core | Done | Question types `color`, `font`, `logo_spec`, `voice_pairs` validated in `normalizeAnswer` (`packages/brand-core/src/structured.ts`) and the question schema. Founder-core uses them. Test: `tests/structured-answers.test.ts`. |
| Generated tokens | Done | `brand:tokens:generate` writes drafts from approved facts only and never overwrites an approved id. `brand:tokens:approve` / `brand:tokens:publish` gate retrieval by hash and publication. Test: `tests/brand-tokens.test.ts`. |
| Owner colour roles and semantic map (BOS-17) | Done (CLI, Studio notice) | Each approved role becomes `color.brand-role.<role>`; template ids come only from an approved `brand.color.semantic_map`; generation prints a suggested mapping it never applies; `brand:approve` prints the generate step; Studio Design System separates template examples. Not done: no Studio view of the suggestion itself (CLI only). Tests: `tests/token-semantic.test.ts`, `tests/studio-personal-drafts.test.ts`. |
| Composed personal drafts and personal documents in the gallery (BOS-19) | Done | Per-locale composed draft per section, deterministic templating from facts approved in that language, untranslated facts listed; Studio `?locale=` editions; nine/ten personal documents in the Publishing gallery and in Exports ready. Not done: language is read from the script, so an en/tr fact without Turkish letters reads as en; no per-fact language tag exists. Tests: `tests/personal-drafts.test.ts`, `tests/studio-personal-drafts.test.ts`. |
| Brand Book and plans | Done (3 documents) | Typed sections with approved / assumption / recommendation / missing tags and source ids for the Brand Book, business plan summary and marketing plan; `brand:document`; `/brand-book` docs page with swatches, specimens and voice pairs, English UI with fa/tr locale data. Public build carries no internal items. The other ~30 modules keep the generic compiled page. Test: `tests/brand-book.test.ts`. |
| Finance library | Done | `packages/brand-core/src/finance.ts`: gross profit, gross margin %, CAC, churn, retention, margin-adjusted LTV, LTV:CAC, MRR, ARR, net burn, runway, break-even and month-by-month scenario projection. Results are `ok` (unit, period, basis, formula, inputs used), `missing` (named inputs), `invalid` (validation or mixed periods) or `undefined` (zero churn, zero revenue, no burn). Basis is the weakest of the inputs. `brand:finance --input` reads files outside the repo or gitignored `restricted:<name>` files only and writes nothing. No live billing/CRM adapters yet. Test: `tests/finance.test.ts`. |
| Mascot lifecycle and finder | Done | `status` on catalog rows and artwork variants is `defined → pending → created → reviewed → approved → published` (+ `deprecated`). Optional stage, angle, intensity, outfit, accessories, use cases, animation refs, version and license fields. `brand:validate` enforces artwork, manifest asset, stage, angle and license rules; `brand:migrate` converts legacy statuses (no artwork → `defined`) keeping comments. `brandRetrieve` `kind: 'mascot'` filters by emotion, stage, use case and angle, returns only approved/published art with a readable asset, and explains what is missing; disabled module is `not_applicable`. The template ships 90 `defined` slots and no art. Gallery UI polish is deferred. Test: `tests/mascot.test.ts`. |
| Journeys A/B/C | Done | `tests/journeys.test.ts`, 7 tests in temporary brand copies with the mock provider. A: education app with mascot (English-first CLI init, labelled localized fa interview turn, tr locale case, review, batch approval, mascot art, documents, tokens, publication, agent retrieval, guest isolation, change and regeneration). B: B2B without mascot (branching, documents, finance, retrieval, privacy, upgrade). C: security and failure scenarios. |
| Internal dashboard | Done | `buildDashboard` (`packages/brand-core/src/dashboard.ts`) and `/dashboard` page: coverage per module, review queue, open contradictions and intake conflicts, restricted values withheld. Public builds get a stub with no brand data; the publish_docs check still refuses public builds of private brands. Test: `tests/dashboard.test.ts`. |
| Backup scope | Fixed | Backups include `brand/migrations.yaml` and `brand/engine.lock`. Test: `tests/remediation-regression.test.ts`. |
| Restricted facts in documents | Fixed | An approved restricted fact is tagged approved and withheld, not missing. Test: `tests/remediation-regression.test.ts`. |
| Language rule | Done | English base for CLI, docs, question text, examples and defaults; `brand:init --languages` defaults to `en`; fa and tr are locale data. Persian/RTL and Turkish input, extraction, storage and retrieval are tested (`tests/interview-ai.test.ts`, `tests/structured-answers.test.ts`, `tests/journeys.test.ts`). |
| G4, G9 | Documented limit | Single shared proof, readable by any process running as the owner. |

## Phase 8: Personal Brand OS

Branch `feat/phase-8-personal-brand-os`. Entry gate: `docs-internal/archive/POST_V02_PREFLIGHT.md`. Review, acceptance evidence and gaps: `docs-internal/archive/PHASE_8_PERSONAL_BRAND_REVIEW.md`. Guide: `docs-internal/PERSONAL_BRAND.md`.

| Item | Status | Note |
| --- | --- | --- |
| Personal module and facets | Done | `modules.personal { enabled, facets }`; absent means off, so v0.2 brands are unchanged. Facets `founder-executive`, `consultant-expert`, `creator-educator`, `artist-designer`, `speaker-author` combine through the condition engine. Test: `tests/personal-brand.test.ts`. |
| `personal-brand` profile | Done | Exclusive: company, SaaS and mascot questions are not applicable, not missing. `founder-core` still scores the whole bank. |
| Question bank | Done | 8 core and 5 facet modules, 71 questions, en/fa/tr prompts as locale data, generated and drift-checked like the other banks. Module guidance text is English. |
| Person vs organization | Done | `relationships` answer type with explicit relation, dates and ownership (default `unstated`). Canonical reference table validated by `brand:validate`. |
| Privacy guard | Done (heuristic) | Home address, personal phone, birth date, government id and family details refused on every personal write path and in the evidence register. Not a legal compliance certification. |
| Evidence and rights | Done | `brand/interview/evidence-register.yaml`; owner-only verification; owner testimony and owner-controlled sources (`owned`, explicit or inferred from the brand's own domains) never count as verified; a field with an independent and an owner part is `partly_verified`; re-verifying is a no-op; `publication_requires` enforced at publish time and again at read time (publication, MCP, public docs). Withdrawal unpublishes; `brand:retract` removes a claim. Portrait and case-study assets need granted public rights. Tests: `tests/personal-evidence.test.ts`, `tests/studio-personal-evidence-ownership.test.ts`. |
| Agent profiles | Done | Career history, evidence and privacy boundaries are `internal-read` only. |
| Deliverables | Done (CLI/JSON) | Ten documents on the shared model with verification labels and bio length reports. No designed portal page for them yet. Test: `tests/personal-documents.test.ts`. |
| Draft operation | Done | `draft_personal_content` MCP tool and `brand:query` handler; always `draft`, no authority. |
| Migration | Done | `brand:migrate` adds the bank, profile, registry entries and config block additively and idempotently. |
| End-to-end | Done | Journey D in `tests/journeys.test.ts`: founder+consultant brand through the real CLI, evidence, publication, documents, docs builds, retrieval, withdrawal, backup, restore, migrate. |
| Studio (Phase 9) | See below | Studio shows personal brands read-only and does not edit them. |

## Phase 9: Read-only Brand OS Studio

Branch `feat/phase-9-read-only-studio`, stacked on Phase 8. Guide, architecture and security model: `docs-internal/STUDIO.md`. Phase 8 Personal Brand OS remains supported; Studio displays it and does not edit it.

| Item | Status | Note |
| --- | --- | --- |
| Product contract | Done | One Studio, routes `/brands/<slug>`. Viewer plus repository provisioner. No chat, AI, interview UI, edit or approval controls, uploads, Git actions, token issuance or terminal. The complete non-GET route list is pinned by a test. |
| Owner authentication | Done | scrypt password, TOTP (required beyond loopback), login nonce, rate limits, server-side sessions with HttpOnly SameSite=Strict cookies, CSRF and Origin on every authenticated POST, strict CSP and security headers. One owner account; sessions are in memory. |
| Repository provisioning | Done | The single write: private repository from the template, core `applyInit` on a temporary checkout, one fast-forward commit, privacy verification, duplicate and concurrency refusal, retries, partial-create cleanup or a recorded cleanup-required state, resume after restart. A failed attempt offers Retry, Edit and retry (prefilled wizard) and Discard (Studio registry only, never GitHub); the wizard checks the repository name is free before creating and suggests `<slug>-brand`, `-2` …. Separate provisioning credential scoped to allowlisted destinations and the configured template. |
| Read path | Done | Merged default branch only, safe tar extraction of `brand/` without `.private` or `restricted`, projection from the brand-core functions, credential guard, cached SHA and times, stale and failed states that keep the last good commit, slug and repository-id checks against cross-brand content. |
| Refresh | Done | Manual refresh, refresh on view after the TTL, signed push webhook with replay protection. |
| Screens | Done | My brands, New brand wizard, provisioning status, Overview, Brand Book, Design System, Assets & Mascot, Business OS, Personal Brand (only when enabled), History & Review (open PRs labelled non-canonical), GitHub & Claude Code handoff, Account & GitHub. |
| Design and accessibility | Done | `studio.*` design variables, light and dark, responsive (1440/1024/390 px checked in a browser), skip link, focus ring, keyboard drawer, labelled fields, status as text plus icon. |
| Localization | Done | en, fa (RTL, layout mirroring verified in a browser) and tr catalogs with identical keys and placeholders. Brand content inside documents stays in the language the repository holds. |
| Server CLI | Done | `npm run studio:hash-password`, `npm run studio -- totp-secret\|session-secret\|brands\|register\|unregister`. Registering an existing repository is server-side only. Phase 10 prep added `bootstrap-owner` and `check-config` and process-level CLI tests (`tests/studio-cli.test.ts`, `tests/studio-deploy.test.ts`). |
| Tests | Done | 48 Studio tests in five files with an in-memory GitHub (no network, no real repositories). All Studio tests are named `tests/studio-*.test.ts` and form the Studio suite (`npm run test:studio`, part of `npm run test:full` and `npm run ci`); `npm test` is the brand suite only. `tests/studio-browser.test.ts` drives headless Chrome when it is installed and skips otherwise; `npm run test:e2e` requires it. Phase 10 prep added `tests/studio-hardening`, `studio-cli`, `studio-deploy` and `studio-browser-production`. CI runs the Studio suite only in the template repository (its own `studio` job); brand repositories never run it. |
| VPS deployment | Package ready (Phase 10 prep) | See "Phase 10 prep" below. Nothing is deployed. |
| Live GitHub | Not verified | All GitHub behavior is tested against a fake at the HTTP level. A first real run against GitHub (token permissions, template generation timing) is still owed. |

## Phase 10 prep: VPS deployment package

Branch `feat/phase-10-prep`, stacked on Phase 9. Docs: `docs-internal/phase-10/`. **Nothing is deployed.** No VPS, DNS, Caddy or GitHub change was made, and no real repository was created. The live launch is the operator's (`docs-internal/phase-10/GROK_HANDOFF.md`).

| Item | Status | Note |
| --- | --- | --- |
| Auth hardening behind a proxy | Done | Rightmost `X-Forwarded-For` hop, Host allowlist (`421`), health readiness (`503` on an unwritable data dir), keep-alive above the proxy's. Test: `tests/studio-hardening.test.ts`. |
| Registry with CLI next to the server | Fixed | A live server now sees `studio register`/`unregister` at once and never overwrites them. Test: `tests/studio-hardening.test.ts`. |
| Owner bootstrap | Done | `studio bootstrap-owner` (0600 env file, TOTP verified on a terminal) and `studio check-config`. Test: `tests/studio-cli.test.ts` (runs the real CLI). |
| Production bundle | Done | `npm run studio:build` (esbuild, pinned). The build refuses `brand/`, docs and `.env` inputs. |
| Image and Compose | Done, not built here | Digest-pinned base, non-root, read-only root, `cap_drop: ALL`, 512 MiB, health check, `restart: unless-stopped`, `./data` volume, published only on `172.18.0.1:8083`. Static checks in `tests/studio-deploy.test.ts`. The image build and container run are in `.github/workflows/studio-image.yml`, which has not run here (no Docker in this environment). |
| Caddy site block | Done | `infra/production/Caddyfile.studio`. Validated with a real Caddy 2.11.2 without warnings, and the bundle served behind it passes the smoke test. |
| Smoke test, backup, restore | Done | `infra/production/*.sh`. The smoke test is proven to fail on a leaky server. The restore refuses traversal, links, a bad checksum and a non-empty target. |
| Browser tests (production shape) | Done | `tests/studio-browser-production.test.ts`: HTTPS through a TLS proxy, `__Host-` cookies, CSRF from same-site and cross-site origins, CORS and framing, foreign Host. |
| Docs and handoff | Done | Architecture, deployment contract, operations, deploy runbook, Grok handoff, Claude editing workflow, security review. |
| Live GitHub | Not verified | The template is private. Token type and scopes for template generation are an open owner decision and must be confirmed live with an owner-authorized test repository. |
| Live VPS | Not started | Operator step after review. |

## Knowledge Inbox (Baalda-inspired)

Branch `feat/knowledge-inbox`. Guide: `docs-internal/KNOWLEDGE.md`. Review: `docs-internal/KNOWLEDGE_LAYER_IMPLEMENTATION_REVIEW.md`.

| Item | Status | Note |
| --- | --- | --- |
| A0 Studio filter | Done | `brand/knowledge/**` blocked except `brand/knowledge/shared/*.md`, checked first. |
| A1 Notes and storage | Done | Local by default in `brand/.private/knowledge`, encrypted restricted notes, stable ids, reader-computed revisions, archive/restore, snapshots, backup coverage. Works with no `brand/knowledge`. |
| A2 Search and links | Done | fa/tr/en normalization, deterministic ranking, filters, pagination, typed links, backlinks, related, duplicate suggestions. In-process index; no FTS or embeddings. |
| A3 Safe edits | Done | Required revision, unique anchors, per-note O_EXCL lock, idempotent append; concurrency tested with six processes. |
| Share to Git | Done | Dry-run preview, fail-closed visibility (origin + GitHub CLI, or owner confirmation naming origin), credential/personal/restricted refusal. Not publication. |
| B1 Proposal bridge | Done | Existing intake reused; preview by default; revision-checked apply; third-party notes preview-only; 50,000-character limit; ledger-quote leak shown. Gate B tested end to end. |
| B2 Agent access | Done | CLI and skill for Claude Code; `knowledge-read` profile and five read-only MCP tools over shared notes. No MCP writes. |
| C1 Studio Knowledge page | Done | GET-only section for merged shared notes; core projection withholds unsafe files by reason; en/fa/tr; filters, search, detail, backlinks, linked questions. No new non-GET route. HTTP tests with an in-memory GitHub. |
| C2 Studio browser checks | Done | Real headless Chrome: no overflow at three widths in English and Persian, accessible names, AA contrast, no remote fetch of note images. Not yet checked against a deployed Studio or live GitHub. |
| Performance | Baseline | 1,000 and 10,000 synthetic notes measured (`docs-internal/KNOWLEDGE.md`). No gate. |

## Creative Learning MVP (Sprint 1)

Branch `feat/creative-learning`, built on the Knowledge Inbox (PR #9). Guide: `docs-internal/CREATIVE_LEARNING.md`. Reuse map: `docs-internal/CREATIVE_LEARNING_REUSE_MAP.md`.

| Item | Status | Note |
| --- | --- | --- |
| Projects, variants, selection | Done | Local records under `brand/.private/creative`; assets are manifest ids or `missing`; selection means owner choice for one project only. |
| Feedback as Knowledge notes | Done | Verbatim text stored once, as a local Knowledge note; records hold `kn_…` + revision and closed-vocabulary aspects. |
| Scoped preferences | Done | Draft → owner approval with the existing proof; project or series scope; brand scope refused (routed to `propose`/`approve`); supersession keeps history. |
| Next-session context | Done | Approved facts (design reader), applied preferences, cited selected/rejected/kept references from in-scope projects, provenance and source state. |
| Agent / MCP access | Done (Sprint 2) | `creative-read` profile, read-only `creative_context` on local stdio MCP; approved items only, local note text withheld, access-logged. `tests/creative-agent.test.ts`. |
| Aspect proposals | Done (Sprint 2) | Deterministic fa/en/tr lexicon; pending until owner approval with proof; `aspects approve/reject`. `tests/creative-aspects.test.ts`. |
| Studio view | Done (Sprint 2) | Read-only Creative decisions page for decisions shared with `brand:creative share` and merged. `tests/creative-share.test.ts`, `tests/studio-creative.test.ts`. |
| Remote MCP / CMO agent / campaign metrics | Not started | Backlog; local stdio only. |
| Performance data | Not started | `performance: not_measured`; no connectors. |

## SEO strategist (Spec Sprint 2)

Branch `feat/seo-strategist`. Guide and reuse map: `docs-internal/SEO_STRATEGIST.md`. Skill: `agent-skills/seo-strategist/`.

| Item | Status | Note |
| --- | --- | --- |
| Research adapter contract | Done | `none` / `live` (opt-in, quote-verified HTTPS) / `replay`; typed failures; per-topic staleness; computed trust; official-host check. Raw research is stored only as Knowledge research notes. |
| Conditional interview | Done | 18 closed-vocabulary questions (en/fa/tr) with skip reasons; unknown kept; no budget; owner words as Knowledge notes. |
| Strategist and plan | Done | Archetypes, alternatives, cited and dated decisions, owner decisions, evidence-gap checklist, sources table. Draft only. |
| Researched and offline cases | Done | 8 official pages recorded live 2026-11-22 (replayed in tests); offline gives `research_unavailable`, provisional, no quotes. |
| Independent critic | Done | `seo-critic/1`: uncited policy, invented metrics, latest-claims, guarantees, misquotes, edited or stale citations, site work for app-only brands. |
| Evals (spec §6 a–l) | Done | `evals/cases.yaml`, 15 cases, run by `tests/seo-evals.test.ts`. |
| Approval, agent feed | Done (Sprint 3) | See "Strategy records and Strategy Feed" below. |
| Studio strategy views | Not started | Backlog. |
| Other specialists, CMO, metrics learning | Not started | Out of scope. |

## Strategy records and Strategy Feed (Spec Sprint 3)

Branch `feat/strategy-feed`. Guide, reuse map and gate: `docs-internal/STRATEGY_FEED.md`.

| Item | Status | Note |
| --- | --- | --- |
| Typed StrategyRecord / StrategyRevision | Done | Immutable revisions with a canonical `content_sha256`; approved facts pinned to `revision_hash`; research as `knowledge:kn_…@sha256`; restricted block owner-only. `tests/strategy-store.test.ts`. |
| Human review and approval | Done | Field diff against the superseded revision, source states, blockers; owner proof plus `--expect-sha`; HMAC-sealed approval; reject; withdraw (no silent restore); supersession. `tests/strategy-cli.test.ts`. |
| Dates and source changes | Done | `not_yet_valid`, `review_due`, `expired`, `needs_review`, `integrity_failed` computed on read. |
| SEO draft import | Done | `propose --from-seo` re-runs the Sprint 2 critic; citations kept, quotes not copied. `tests/strategy-seo-import.test.ts`. |
| Read-only Strategy Feed | Done | `strategy-seo-read` / `strategy-ads-read`; `strategy_list`, `strategy_get` in stdio MCP and `brand:query`; digests, redaction, missing fields, `stale_pin`; access-logged. `tests/strategy-feed.test.ts`. |
| CMO agent, Strategy Critic, metrics learning, ad execution, remote gateway, Studio views | Not started | Out of scope. |

## Identity intake (Identity Slice A)

Branch `feat/identity-slice-a`. Guide and reuse map: `docs-internal/IDENTITY_INTAKE.md`.

| Item | Status | Note |
| --- | --- | --- |
| Core intake type, validation, reader | Done | `identity-intake.ts`; contradictions refused; missing or invalid reads as unknown / undecided. `tests/identity-intake.test.ts`. |
| `brand:init` flags | Done | `--logo-presence`, `--identity-intent`, `--change-depth`; without them init is unchanged. |
| Studio wizard questions (en/fa/tr) | Done | Profile step; conditional depth; review and Edit and retry mirror the answers; server clears a stale depth. `tests/studio-identity-intake.test.ts`, browser journey. |
| Privacy | Done | Not in facts, ledger, publication policy, MCP, `brand:query`, dashboard, public projection or Studio brand pages. |
| Competitor research (Slice B) | Done | See the next section. |
| Cross-functional context (Slice C), rebrand audit and logo brief (Slice D) | Done | Separate PRs; see the Slice C and Slice D sections below. |

## Competitive landscape (Identity Slice B)

Branch `feat/identity-slice-b`. Guide and reuse map: `docs-internal/COMPETITIVE.md`.

| Item | Status | Note |
| --- | --- | --- |
| Candidate index (`cmp_<uuid>`) | Done | `brand/.private/competitive`, owner-only; relationship and geography separate; same-name candidates kept apart only with a reason and disjoint markets; never merged. `tests/competitive.test.ts`. |
| Evidence refs on Knowledge research notes | Done | `{note_id, revision, claim_key, observed_at}`; no quote stored; changed, stale, superseded and archived notes degrade to `needs_review` / `historical`. |
| Public price observations | Done | Quote must show amount, currency and every stated term; promotions cannot pass as standard; listed, never ranked or converted. |
| Domain verification | Done | Only by a current source fetched from the domain; re-checked on read. |
| Landscape, matrix and gap checklist (en/fa/tr) | Done | Deterministic; honest `candidate_only` output when research is unavailable; prohibited inferences listed; `authorizes: []`. |
| `npm run brand:competitive` | Done | scope, add, classify, link, verify-domain, status, list, show, matrix. No network. `tests/competitive-cli.test.ts`. |
| Interview question for comparison candidates, Studio view, agent access | Not started | Later slices, only if the owner asks. `CompetitiveContext` and its consumers: see Slice C below. |

## Cross-functional competitive drafts (Identity Slice C)

Branch `feat/identity-slice-c`. Guide: `docs-internal/COMPETITIVE.md` (section "Using the landscape").

| Item | Status | Note |
| --- | --- | --- |
| `getCompetitiveContext(ws, purpose, {market, lang})` | Done | Pure projection of the landscape filtered by purpose dimensions and one market; `missing` / `candidate_only` / `evidence_insufficient` / `evidence_available`; source digest; per-purpose prohibited inferences; `authorizes: []`. `tests/competitive-context.test.ts`. |
| Marketing opportunity memo | Done | Cited observations, unresolved evidence, at least two hypothesis alternatives, what is not known (spend, conversion, ROAS/CPA, revenue, targeting, effectiveness), edits only via propose → review → approve. |
| Pricing benchmark memo | Done | Advertised prices with rate labels (`promotional`, `monthly_rate_billed_annually`…), status (`historical`, `needs_review`, `conflicting`), never ranked or converted; options are hypotheses with no number; `priced_recommendation: false`. |
| SEO cited supplement | Done | Maps `seo.competitors.named` to competitor ids as owner assumptions; rankings and keyword gaps `unverified`; SEO drafts and schema untouched. |
| Visual landscape assessment | Done | Visual comparison `unavailable` without cited visuals; similarity `not_assessed`; retain / evolve / rebrand / create routes guided by the unapproved intake hint. |
| `brand:competitive context | memo | import-seo-names` | Done | en/fa/tr text; prints only; the SEO bridge runs only on command and never merges. `tests/competitive-cli.test.ts`. |
| Fact mutation | None | `business.sales.pricing`, `business.marketing.*`, the SEO interview and SEO drafts are asserted unchanged. |
| Rebrand audit and logo brief | Done | Slice D, below. |

## Identity audit and logo brief (Identity Slice D)

Branch `feat/identity-slice-d`. Guide: `docs-internal/IDENTITY_BRIEF.md`. Skill: `agent-skills/logo-identity-strategist`.

| Item | Status | Note |
| --- | --- | --- |
| Identity audit record | Done | `brand/.private/identity/audit.json`, owner-only, refused under an agent token; closed answers and equity choices with history; owner words and studies are Knowledge notes cited by id and revision. `tests/identity-brief.test.ts`. |
| Diagnosis questions (en/fa/tr) | Done | Path, change reasons, observed vs preference, success, must-not-change, recognition evidence, uses, scripts, rollout; path-dependent skipping; `unknown` allowed. Typed record, not the shared interview bank. |
| Equity preservation matrix | Done | preserve / refine / replace / evaluate / unknown per element; `measured_study` refused without a cited study note; must-not-change conflicts flagged. |
| Logo brief (`buildIdentityBrief`, `renderBrief`) | Done | New, retain, evolve and rebrand paths; 2–3 routes with why / why not / risks / red lines / rubric; visual landscape only from the Slice C identity projection; uses and production checks without invented sizes; decision record; `authorizes: []`. |
| Creative Learning reuse | Done | `logo` surface; brief lists variants, owner reasons by ref and selection (`approved_mark: false`). |
| `npm run brand:identity` | Done | next, answer, equity, link-creative, brief, reviewed. `tests/identity-cli.test.ts`. |
| Fact, logo or asset mutation | None | Tracked brand files and facts asserted unchanged in every journey. |
| Logo drawing, trademark clearance, Figma, Studio view, agent access | Not started | Out of scope for the brief. |

## Content strategy and voice rules (Content Bridge Slice A)

Branch `feat/content-bridge-slice-a`. Guide and reuse map: `docs-internal/CONTENT_BRIDGE.md`.

| Item | Status | Note |
| --- | --- | --- |
| `content` strategy type and `content_strategy` block | Done | Same store, immutable revisions, hash-bound owner approval and `needs_review` as Sprint 3 strategies. Other types carry no new key, so their hashes are unchanged. `tests/content-strategy.test.ts`. |
| Proposer from approved facts (`buildContentStrategy`) | Done | Voice, audience, messaging, claims, offers and CTA cited by fact id, never copied. Missing, placeholder and owner-decision items are explicit gaps (en/fa/tr). Restricted facts refused. Pins the SEO / paid-media strategies served now. |
| Voice rules projection (`contentStrategyView`) | Done | Owner-only; resolves the approved facts at the cited revisions; drafts only counted; `authorizes: []`. |
| `npm run brand:content` | Done | `strategy` (`--out`, `--store`, `--channels`, `--cadence`, `--formats`, `--languages`), `show`. Approval stays `brand:strategy review / approve`. `tests/content-cli.test.ts`. |
| Agent read access | Done (Slice C) | The `content-read` profile reads approved `content` strategies through the Strategy Feed. |

## Content calendar (Content Bridge Slice B)

Branch `feat/content-bridge-slice-b`. Guide: `docs-internal/CONTENT_BRIDGE.md`.

| Item | Status | Note |
| --- | --- | --- |
| Calendar week records | Done | Immutable hashed revisions under `brand/.private/content/calendar/`; pin the served content strategy revision and every cited fact. |
| Planner (`brand:content plan`) | Done | Deterministic, offline; cadence respected (`null` cadence gives a gap, no slots); every slot cites an approved fact; optional `--research` angles with confidence. `tests/content-calendar.test.ts`. |
| Banned-claim and availability check | Done | On propose and approve, en/fa/tr. |
| Per-week owner approval | Done | `week review / approve / reject`, owner proof, `--expect-sha`, HMAC seal with its own domain; `needs_review` on strategy or fact change. `tests/content-calendar-cli.test.ts`. |
| Studio "Content calendar" page | Done | Read only; only weeks shared with `brand:content share` and merged. `tests/studio-calendar.test.ts`. |
| `produced` / `published` status, agent tools | Done (Slice C) | See below. |

## Content agent tools (Content Bridge Slice C)

Branch `feat/content-bridge-slice-c`. Guide: `docs-internal/CONTENT_BRIDGE.md`.

| Item | Status | Note |
| --- | --- | --- |
| `content-read` token profile | Done | Facts as `marketing`; the Strategy Feed gate (`strategyAccess`) maps it to the `content` agent kind, so `strategy_list` / `strategy_get` serve approved content strategies. Everyone else is denied. |
| `content_calendar` (MCP, `brand:query`) | Done | Approved weeks whose status is `current` only; stable JSON with revision, content and approval digests and a self digest; drafts and `needs_review` weeks counted only; latest report per slot. `tests/content-agent.test.ts`. |
| `content_brief` (MCP, `brand:query`) | Done | One slot: voice, claims, audience, resolved key message / offer / CTA, channel plan, cited competitive angle, approved creative preference ids, `must_include` / `must_avoid`, `missing`. Stale pin refused; restricted facts redacted. |
| `content_report` (MCP only) | Done | `produced` / `published` + https URL stored as an observation in `brand/.private/content/observations/`; pins the week revision; changes no week, strategy or fact; never fetches the URL; no publish permission. |
| `brand:content reports` | Done | Owner view of reports, en/fa/tr, `--json`; marks reports made against an older week revision. |
| Access log | Done | One line per call, ids only (never URLs or text). |
| Result metrics, Studio view of reports | Not started | Out of scope for Slice C. |

## Content planner skill and agent integration guide (Content Bridge Slice D)

Branch `feat/content-bridge-slice-d`. Guides: `docs-internal/CONTENT_BRIDGE.md`, `docs-internal/CONTENT_AGENT_INTEGRATION.md`.

| Item | Status | Note |
| --- | --- | --- |
| `agent-skills/content-planner/SKILL.md` | Done | Owner flow (propose / review; the owner approves with proof) and the content agent loop with pins; stop on `stale_pin` / `not_found`. |
| Integration guide for an external content bot | Done | stdio MCP (`mcp:serve` + `BRAND_OS_AGENT_TOKEN`) or `brand:query`; token issue and revocation (effective on server restart); `content-feed/v1`, `content-brief/v1`, `content-report/v1`; digest verification; permission flags; en/fa/tr notes. |
| CLI journey demo (real output) | Done | Owner journey, mock agent via `brand:query`, report over MCP, `reports`, revoke. `tests/content-journey.test.ts` runs it and checks the documents name only real commands, tools and schemas. |
| Hosted API, per-channel tokens, Studio view of reports | Not started | Not in the brief. |

## Assurance registry and assessable controls (Trust v2 PR-A)

Branch `feat/trust-v2-pr-a`. Guide: `docs-internal/ASSURANCE.md`. A pure library; no command, route, store, approval or agent scope.

| Item | Status | Note |
| --- | --- | --- |
| Claim ladder and methodology registry | Done | Six levels that only go down; unverified editions and unchecked sources are at most `informed_by`; attestations by kind (review, certificate). One assessable method (our own); ISO entries are named only. `assurance/bridge.ts` checks the visual layer's `PermittedClaim` against the registry without changing it. |
| Assessable controls (Positioning Readiness v1) | Done | 15 typed controls over existing question ids; applicability first, `unknown` never read as `no`; privacy classification at least the question's sensitivity. |
| Deterministic evaluator | Done | Ten statuses; `not_scoreable` unless the denominator is real; changed source forces `needs_review`; restricted inputs withheld; per-domain maturity, no aggregate; byte-identical output for the same inputs. |
| en/fa/tr text and gap report | Done | Every emitted code has text in three languages; `renderGapReport` prints no ratio when not scoreable. Synthetic fixtures only. |
| Coverage matrix in docs | Done | `docs-internal/ASSURANCE.md`, checked against the code by `tests/assurance-i18n.test.ts`. |
| Assessing a real brand, evidence lineage, Studio view, reports, decisions | Partly done | Owner-local real-brand bridge: see GAP-09 below. Evidence lineage, Studio view, reports, decisions not started. |

## Task Context Engine (Slice 1: core and CLI)

Branch `feat/task-context-p0`. Preflight audit, permission and field-coverage matrices, and the guide:
`docs-internal/TASK_CONTEXT.md`. Contract: `schemas/task-context.schema.json` (`brand-os/task-context/v1`).

| Item | Status | Note |
| --- | --- | --- |
| Preflight audit | Done | Reuse matrix (which existing reader owns each piece of context), permission matrix per agent profile and source, field coverage per pack key, two findings and the PR #25 overlap. No new store, no new profile. |
| Pack contract | Done | `brand-os/task-context/v1` in draft-07, validated with Ajv in `tests/task-context.test.ts`. `$id` is an identifier; there is no hosted API. |
| Task classifier | Done (deterministic) | `classifyTask`: en/fa/tr keywords, Persian/Arabic digits, channel words. Strong cues are task nouns; weak verbs decide nothing. Zero cues or a tie returns `need_task_type`. CLI only, no model, and the request text is never stored, logged or copied into the pack. |
| Selectors and renderer | Done | Seven task recipes select a bounded key set over `brandRetrieve` (facts, hash-approved tokens, approved assets by role, approved mascot artwork), the Strategy Feed and `creative_context`. One caller context for every reader; nothing is merged across principals. |
| Gaps, readiness, staleness | Done | Gaps carry an existing FieldQuestion id; an approved "TBD" is a gap, not a source. `blocked` only when no readable identity exists (or the module is off), `ready` when every requirement for the task is met, `partial` otherwise. `staleness` is `needs_review` when a served strategy is review-due. |
| Digest | Done | `digests.context_sha256` over the canonical JSON of the pack without its digest; `verifyPack` recomputes it. Same sources, same digest. |
| `brand:query --tool task_context` | Done | `--task-type`, `--request`, `--channel`, `--count`, `--locale`, `--mode`, `--output-format`, `--scope-id`. Needs an owner-issued token of this brand; guests, unprofiled agents and the owner process are denied. |
| Writes | None | Reading a pack creates no file. `tests/task-context.test.ts` compares the whole `brand/` tree before and after. |
| Legacy `get_logo_rules` / `get_motion_guidelines` ids (BUG-01) | Fixed | Audit finding 1. Every named fact tool reads `NAMED_FACT_TOOL_IDS` (`query.ts`); logo and motion use the `logo_rules` / `motion_rules` ids. Same envelope, more ids listed. `tests/named-tool-ids.test.ts` pins each id against the question bank and field registry. |
| MCP tool, skill handoff (GAP-02) | Done | `task_context` stdio MCP tool over the shared `runTaskContextTool` (same core and caller context as the CLI, access checked before classification, request text never logged or returned). Skill `agent-skills/task-context/SKILL.md`; social, UI, marketing and brand designer skills call it first. New-session setup in `docs-internal/AI_CONNECTORS.md`. `tests/task-context-agent.test.ts`. |
| Calendar slots in the pack | Not started | Next slice: `scope_id` for an approved week, pinned `content_calendar` / `content_brief`, and `stale_pin`. Today a ten-post request is an on-demand draft brief, which is the required behaviour anyway. |
| `task_context_validate`, Studio view | Not started | P2 and P4 of the plan. Studio stays read-only and untouched here. |

## Strategic Coach & Answer Assurance (Coach PR 1)

Branch `feat/coach-pr-1`. Guide: `docs-internal/STRATEGIC_COACH.md`. Contract: `schemas/coach-result.schema.json`.

| Item | Status | Note |
| --- | --- | --- |
| Data contract and output validation | Done | `CoachResult` with `schema_version`, `brand_id`, `mode`, `question_id`, `answer_ref` (ledger revision + digest), `analysis_scope` (profile, question ids, context digest), `locale`, `status`, `findings`, `generated_at`, `engine_version`, `rule_version`, `authority: derived_advice`, `authorizes: []` and `source_refs` as ids only. Validated with Zod before it is returned; `schemas/coach-result.schema.json` documents the same record and a test checks real results against both. `tests/coach-core.test.ts`. |
| Read-only by construction | Done | The coach takes a `CoachSource` view of `InterviewEngine` that has no write method, reads contradictions from the pure `findContradictions` rather than the derived file, stores nothing and caches nothing. The tests that analyse a recorded brand snapshot it and assert it is byte-for-byte unchanged. |
| Eligibility and disposition guard | Done | A question the config or earlier answers turned off is `not_applicable`, not missing. `unknown`, `skip`, `not relevant` short-circuit to `not_applicable` with no deficits; `decide later` on a target counts as a decline. |
| `quality_review` | Done | Six criteria (relevance, specificity, completeness for the documents it feeds, measurability, evidence support, clarity and internal coherence), explainable statuses (`ready`, `needs_clarification`, `evidence_missing`, `needs_review`, `not_applicable`, `insufficient_context`), at most two deficits, one concrete next step, no score. `measurability` applies only to questions that ask for a measure, so a qualitative brand answer is never penalised for having no numbers. An approved answer with a deficit sets `requires_change_request`. |
| `follow_up` | Done | 0 or 1 question. An existing canonical question that closes the exact gap is linked by id (`canonical_question_id`) and never duplicated; a gap inside the answer gets one localized clarifying question. Pure in (question, answer revision), so one answer never spawns a second question, and `decide later` on the target ends it. `brand:coach next` coaches the last answered question. |
| `consistency_review` | Partial (by design); PR 2 rules added in GAP-08, below | An adapter over the existing `findContradictions`: `confirmed_conflict` only, reported by id, rules unchanged. `potential_tension` and `needs_verification` were not emitted here; since GAP-08 (below) the narrow rule registry emits them. Twelve tense-but-legitimate records (trade-offs, two markets, dated figures, explicit dispositions) are pinned as non-conflicts. The narrow rule registry is PR 2. |
| Locales | Done | en, fa (RTL) and tr for every finding code, criterion, status, clarifying question and UI string, written as advice rather than translated labels. A missing entry fails `coachI18nErrors()` and a test. |
| `npm run brand:coach` | Done | `analyze --mode follow_up\|quality_review\|consistency_review [--question <id>] [--lang en\|fa\|tr] [--json]` and `next`. Exit 0 / 1 (refusal or bad id, with a code) / 2 (usage). `tests/coach-cli.test.ts`. |
| Privacy and access | Done | No finding ever quotes, paraphrases or digests the owner's words (canary-tested on JSON and printed text). Restricted questions are refused outright — no value, no digest, no length — on every stream. Every mode is denied while `BRAND_OS_AGENT_TOKEN` is set; no MCP tool and no `brand_retrieve` kind exposes the coach. A prompt-injection answer is tested as inert. |
| Model | None | Nothing in this version calls a model or the network. Every finding is `origin: deterministic`; `model_suggestion` is reserved for PR 3. |
| Personal facet rubrics, optional provider, pilot measurement | Facet rubrics done (see "Coach contradiction and facet rubrics (GAP-08)" below); provider and pilot not started | PR 2 and PR 3 in `docs-internal/STRATEGIC_COACH.md`. A narrow Studio projection (the Overview card) landed with Coach UX, below. Facet *scoping* is already inherited from the condition engine; the per-facet prompts and checks are not written. |

## Coach UX: automatic, context-aware moments

Branch `feat/coach-ux`. Decision record: `docs-internal/COACH_UX_DECISION.md`. Problem it solves: the owner did not know when to run the coach, so it was effectively never run.

| Item | Status | Note |
| --- | --- | --- |
| Moment policy (`coach/moments.ts`) | Done | One pure filter for every moment: not restricted; free text or a measure; strategic id namespace (`COACH_STRATEGIC_NAMESPACES`) or a `verified_evidence` claim. A closed list of silence reasons. Never throws (a failure is silence, `unavailable`). `tests/coach-moments.test.ts`. |
| After an answer (`brand:interview`) | Done | Interactive and agent mode: 0 or 1 note after a `recorded` result, in the session locale; `--json` gains an additive `coach` object. First answer revision only, so the coach never repeats or loops. `tests/coach-moments-cli.test.ts`. The interactive loop is not driven by a test (its prompt does not read piped stdin); it calls the same helper as agent mode. |
| Before approving (`brand:approve`) | Done | Up to three notes on the batch's plain drafts, on stderr before the proof prompt (also with `--dry-run`). Change proposals are counted, not advised on. Never blocks; the approve JSON is unchanged. |
| Studio Overview card | Done | `projection.coach` built during sync (no route, GET only); up to five notes with en/fa/tr text; hidden when empty; ids and closed vocabulary only, canary-tested. Screenshots: `docs/screenshots/coach-ux/`. `tests/studio-coach.test.ts`. |
| Off switch | Done | `BRAND_OS_COACH=off` (also `0`, `false`, `no`) silences the automatic moments for one shell. Silent under `BRAND_OS_AGENT_TOKEN`. |
| Brand Runtime | Unchanged | The warn-only `coach` layer of the ten-post path stays as it was. |
| `brand:next` / `brand:status` summary, advice on change proposals, docs `/dashboard` panel | Not started | Deferred in the decision record. |

## SVG checker, normalizer and asset approval

Branch `feat/svg-normalizer`. Problem it solves: Illustrator exports (for example a brand's mascot stages) were refused everywhere as "active SVG" because of a harmless `<style>` block, with no reason given and no fix.

| Item | Status | Note |
| --- | --- | --- |
| Structured checker | Done | `checkSvg` in `packages/asset-catalog/src/svg-check.ts`, no dependencies. Parses the safe XML subset (no DOCTYPE, entities or processing instructions) and applies a namespace-aware element allowlist and an attribute blocklist. Each issue has a code, a line and `fixable`. `url(#id)` and `href="#id"` are allowed only to an element of the right kind in the same file (gradients, clip paths, masks, patterns, filters, markers). `inspectAssetForPublication` requires both this check and the older regex gate, so Studio, the docs build and MCP share one verdict. Fixed on the way: a leading `<?xml …?>` no longer refuses a file; a prefixed XHTML `<h:script>` is now refused. Live text is a warning. Test: `tests/svg-check.test.ts`. |
| Check at ingest | Done | `npm run brand:assets -- check [--ids] [--json]`, and `npm run validate` (so CI) fails on any present SVG that is not publishable and prints the fix. |
| Studio messages | Done | The asset card names the problem (en/fa/tr) and, when it is fixable, shows `npm run brand:assets -- normalize <id>`. No fix button; Studio stays read-only. Test: `tests/studio-svg-issues.test.ts`. |
| Normalizer | Done | `npm run brand:assets -- normalize <id> [--dry-run]`. SVGO 4.1.0 with only removeComments, removeMetadata, removeEditorsNSData, inlineStyles and convertStyleToAttrs. Then a UTF-8 (or encoding-less) `<?xml …?>` declaration is dropped, because older checkers refuse any `<?`; this way a normalized file is accepted by brands before they take the template update. Refused unless geometry attributes are byte-identical and both gates pass on the output. Original kept in `brand/assets-src/` (never served or published, included in backups); manifest records `derived_from` and `normalizer`. Only the changed keys of that asset are rewritten in the manifest. Separate entry `@brand-os/asset-catalog/normalize`, so the Studio bundle has no SVGO or rasterizer. |
| Approval and normalizing | Done | An approved asset keeps its approval only if old and new files rasterize (resvg 2.6.2, 1024 px) to identical pixels: `approved_sha256`, `approval_carried_from`, `render_check`. Otherwise (or if the rasterizer is unavailable) it goes back to draft with `approval_reset`. |
| `brand:assets approve` | Done | Owner approval of an asset's exact bytes (`approved_sha256`), with the same proof rules as `brand:tokens:approve`. Replaces approvals recorded by hand. `validate` flags an approved asset whose bytes changed. Test: `tests/svg-assets.test.ts` (Illustrator, Inkscape and Figma fixtures). |
| `brand:assets add` (BOS-03) | Done | `npm run brand:assets -- add <file> --id <asset.id> --name "…" [--kind logo\|icon\|mascot\|illustration\|photo\|motion\|audio] [--tags a,b] [--visibility public\|internal] [--license "…"] [--normalize \| --render png [--size 1024]] [--dry-run] [--json]` (`@brand-os/asset-catalog/manage`). Copies the file into `brand/assets/<kind>/`, appends a `status: draft` record with `checksum_sha256`, `mime`, `preview` and tags (the rest of the manifest keeps its formatting; the result is parsed back and compared), then runs `check`, the publication inspection and the manifest validation for that id. An SVG that fails the publication check is not written; the reasons (for example `<use>` wrapping a raster, `url(#id)` to a missing id, `style` with `mix-blend-mode`) and the fixes are printed. `--normalize` applies the normalizer at ingest; `--render png` rasterizes with resvg-js (already a dependency), keeps the SVG in `brand/assets-src/` and records `derived_from` and `normalizer: brand-os-svg-render`. Never overwrites a file, never reuses an id or path, never approves. Agents may run it. Test: `tests/studio-asset-manage.test.ts`. |
| `brand:assets prune-examples` (BOS-12) | Done | Removes template placeholders (tag `example`/`placeholder`, an EXAMPLE licence or an example id), manifest row and file, only when an approved real asset of the same kind (folder) exists, or the module is off (the mascot: its placeholders and unfilled slots such as the turnaround). Keeps a row referenced by `brand/mascot`, a file another row uses, or a file whose bytes no longer match. `--dry-run` lists. Test: `tests/studio-asset-manage.test.ts`. |
| Not done | — | `<use>` stays refused, even when it points inside the file. Raster previews generated on the server were not added. Asset publication (`approved_asset_ids`) still has no CLI. The checker filters attributes with a blocklist plus the regex gate; it does not have a full attribute allowlist. |

## Visual Blueprint P0: semantic visual layer and business model canvas

Guide: `docs-internal/VISUAL.md`. Audit and staged plan: owner notes (`visual-p0-audit.md`), not in this repository.

| Item | State | Evidence |
| --- | --- | --- |
| `VisualDocument` / `VisualBlock` model | Done (first two block types) | `@brand-os/brand-core/visual`: `business_model_canvas`, `citation_list`; data states, missing reasons, framework claim (`informed_by`). No new store: built through `documents/model.ts` `itemFor`. `tests/visual-bmc.test.ts`. |
| Business model canvas | Partial | Nine canonical zones from existing questions. Key activities and key resources have no question yet (designed gap, proposed ids); segments, offers, channels and revenue are single prose answers, so no links are drawn. |
| Studio page and print view | Done | `GET /brands/<slug>/strategy/business-model`, `GET /brands/<slug>/strategy/business-model/print[?edition=public]` (old `/visual` paths 301 since V2.4); no new non-GET route; en/fa/tr. `tests/studio-visual.test.ts`, `tests/studio-visual-browser.test.ts` (five widths, light/dark, A3 PDF via the browser). |
| Golden example | Done | `npm run visual:golden` (ILLUSTRATIVE / MOCK DATA fixture, en/fa/tr, internal/public, HTML, PDF and PNG when Chrome and pdftoppm exist). |
| Renderer registry and shared primitives (V1.1) | Done | `views/visual-registry.ts` (typed over every block type), `views/visual-primitives.ts` (state chip, legend, ghost geometry, source footnote, mini-map). Canvas golden HTML byte-identical before and after. `tests/studio-visual-registry.test.ts`. |
| Framework registry file (V1.1 / D5) | Done | `packages/brand-core/src/visual/frameworks.json` + `schemas/framework-registry.schema.json`; claim rules checked by `npm run validate`. Metadata only. `tests/visual-frameworks.test.ts`. |
| Brand Book "Visual identity" chapter (V2.1) | Done (screen + V1.2 book print) | `color_palette` (roles, declared `onX` combinations, measured WCAG 2 contrast grid), `typography_specimen` (en/fa/tr lines at true size), `logo_construction` (clear space and min size around the approved master logo: named in the approved `brand.logo.masters` answer by id, path or a unique file name, else tagged `logo` + `master`, else the only approved logo, else a light/dark pair; other sets of unnamed logos are `ambiguous`, never guessed, and the owner sees the candidate ids and the fix; BOS-16 adds the logo system: light plate, dark plate and icon sizes, `tests/studio-logo-system.test.ts`). Drafts, withheld values and gaps render designed "awaiting approved asset" plates. `GET /brands/<slug>/brand/book/visual-identity[/print]` (old `/visual/identity` paths 301 since V2.4), linked from the Brand Book page. `tests/visual-identity.test.ts`, `tests/studio-visual-identity.test.ts`, `tests/studio-visual-browser.test.ts`. |
| Competitor share path and comparison matrix (V2.2, D1) | Done (CLI + screen + existing print path) | `brand:competitive share [--dry-run]` writes `brand/competitive/shared/landscape.json` from owner-reviewed competitors only (allow-list projection: no quotes, note ids, URLs, reasons or hypotheses; labels that match a quote or fail the safety scan are dropped; prices unranked and unconverted; idempotent, removed competitors disappear). Studio admits only that file and withholds it whole on any unexpected field. `competitor_matrix` (own-brand row from approved facts, presence/unknown/historical/conflicting/needs-review states, numbered source footnotes) and `price_strip` (grouped by currency in shared order, rate labels, unknown stays unknown). `GET /brands/<slug>/market/competitors[/print]` (old `/visual/competitors` paths 301 since V2.4), internal edition only, linked from the Business model page. `absent` is a renderer state only: the index records no absence, so it is never emitted. Positioning map: see the V2.3 row. `tests/competitive-share.test.ts`, `tests/visual-competitors.test.ts`, `tests/studio-visual-competitors.test.ts`, `tests/studio-visual-competitors-browser.test.ts`. |
| Mascot atlas and six-stage evolution sheet (V3.4) | Done (screen + existing print path) | `mascot_atlas` (every catalog state; approved artwork only, with recorded usage and do / don't notes; unapproved states named internally, never drawn) and `mascot_evolution` (stages in order, at least six frames, missing stages as placeholders). Public edition: published artwork on a published row, published asset, no `draft` tag. `GET /brands/<slug>/brand/mascot[/print[?edition=public]]` (old `/visual/mascot` path 301s, V2.4), linked from the Assets page. `tests/visual-mascot.test.ts`, `tests/studio-visual-mascot.test.ts`, `tests/studio-visual-mascot-browser.test.ts`. |
| Print engine (V1.2: book TOC with page numbers, running heads, export CLI) | Done (`book_a4_portrait`, `canvas_a3_landscape` kept; `deck_16_9` typed stub, not built) | Typed profiles `visual/print-profiles.ts`. `views/visual-print-book.ts` lays out fixed A4 sheets: cover, imprint, contents with the printed page numbers and dotted leaders, running heads (book title verso, chapter recto), folios on the outer edge (mirrored for Persian), numbered notes on the page of their reference, tables continued with a repeated header, headings kept with what follows, each plate on a new page. The Studio print view (`/brand/book/visual-identity/print`) uses built-in height estimates; `npm run brand:export-visual` writes HTML (fonts and approved master embedded) and, with Chrome, a PDF from a measured two-pass layout, then checks every page for overflow. Owner machine only; Studio stays GET-only. Canvas renderer output pinned byte-for-byte. `tests/studio-visual-print-book.test.ts`, `tests/studio-visual-browser.test.ts` (one PDF page per sheet, no overflow, contents = folios, folio sides en/fa). |
| Studio restructure R1–R3 (V2.4) | Done | R1 sidebar grouped by intent (Command, Strategy Lab, Brand Studio, Market & Content, Publishing & Governance; en/fa/tr; every page kept, plus Competitor analysis and a Coach notes anchor). R2 stable paths with 301 redirects from the old flat paths (query kept, auth and `next=` unchanged). R3 Brand Book page as an editorial chapter reader (`views/visual-book.ts`) built from the V2.1 plates; `documentView` kept for Business OS prose and personal documents. `tests/studio-server.test.ts`, `tests/studio-visual-book.test.ts`, `tests/studio-visual-browser.test.ts`. R4–R6 (Command Center, Publishing gallery) not started. |
| Command Center, Publishing gallery, audience redaction (V4.1) | Done (screen; investor composer and whole-book print not built) | R4: the overview is the Command Center with a 30-second strip (decisions needed, review due, contradictions, exports ready) and a coverage mini-map per framework; older panels below. Publishing gallery `/governance/documents`: 7 document types × `public`/`investor`/`internal`, readiness measured on redacted output, counts only, links to existing print views. Core `visual/publishing.ts`: export profiles and redaction (restricted never; finance, `.private`-sourced, unapproved, unknown-id values and draft marks never in public or investor; competitor analysis internal only; plans never public). Public visual editions in Studio pass the public profile. `tests/visual-publishing.test.ts`, `tests/studio-publishing.test.ts`, `tests/studio-server.test.ts`. R5–R6 not started. |

| Visual QA (V1.3: screenshot baselines, PDF text/font checks, RTL checks) | Done (fixtures, Chrome CI job; digital PDF only) | `tests/studio-visual-qa.test.ts`: reference screenshots of the A3 canvas and the A4 book (cover, contents, colour plate) in en/fa against `tests/visual-baselines/` with a tolerant pixel diff (2 × 2 averaging, channel tolerance 48, 0.3 % of pixels) and actual/baseline/diff images in `dist/visual-qa/` on a mismatch (CI artifact `visual-qa-diff`); `npm run visual:baselines` updates them. The V1.2 export's PDF is read back (`tests/helpers/visual-qa.ts`, no dependency): headings, contents entries pointing at the right page, folios in Persian digits for fa, every font embedded including Inter, Rajdhani and Vazirmatn. RTL: dir, headings without overflow or split words, mirrored contents and folios, canonical canvas. No bleed or PDF/X. Known finding: the fixture canvas print footer is clipped by about 7 mm (`todo` test). |
| Positioning map (V2.3, D2) | Done (CLI + share + screen + existing print path) | Owner-only axes record `brand/.private/competitive/axes.json` (`brand:competitive axes set|show|validate`) and cited qualitative positions (`position add|remove`, `positions`); bands only, never numbers. `share` projects axis labels and per-axis state/bands/source labels (stale > 90 days and conflicting flagged, never resolved). `positioning_map` block plotted only where both axes have a dated source; unknowns in a margin list; plate 03 on `/brands/<slug>/market/competitors` and its own A4 print page. In fa the horizontal axis is mirrored (low on the right, y axis on the right), on screen and in print; en/tr run left to right (owner decision 2026-11-23). `tests/competitive-positioning.test.ts`, `tests/visual-positioning.test.ts`, `tests/studio-visual-positioning.test.ts`, `tests/studio-visual-competitors-browser.test.ts`. |

| Full Brand Book and Business Report PDF (V4.2) | Done (export command, en/fa/tr, internal/public; digital PDF only) | `npm run brand:export-visual -- --doc brand-book|business-report` on the V1.2 book engine: cover, imprint, contents with real folios, running heads, every chapter that exists today (Brand Book document sections, the V2.1 identity plates, Business plan sections, the canvas as a zone list) and designed "not yet available" pages for chapters with nothing approved, planned chapters (Motion, Applications) and chapters that print on their own (Mascot atlas, Competitive landscape). Approved values only; drafts print as labels, restricted values never print in any edition; the public edition shows no draft or restricted mark. Vazirmatn for Persian (no licensed display face added; owner question). `tests/visual-full-book.test.ts`, `tests/studio-visual-full-book.test.ts`, `tests/studio-visual-qa.test.ts` (10 new baselines, PDF text/font checks). |
| Positioning map (V2.3, D2) | Done (CLI + share + screen + existing print path) | Owner-only axes record `brand/.private/competitive/axes.json` (`brand:competitive axes set|show|validate`) and cited qualitative positions (`position add|remove`, `positions`); bands only, never numbers. `share` projects axis labels and per-axis state/bands/source labels (stale > 90 days and conflicting flagged, never resolved). `positioning_map` block plotted only where both axes have a dated source; unknowns in a margin list; plate 03 on `/brands/<slug>/visual/competitors` and its own A4 print page. In fa the horizontal axis is mirrored (low on the right, y axis on the right), on screen and in print; en/tr run left to right (owner decision 2026-11-23). `tests/competitive-positioning.test.ts`, `tests/visual-positioning.test.ts`, `tests/studio-visual-positioning.test.ts`, `tests/studio-visual-competitors-browser.test.ts`. |
| Other brand book chapters, other frameworks, new interview questions | Not started | Staged in the P1–P5 plan. Competitor data is owner-only (`brand/.private`) and is not visible to Studio. |

## Commands that this remediation expects to pass

`npm run lint`, `npm run typecheck`, `npm run validate`, `npm run test` (brand suite; `npm run test:full` adds the Studio suite), `npm run build`, and `npm run build:docs:nomascot`.

## Second remediation contract

`docs-internal/archive/REMEDIATION_TRACEABILITY.md` is the ticket record. Public export is a new allowlist. Approved facts stay approved when someone passes `confirm=true`. `include_unapproved` does not grant access. A private brand cannot be built as public. Asset publication rejects symlinks, traversal, active SVG, and checksum mismatches. Backup, restore, migrate, and reset are separate commands. Journeys A, B, and C have automated end-to-end tests (see above).

`authorize()` gates submit, approval, publication, reveal, export, and the MCP tools. `include_unapproved` is not an MCP parameter. Backups and restricted values use `BRAND_OS_DATA_KEY` and fail closed when it is absent. Fact files migrate to canonical schema 2. Each module compiles a cited page that leaves missing sections missing. Figma import returns `not_configured` without credentials and does not overwrite tokens.

Still external: SSO and hosted or remote MCP authentication (the `resolveAgentContext` seam is documented in ADR 0003), a hosted LLM, live Figma, and npm publishing. The approval proof remains a local file. Only the Brand Book, business plan and marketing plan have designed renderers; other modules are compiled field pages. fa/tr text other than prompts, page UI strings and the marked draft guidance paragraphs stays English. A CI matrix (Node 22/24, macOS), CSP headers, key rotation tooling and a link checker are not configured.

## Remaining security limits

- Restricted answers and backups are encrypted with `BRAND_OS_DATA_KEY`, read from the environment only. The key is not written into the working tree, so copying `brand/.private` copies ciphertext without the key. Losing the key makes those files unreadable. There is no key rotation tooling and it is not a KMS.
- The approval proof is a local shared secret, not SSO. Anyone who can read `approval-secret` can approve.
- `brand:init --reset` rewrites the ledger after copying it into the private backup. It does not rewrite mascot catalogs or module prose.
- A public build of a brand with `publish_docs: public` publishes approved public facts. Restricted values stay out. Internal facts stay out of the public audience.

## Brand Runtime: ten Instagram posts (first vertical slice)

- **Done:** `packages/brand-core/src/runtime/` and `brand:runtime social-batch --demo`. Ten real SVG drafts (1080×1350, en/fa/tr labels, RTL by copy script) from one `task_context` pack, manifests with source pins, batch summary; schemas `runtime-post-manifest`, `runtime-batch`; asset `model_use` (absent ⇒ `not_allowed`). Tests: `runtime-social-batch`, `asset-model-use`.
- **Not done:** real brands (CLI is `--demo` only), MCP tool, visual/semantic advisory review (`not_tested`), approved fonts from `brand.type.scale`, website / ads / mascot journeys, Studio view. Nothing is published, scheduled or approved.

## Brand Runtime: `--pack`, type scale, final export

- **Done:** `--pack <file>` (+ owner `--root`), approved type scale on drafts, `--final` outlines with owner font files (name/cmap checked, nothing substituted), Coach warnings never block, tagline/promise exemption in the Coach. Tests: `runtime-pack`, `runtime-type`, `coach-core`.
- **Not done:** MCP tool (next slice), `brand.type.rtl` for RTL lines, variable-font instances in final export, logo variant per background.

## Visual DNA reference resolver (fixes pack PR-C)

- **Done:** `packages/brand-core/src/visual-dna/`, MCP `visual_dna`, `brand:visual-dna resolve|read`. Read-only verdicts (`approved`, `withheld`, `missing`, `changed`) for asset ids, a mascot pose request and creative-memory variants, read through `brand_retrieve` and `creative_context` under one caller context; checksum, size, usage rights, effective `model_use` and a `provider_gate`. Metadata only over MCP. Owner-local `read` returns one checked file's exact bytes for a use its `model_use` allows. Schema `visual-dna`; guide `docs-internal/VISUAL_DNA.md`. Tests: `visual-dna`, `visual-dna-agent`.
- **Done (owner policy, 2026-11-23):** the brand's own marks need no recorded licence (`license_basis: own_brand_mark`; third-party assets still do); `use_scope` lets internal-scope rights cover a portrait for internal use only; manifest status `published` counts as approved in `brand_retrieve kind: asset` and Visual DNA, with every byte check still applied. Tests: `visual-dna-policy`.
- **Not done:** byte transport over MCP or any network, an export directory, production readiness (PR-E), wiring Visual DNA into `brand:runtime` (it still reads its logo through `loadApprovedLogo`), canonical mascot view sets, fonts, `published` in the docs-build publication check and the mascot catalog validator (both still require `approved`). The 20 MiB limit stays. Nothing is uploaded, published or approved; `model_use: external_allowed` is not an upload permission.

## Assurance on a real brand: owner-local bridge (GAP-09)

- **Done:** `brand:assurance snapshot | assess | verify` and `@brand-os/brand-core/assurance/workspace`. Approved facts (by `revision_hash`), internal research notes and open contradictions become the frozen input of the existing `assess()`. Reproducible digest, `--pin` / `verify` against a kept snapshot, restricted facts withheld below `restricted`, en/fa/tr output, stdout only, refused under `BRAND_OS_AGENT_TOKEN`, `authorizes: []`, never a certification. Guide: `docs-internal/ASSURANCE.md`.
- **Not done:** a reviewer-judgment store (so PRR-08 keeps every real brand `not_scoreable`), independent evidence (every note is `owner_stated`), a canonical paid-media question (owner flag for now), observed maturity input, Studio view, MCP or agent access (deliberately none). (Judgment store, paid-media question and independent evidence through register links are done in the follow-up sections below.)

## Owner review judgments for assurance scores (GAP-09 follow-up)

- **Done:** `brand:assurance-review list | record` and `assurance/reviews.ts`. Owner-only, versioned judgment store in the brand workspace (`brand/.private/assurance/reviews/`, hash-chained revisions); the bridge uses a judgment while its basis is unchanged, so a real brand gets a completeness ratio once nothing else blocks. Stale judgments block again. Note text never leaves the private file. en/fa/tr. Guide: `docs-internal/ASSURANCE.md`, "Owner review judgments".
- **Not done:** a Studio page for it (Studio stays read-only; CLI only), linking research notes to the evidence register (done in "Research notes linked to the evidence register" below), withdrawing a judgment without replacing it. (The canonical paid-media question and the company-vs-person subject are done in the next section.)

## GAP-09 follow-ups: paid-media question, company stays company

- **Done (owner decisions 4 and 5, 2026-11-23):** interview question `business.marketing.paid_media` (en/fa/tr) is the source of `runs_paid_media` in `brand:assurance`; `--paid-media` is a deprecated fallback used only while the question has no approved answer. The personal module never makes a company brand a person: only `brand.profile: personal-brand` does, and a founder's personal brand is recorded separately in `snapshot.personal_brand`, outside the subject and the digest. Tests: `assurance-followups`, `assurance-cli`.
- **Not done:** a Studio page for owner reviews (CLI only, see above), linking notes to the evidence register (done, see "Research notes linked to the evidence register" below), removing the deprecated `--paid-media` flag.

## Production readiness and quality gate (fixes pack PR-E, GAP-05)

- **Done:** `packages/brand-core/src/runtime/production.ts` (+ `production-agent.ts`, `production-i18n.ts`): a separate `brand-os/production-readiness/v1` projection over a `task_context` pack that never changes the pack's own `readiness`. Each check names its rule owner, input, verdict and whether it blocks; only objective rules block (pack digest, blocked context, no verified renderer or unsupported format/count, missing approved copy, banned claim, an owner-required logo that is missing / changed / withheld / unverifiable; at artifact stage also wrong file checksums, unsafe SVG bytes, an unpinned post, a required logo not embedded). Optional assets never block; taste and persuasion stay `needs_human_review` / `not_tested`; no score. MCP `production_readiness` (pre-render, same caller for `task_context` and `visual_dna`), `brand:runtime readiness` (`--root`, `--batch`, `--require logo`, exit 3 when not ready, en/fa/tr), `production-readiness.json` from `social-batch`. The runtime now reads its logo through the Visual DNA resolver (Visual DNA owner decision 6). Schema `production-readiness`. Tests: `production-readiness`.
- **Not done:** renderers for any task other than `social_batch` (those tasks stay `renderer.available: fail`, briefs only), visual taste / similarity / persuasion checks (`needs_human_review` / `not_tested`), a signature over written batches (checksums detect changed files, not a determined local editor), asset bytes to agents (decision 5), contrast as a hard rule (owner question), the Studio view. Nothing is published, scheduled, spent, deployed or approved.

## Visual V3.1: repeating_entity question type and structured BMC (D3)

Guide: `docs-internal/VISUAL.md` (List questions and canvas links). Supersedes the "Business model canvas: Partial" row above for key activities, key resources, segments and cost items.

| Item | State | Evidence |
| --- | --- | --- |
| `repeating_entity` type, validator, canonical storage | Done | `entities.ts`; canonical `brand-os.entity-list/1`, stable ids, links checked for form, amounts refused in cost items. `tests/repeating-entity.test.ts`. |
| BMC list questions | Done | `business.model.segments`, `key_activities`, `key_resources`, `cost_items` (optional, internal); bank and field registry regenerated, additions only. |
| Interview CLI (add, edit, reorder, remove) | Done | `brand:interview --entity add\|edit\|move\|remove\|list`, whole-list `--answer` keeps ids by name; drafts or change proposals, never approval. |
| Migration of legacy answers | Done | `brand:migrate`: convertible text → system draft or change proposal (approved facts untouched); the rest kept and flagged as legacy; idempotent. |
| Canvas links and empty state | Done | Items in zones, links by item name, unresolved targets named, links panel, designed empty list zone; en/fa/tr. `tests/visual-bmc.test.ts`, `tests/studio-visual.test.ts`. |
| Studio answers view | Done (read-only) | Business plan "Business Model Canvas lists" section; Studio never writes (STUDIO.md). Editing is the CLI in the brand repository. |
| Readers | Partial | `brand_retrieve` returns items in `meta.entity`; Coach reads list ids without quoting items. Task Context packs do not read list questions yet. `tests/repeating-entity-readers.test.ts`. |
| Offers, channels, revenue streams as lists; SWOT/TOWS, value fit (V3.2), journeys/OKR (V3.3) | Not started | Out of scope for V3.1. |

## Coach contradiction and facet rubrics (fixes pack GAP-08)

- **Done:** `coach/rules.ts` — a narrow registry beside the unchanged `findContradictions`. `consistency_review` now separates `confirmed_conflict` (only `findContradictions`), `potential_tension` (`premium-vs-lowest-price` with entry-tier / launch-offer / trial guards, `availability-held-back`; one explanatory question each, `advice`), `needs_verification` (`evidence-claim-unverified`, `sensitive-claim-wording` with a negation guard and the banned-list fields excluded) and, per rule, `not_tested` when an input is open (`rule_checks`, printed as "Rules checked"). No score or percentage. `coach/facet-rubrics.ts` — six facet rubrics in `quality_review` (role vs ownership, client confidentiality, dated audience numbers, sponsorship disclosure, portfolio usage rights, dated talks and publications) that link the existing canonical question. en/fa/tr for every new string. Rule version `coach-rules/2` (now `coach-rules/3` after the merge with the Coach area audit, see below); `rule_checks` is an additive optional field in `schemas/coach-result.schema.json`. Tests: `coach-rules` (12), existing `coach-core`, `coach-cli`, `coach-moments` unchanged and passing.
- **Not done:** surfacing tensions or facet rubrics in the automatic moments (owner decision; the moments and the Studio card are unchanged because they are built on `follow_up`), more tension rules, a Studio view of `rule_checks`, any model call. Claims are never marked verified by the coach; only `brand:evidence` can.

## Visual V3.5: finance security design (D4)

- **Proposal only, awaiting owner approval:** `docs-internal/FINANCE_SECURITY_DESIGN.md` (threat model, storage, readers, redaction per export profile, audit logging, owner decisions FD1–FD8).
- **Not done (by design):** any implementation. No finance export service, Studio finance view, MCP tool or agent profile change exists; restricted finance values stay withheld everywhere except the owner's local CLI.

## Nontechnical agent onboarding (fixes pack GAP-11)

- **Done:** owner guide `docs-internal/AGENT_ONBOARDING.md` (+ `.fa.md` RTL, `.tr.md`) for one fresh authorised agent over the existing local stdio MCP server and agent token (create secret, issue, connect Claude Code, verify, refusals, revoke). Test `fresh-agent-setup` runs the guide's Brand OS commands in a temporary synthetic brand (not `claude mcp add/list/remove` or `read -rs`; the MCP server is started through tsx, not `npm run -s mcp:serve`) and checks every command and profile the guides name exists.
- **Not done (by design):** hosted / remote MCP and any hosted auth; design note `docs-internal/AGENT_ONBOARDING_HOSTED.md` lists what it would need and requires an owner decision and a new security review. Studio stays read-only and cannot issue tokens. A shell-capable agent on the owner's machine can still read `brand/.private` (ADR 0003); the guide tells the owner to refuse that permission. Windows needs WSL or Git Bash for the commands as written.

## Research notes linked to the evidence register (GAP-09 follow-up)

- **Done:** `brand:assurance-link list | link | unlink` and `assurance/links.ts`. Owner-only, versioned link store (`brand/.private/assurance/evidence-links/<note>.json`, hash-chained revisions, 0600, ids and dates only). A research note counts as `independent` in the bridge only while the link in force on the `--as-of` day names a register entry (`brand/interview/evidence-register.yaml`) that is a verification, not owner testimony, for a question the note is about, verified on or before that day and not past `review_due` (the register's own `isCurrent`), and while the note is the revision that was linked. Otherwise it stays `owner_stated` and the snapshot names why (`evidence_links[].state`). New non-blocking gap `independent_evidence`. A qualifying link makes a PRR-08 judgment stale (its evidence changed). `verify` names a changed link. Bridge version 3; older snapshots still verify. Unapproved answers still lower the score and are not removed; no score while anything blocks; never a certification; `authorizes: []`; refused under `BRAND_OS_AGENT_TOKEN`. en/fa/tr. Tests: `assurance-links`, `assurance-link-cli`.
- **Not done:** a Studio page for links (CLI only), linking restricted notes (never read), MCP or agent access (deliberately none), checking the content of the source behind a register entry (the register holds references only; the owner's `brand:evidence verify` is the check).

## Audit: Trust area fixes (Assurance / GAP-09)

- **Done:** credential-like judgment notes refused; `--pin` from another brand or method refused; `verify` says why a digest changed when no cited source did (en/fa/tr); Persian wording; docs now state that an owner `yes` replaces PRR-08's evidence minimum and that dates are UTC days. Tests: `assurance-audit`.
- **Not done (owner questions):** whether `yes` should be allowed on PRR-08 with no research note cited; local-timezone dates for `--date`; the runtime gate's fixed `entity_kind: company` subject (runtime area).
- **Done (after merging GAP-09 links):** the link list (`brand:assurance-link list`) uses the Persian comma and translated register statuses. Checked the link store and CLI against the same criteria (owner-only refusal before any read, 0600 private files, ids and dates only, tamper refusal, no certification wording, UTC days); no other change needed.

## Audit: Runtime area (2026-11-24)

- **Done:** review of `runtime/**`, `task-context`, the runtime parts of Visual DNA and production readiness. Fixed: request locale in `task_context`, withheld logos listed in post manifests, `writeBatch` linked-parent and dangling-link refusal, one refused asset id no longer voiding all asset verdicts, `social-batch --root` and `readiness --root` resolving the same assets. Acceptance cases FIX-02 to FIX-08 run by hand on synthetic brands (report kept outside the repository).
- **Correction:** the "Visual DNA reference resolver" section above still lists production readiness and wiring Visual DNA into `brand:runtime` as not done. Both are done (PR-E, "Production readiness and quality gate").
- **Not done:** `social-batch` exits 0 even when production is `not_ready` (owner question); the batch `status` stays `drafted` when a post fails `copy.claims` (production readiness blocks it); website `sitemap` is a classifier word only, not a pack item.

## Pilot and workflow acceptance (fixes pack PR-F)

- **Done:** `npm run brand:acceptance` (`scripts/acceptance/`): the four journeys (single visual, ten Instagram posts, website brief, paid-ad brief) through the real stdio MCP server and CLIs, PASS / FAIL / NOT_TESTED per check with id-only evidence for FIX-01…FIX-08, owner questions counted as existing question ids. Synthetic fixture in CI (`acceptance-harness`: three cases PASS, the website brief NOT_TESTED because no brief renderer exists); owner-local `--root` run on a temp snapshot of a real checkout, never written. Contract `acceptance-report`; guide and setup guide `docs-internal/ACCEPTANCE.md`. Fix: a pack older than an approved fact it cites is refused with `--root` (`context.source_drift`, `stale_pack`).
- **Not done:** a live Claude session in CI (the harness makes the calls a skill-following session would; extra questions a model might still ask are a pilot observation), visual taste / similarity / persuasion, renderers for visuals, websites and ads (those journeys end in a block or a brief), a check that the embedded logo contrasts with the post background, strategy-revision drift (assets and facts are compared), owner change requests after review.

## Coach area audit (2026-11-23)

- **Done:** a scoped `consistency_review --question <id>` applies the 20-conflict cap after filtering to that field, so its own conflict is never cut off. `consistency_review` counts only live answers to questions the bank still has (an `unanswered`/`deprecated` record or a retired id no longer makes an empty brand read as consistent). `brand:coach next` no longer names a restricted last answer and its fallback text is localized. fa/tr: lexicon matching folds Arabic kaf/yeh and the Turkish dotted `İ`; the rendered criterion and the "does not apply" reason are localized. `COACH_RULE_VERSION` is `coach-rules/2`; Studio rebuilds a cached coach card computed under an older rule version. Tests: `coach-core` (audit block).
- **Not done (owner decisions pending, behaviour unchanged):** the five Coach UX questions in `docs-internal/COACH_UX_DECISION.md`; the bare Persian marker `همه` (may flag ordinary short answers); a `brand:propose` draft counting as the "first revision" for the after-answer moment.
- **Main merge (2026-11-24):** merged with GAP-08 (`coach/rules.ts`, facet rubrics). Both sides had bumped `coach-rules/1` to `/2` independently, so the combined rules are `COACH_RULE_VERSION` `coach-rules/3`. The scoped cap fix applies to `findContradictions` conflicts; registry findings fill the remaining slots.

## Audit: Visual V4 area (2026-11-24)

- **Done (this PR):** investor gallery cells never link a print view; RTL fixes in the Command Center strip; draft-mark comment and Studio screens table match the code; two test asserts (investor links, Persian leftovers).
- **Done (separate PR, redaction logic):** `redactBook` in `visual/publishing.ts`; the public Brand Book passes it in the projection; the Business Report has no public edition (`--doc business-report --edition public` is refused, en/fa/tr).
- **Not done (owner decisions pending, behaviour unchanged):** investor hides a published logo that still has a `draft` tag while public draws it; the gallery says "Print layout not built yet" for the Brand Book although `brand:export-visual --doc brand-book` exists; Persian "ماسکات" (book, atlas) vs "مسکات" (Studio nav). Report: `brand-os-template-notes/audit-visual-v4-report.md` (owner-local).

## Visual V3.1 × V4.2: list questions in the full books (main merge, 2026-11-24)

- **Done:** the Business Report's canvas chapter prints an approved list answer as items (name, labelled choices, detail, links by item name; numbers in the page's digits; no item ids). Drafts, withheld and unpublished lists carry no items into a book; `book.canvas` keeps the framework reference without the zone block. fa/tr labels for `business.model.segments`, `key_activities`, `key_resources`, `cost_items`. Tests: `visual-full-book` (V3.1 case), `studio-visual-full-book` (items, no ids, no draft item). Book reference screenshots unchanged (the canvas chapter is not a reference page; contents folios unchanged).
- **Not done:** the plan's "Business Model Canvas lists" section has no text chapter of its own in the report; the lists print in the canvas chapter only.

## Visual V3.3: customer journey swimlane, SOSTAC overview, OKR tree

- **Done:** list questions `business.marketing.journey_stages`, `business.goals.objectives`, `business.goals.key_results` (structured: target, unit, source required; currency units refused). Visual documents and Studio pages `/market/customer-journey`, `/strategy/sostac`, `/strategy/okrs` with A3 print views in both editions; internal edition shows labelled drafts, public edition approved and published only; ids only in details and the internal print appendix; fa mirrors the swimlane and the tree, Persian digits for folios. `assertNoSecrets` covers the new projection field (`visual.plans`); older caches rebuild once. Tests: `visual-plan`, `studio-visual-plan`. Screenshots (fixture) in the notes repository.
- **Not done:** no reference screenshot baselines (V1.3 QA) for the three print views yet; the full Brand Book / Business Report do not have a chapter for them; Task Context and `brand_retrieve` do not read the journey or OKR lists specially (they return as any approved list); the SOSTAC stage-to-question mapping is a template default, not owner-configurable; key-result progress over time (history) is not drawn, only the latest recorded value.
## Audit: fixes pack area, evidence link scope (2026-11-24)

- **Done:** a linked research note is `independent` only for the control that names the verified register entry's claim question; for its other questions it stays `owner_stated` (`assurance/workspace.ts`, test in `assurance-links`).

## Audit: Visual V1 area (2026-11-24)

- **Done:** review of the print engine (V1.2: `visual/print-profiles.ts`, `views/visual-print-book.ts`, `static/visual-book.css`, `brand:export-visual`) and visual QA (V1.3: baselines, digital PDF, RTL). Fixed: the export output check now resolves links (a linked folder or parent into `brand/` or `.private` is refused, and links are never written through); the imprint marks uncommitted `brand/` changes; the export reports a failed measuring pass; the V1.2 browser checks lost in the merge of #40 are restored; the PDF contents check is per entry; `VISUAL.md` is corrected.
- **Not done:** the fixture A3 canvas footer is still clipped by about 7 mm (`todo` test, owner question from V1.3). In fa, the section numbers (01, 02, 03) stay in Latin digits (owner question from V1.2/V1.3). The competitor and mascot print views do not use the V1.2 engine.

## Runtime: batch not-ready exits non-zero (PR-E owner decisions, 2026-11-24)

- **Done:** `brand:runtime social-batch` writes the drafts and `production-readiness.json`, then exits 3 when production is `not_ready` (0 when ready), with an en/fa/tr line on stderr. Owner decisions 1–7 for PR-E recorded in `docs-internal/BRAND_RUNTIME.md`. Test in `tests/production-readiness.test.ts`.
- **Correction:** the PR-E "Not done" line above (`social-batch` exits 0 even when production is `not_ready`) is resolved by this change.

## Audit: fixes pack area, coach rules (2026-11-24)

- **Done:** negated cheap-price wording does not fire `premium-vs-lowest-price` (en/fa/tr); registry rules skip questions that do not apply under the config; `coach-rules/4`.
- **Not done (reported in the audit):** `YEAR` in the creator rubric also matches counts such as 2000 or 1450; negation of symbol terms ("#1") and a wider window; Turkish verb-suffix negation; one slot per verdict under the finding cap; empty-id rule checks in scoped reviews; evidence and deferrals in `contextDigest`.

## Studio: Persian mascot label (owner decision, 2026-11-24)

- **Done:** Studio's Persian catalog spells the mascot «ماسکات» (6 strings), matching the book and the atlas. The print baselines in `tests/visual-baselines/` come from brand-core book text, which already said «ماسکات», so none of them changed. Test: `studio-visual-mascot`.
- **Not done:** `docs/screenshots/coach-ux/coach-overview-fa.png` (a docs reference image, not a compared baseline) still shows «مسکات»; Chrome would not start in the environment where this change was made. Brand-core fa text outside Studio (`content/brand-modules.ts` questions, `visual-dna/i18n.ts`) still says «مسکات».

## Owner decisions: Visual V4 audit (2026-11-24)

- **Done:** Q1 the Business Report stays internal only; confirmed in code (no public or investor edition is built or exported), no change needed. Q2 investor draws a published logo still tagged `draft` without its mark, same as public (unpublished draft-tagged masters and draft-tagged mascot artwork stay hidden in both). Q3 the Publishing gallery shows `npm run brand:export-visual -- --doc brand-book --edition public|internal` for the Brand Book (en/fa/tr). Tests: `visual-publishing`, `studio-publishing`.
- **Correction:** the first two items in the Visual V4 audit's "Not done" line above are resolved by this change. The Persian mascot label is a separate PR.
- **Not done:** the gallery's internal Business plan cell still reads "Print layout not built yet", although `--doc business-report --edition internal` exists (not part of the owner's decision); there is no investor composer for any document.

## Assurance: undecided paid-media answer wins (owner decision, 2026-11-24)

- **Done:** an approved `undecided` for `business.marketing.paid_media` is the interview answer: `runs_paid_media` stays `unknown` and `--paid-media yes|no` is ignored with an en/fa/tr notice on stderr. Confirmed unchanged: an approved `yes`/`no` wins; with no approved answer the flag still works. `brand-os.assurance-bridge/4`. Tests: `assurance-followups`, `assurance-cli`.
- **Correction:** the GAP-09 follow-up line "the flag still fills it" for an approved `undecided` (`docs-internal/ASSURANCE.md`) no longer holds.
- **Not done:** removing the deprecated `--paid-media` flag.

## Audit: fixes pack minor findings, batched (2026-11-24)

- **Done:** the creator / speaker rubrics no longer read an audience count ("2000 subscribers", «۲۰۰۰ نفر», "2000 abone") as a year; `brand.mascot.forbidden`, `personal.media.avoid` and `personal.privacy.never_publish` are list fields for `sensitive-claim-wording`; one slot for a `potential_tension` under the finding cap; scoped `consistency_review` keeps brand-wide rule checks; `coach-rules/5`. `brand:assurance-link link --date` reports today's state. The acceptance leak check also searches JSON-escaped values.
- **Correction:** of the coach audit's "Not done" line above, the `YEAR` count match, the finding-cap slot and the empty-id rule checks in scoped reviews are resolved by this change.
- **Not done (owner decision or larger change):** negation of symbol terms ("#1"), a wider negation window and Turkish verb-suffix negation; evidence and deferrals in `contextDigest`; `verify` wording when a link changes but the digest is the same; recovery from a corrupted link file; wrapping each acceptance journey, mapping parse errors to codes and a signal handler in the harness; the paid-media `undecided` vs `--paid-media` question (Q-1).

## Audit: Visual V3, plan views never public (2026-11-24)

- **Done:** the journey, SOSTAC and OKR pages have no public print. `?edition=public` answers 404, following V4.1 `PROFILE_DOCUMENTS` (marketing and business plans are not public). `tests/studio-visual-plan.test.ts`, `tests/visual-plan.test.ts`.
- **Not done:** investor-profile prints of these views (no investor composer exists yet).

## Visual V3.2: SWOT / TOWS and Value Proposition Canvas

Guide: `docs-internal/VISUAL.md` (SWOT / TOWS and the Value Proposition Canvas). Builds on the V3.1 list questions.

| Item | State | Evidence |
| --- | --- | --- |
| SWOT, TOWS and canvas list questions | Done | Eleven optional, internal `repeating_entity` questions (`business.swot.*`, `business.fit.*`); bank, field registry and knowledge graph regenerated, additions only (the business bank now has no YAML aliases). `tests/visual-strategy.test.ts`. |
| Item sources | Done | `sources` on items of these lists: answer id, `kn_…`, `ev-…`, https without credentials; `--sources` on `brand:interview --entity`. Resolved per edition, never guessed; web sources keep origin and path only. |
| TOWS link rule | Done | The strategy type narrows the link targets (SO → strengths, opportunities …); untyped strategies are listed, never placed. |
| Value fit | Done | Fit only from recorded links (reliever → pain, creator → gain), as counts; no score, nothing matched by wording. |
| Studio pages and print | Done | `/strategy/swot-tows`, `/strategy/value-proposition` (+ `/print`, `?edition=public`), GET only; en/fa/tr, canonical topology in fa, Persian digits in marks, counts and folios. `tests/studio-visual-strategy.test.ts`. |
| Public edition | Done (empty by design) | The lists are internal, so the public edition shows designed "Not published" states. Making any of them public is an owner question. |
| Per-segment canvases, Task Context, Coach | Not started | One canvas for all segments (segment names on items). Task Context packs and the Coach do not read the V3.2 lists yet. |
| Full Business Report chapter | Not started | The V4.2 Business Report does not include SWOT / TOWS or the canvas yet. |

## Audit: Visual V3 area, batched fixes (2026-11-24)

- **Done:** key-result units and cost items refuse Persian and Turkish currency spellings («تومن», `dolar`, `avro`, `lirası`) and ₹ ₽ ₩ ₪ (`tests/visual-plan.test.ts`, `tests/repeating-entity.test.ts`). `knowledge-graph.yaml` has the V3.3 journey and OKR edges; a drift test compares it with the question bank.
- **Checked, no change:** after the parallel V3.1/V3.2/V3.3 merges, routes, nav entries, the renderer registry, `frameworks.json`, the document-kind union, `visual/index.ts` exports, the golden script and the sync rebuild conditions carry both V3.2 and V3.3 once each. The Studio projection builds both under `assertNoSecrets`, and Studio stays GET-only for these pages.
- **Not done (owner questions in the audit report):** whether SWOT/TOWS and the Value Proposition Canvas become publishing document types; English framework provenance notes on Persian pages (all visual pages, by design); ids in the public print appendix of SWOT/VPC.

## Visual V5.1: standards verification, module audit, cross-brand pilot, release gate (2026-11-24)

- **Done:** the framework registry has a `reviewer` field (claim rules: date and named reviewer together, never in the future). `npm run visual:audit` scores every visual module 0–5 from real checks (rubric in `docs-internal/VISUAL.md`; JSON, table or Markdown; en/fa/tr). A cross-brand pilot runs on two synthetic brands (`--pilot`, `tests/visual-audit.test.ts`). `npm run visual:gate` checks public modules ≥ 4 and registry validity, and (`--release`) cited external standards verified. It has an owner-only override with an expiry and runs in the template's `validate` CI job. Scores today: every present module 4/5; V3.x modules pending.
- **Not done:** no standard has been verified by a person. BMC, WCAG-CONTRAST, BRAND-IDENTITY-GUIDE and MASCOT-MODEL-SHEET are `verified_on: null`, `reviewer: pending`, so `visual:gate -- --release` fails on BMC and WCAG-CONTRAST until the owner checks them. No module is at 5: the mascot atlas, competitor matrix, positioning map and Publishing gallery have no reference screenshots, and the other modules wait on standards. The Studio framework panel does not show the reviewer yet.

## Visual V5.1: main merge and V3.2/V3.3 scoring (2026-11-24)

- **Done:** `origin/main` (V3.2, V3.3, owner decisions) merged into `feat/visual-v5-1`. The audit scores the five new modules from real checks: `swot_tows`, `value_proposition`, `customer_journey`, `sostac_overview`, `okr_tree`, all internal, all 4/5 (next: reference screenshots, then standards). Their Studio public editions are inspected for drafts and badges. `PENDING_VISUAL_MODULES` is empty; the mechanism stays for later slices. `tests/visual-audit.test.ts`.
- **Not done:** no reference screenshots for the V3.2/V3.3 pages; `SWOT`, `TOWS`, `VPC`, `CUSTOMER-JOURNEY-MAP`, `SOSTAC` and `OKR` are `reviewer: pending`, so `visual:gate -- --release` now also lists them. The cross-brand pilot does not build the V3.2/V3.3 documents yet.

## Owner feedback: privacy guard, coach follow-up, localized help, validate noise (BOS-05, BOS-08, BOS-09, BOS-13, 2026-11-24)

- **Done:** profile URLs and handles are not emails; `personal.privacy.*` may name categories of data; refusals name the pattern and its line and word (`tests/personal-privacy-guard.test.ts`). The coach picks its clarifying question by question family and stays silent on `evidence_support` once a claim has verified evidence; `coach-rules/6` (`tests/coach-question-family.test.ts`). Every question has fa and tr `why_it_matters` and examples, shown by the interview with English fallback; three prompts reworded; drift checked for all three locales; `brand:migrate` refreshes question text (`tests/question-help-i18n.test.ts`). `npm run validate` no longer warns about unbuilt token CSS; the docs build prints the note.
- **Not done:** the fa/tr help text was translated by an agent and has not been reviewed by a native speaker. Category names are still refused in notes and outside `personal.privacy.*`, and family phrases ("my children") are refused even in privacy answers. Labels and the field registry were not reworded.
