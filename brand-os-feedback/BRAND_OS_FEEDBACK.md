# Brand OS: product feedback and fix requests

- **Author:** brand owner (product owner), assisted by Claude Code
- **Date:** 2026-11-24
- **Observed in:** one complete real session on the personal brand `omid-ataei` (profile `personal-brand`). It went from an empty interview to 63/63 answered questions, 69 approved facts, 15 verified evidence items and 3 approved assets, across PRs #2 to #5.
- **Template version:** `brand-os-template@0.2.0`, commit `09f37aaf66b8eb534ef6f8b5661f1d46449966f2`
- **Environment:** macOS, Node 24, zsh; Studio hosted at `studio.omidataei.com`
- **Intended reader:** a Claude Code session working in the template repository (`omidlog/brand-os-template`).
- **Screenshots:** in `screenshots/` next to this file. Each file name starts with the item ID.
- **Template drift:** Studio reports "Updates available: this brand is on template commit `09f37aa`, the template is now at `d837a13`". Before fixing an item, check whether `d837a13` already changed the behavior. If it did, mark the item as fixed and say which commit fixed it.

## How to use this file

- Each item has a stable ID (`BOS-NN`). Reference it in branch names, commits and PRs.
- Each item has the same four parts: **Problem**, **Observed** (a real reproduction from the session), **Expected** and **Acceptance criteria**.
- Before changing behavior, read the governing docs named in the template's `CLAUDE.md` and `AGENTS.md`. Do not weaken any governance rule unless an item explicitly asks for it. That covers approval proof handling, the rule that agents never approve or publish, Studio being read-only, and evidence honesty.
- The product owner reports problems as questions ("why does Studio not show X?"). Each such question is a bug report about the product, not about the operator. Root causes are recorded here.
- New items are appended under "Items added later" with the next free ID.

---

## Summary

| ID | Title | Priority | Area |
|---|---|---|---|
| BOS-01 | One command to approve facts, evidence and assets | 🔴 High | CLI / approval |
| BOS-02 | Show open-PR changes in Studio | 🔴 High | Studio |
| BOS-03 | Command to add an asset | 🟠 Medium | CLI / assets |
| BOS-04 | Simple change flow for an approved fact | 🟠 Medium | CLI / interview |
| BOS-05 | Privacy guard false positives | 🟠 Medium | Privacy guard |
| BOS-06 | Record provenance of agent-suggested answers | 🟠 Medium | Provenance |
| BOS-07 | Clear `--dry-run` output | 🟠 Medium | CLI / approval |
| BOS-08 | Coach follow-up does not match the question | 🟡 Low | Coach |
| BOS-09 | Unclear questions and English-only help text | 🟡 Low | Question bank / i18n |
| BOS-10 | Re-verifying evidence changes Git | 🟡 Low | Evidence |
| BOS-11 | Slow Studio health check, no auto refresh | 🟡 Low | Studio |
| BOS-12 | Prune template example assets | 🟡 Low | Assets |
| BOS-13 | Recurring Token CSS warning | 🟡 Low | Validate |
| BOS-14 | Studio Refresh returns HTTP 504 and freezes the server | 🔴 High | Studio sync / brand-core engine |
| BOS-15 | "Interview complete" in the CLI, mostly empty in Studio | 🔴 High | Interview profile vs Studio applicability |
| BOS-16 | Approved logos and icon do not appear in the brand book | 🔴 High | Visual identity / master logo |
| BOS-17 | Approved colours and type never become design tokens | 🟠 Medium | Tokens / Design System |
| BOS-18 | "Verified" label is wrong for self-published and mixed claims | 🔴 High | Evidence |
| BOS-19 | Personal documents are fact lists and missing from the publishing gallery | 🟠 Medium | Personal documents / publishing |
| BOS-20 | Studio shows the slug-style name "omid ataei" instead of the approved name | 🟡 Low | Studio registry |
| BOS-21 | Mixed Persian and English text renders out of order | 🟠 Medium | Studio i18n / RTL |

---

## 🔴 High priority

### BOS-01: One command to approve facts, evidence and assets
**Problem.** To approve anything, the owner has to know three separate commands, type ids by hand, and append `< brand/.private/approval-secret` to every one of them:
- `brand:approve --module|--ids` for facts and change proposals
- `brand:evidence verify --id`, which takes only one id per call
- `brand:assets approve --ids` for assets

**Observed.**
- The first time, the owner copied the documented form `npm run brand:approve -- --module <id> < ...` literally. zsh failed with `parse error near '<'`.
- Verifying 15 evidence items needed a shell `for` loop.
- The owner ran about 12 separate approval commands during the session.

**Expected.**
- `npm run brand:approve -- --all-pending` lists everything that is pending (facts, change proposals, evidence and assets) grouped by kind. It approves all of it with one proof, and supports `--exclude <id,…>`.
- Optionally, store the proof in the OS credential store (macOS Keychain or equivalent), so the owner does not need the `<` redirect each time.
- Documentation and CLI help never show a placeholder such as `<id>` inside a command that also uses a `<` redirect.

**Acceptance criteria.**
- One command approves every pending item with one proof and reports each item as `approved`, `skipped`, `refused` or `stale`.
- These rules are unchanged: the command refuses to run while `BRAND_OS_AGENT_TOKEN` is set, a proof on argv is refused, and a wrong proof writes nothing.
- Tests cover the mixed batch (fact, change, evidence and asset in one run).

### BOS-02: Show open-PR changes in Studio
**Problem.** Studio shows only the merged default branch. To see any change, the owner has to go through approve → commit → PR → wait for CI → merge → Refresh. Until then, Studio gives no sign that anything is pending.

**Observed.** Four PRs (#2 to #5) were merged in one day. The owner asked several times "why can't I see it in Studio?" while the changes sat in open PRs.

**Expected.**
- The brand page shows a banner: "N changes are waiting in open pull requests". It links to each PR and counts the facts, assets and evidence each PR changes.
- Optional: a read-only "branch preview", clearly labelled "unmerged, not canonical".

**Acceptance criteria.**
- Studio never presents unmerged content as brand truth. The rule in `docs-internal/STUDIO.md` is unchanged.
- No new write route is added. The route allowlist pinned in `tests/studio-server.test.ts` is unchanged, and the counts are computed from GET requests only.

---

## 🟠 Medium priority

### BOS-03: Command to add an asset
**Problem.** `brand:assets` supports only `check`, `normalize` and `approve`. There is no way to add a new asset, so the operator had to edit `brand/assets/asset-manifest.yaml` by hand and compute sha256 with `shasum`.

**Observed.**
- The manifest records for two wordmark SVGs and one icon were written by hand.
- An icon SVG exported from Affinity wrapped a 150 px PNG with `<use>` and was refused by the publication check.
- An earlier icon SVG used `mix-blend-mode` and four `url(#…)` references to ids missing from the file, so it was refused too.
- To produce a 1024 px PNG, the operator had to render the SVG with headless Chrome.

**Expected.**
- `npm run brand:assets -- add <file> --id <asset.id> --name "…" [--visibility public|internal]`. It copies the file into the right folder, writes `checksum_sha256` and `mime`, sets `status: draft`, and runs `check` straight away.
- `--render png --size 1024` rasterizes an SVG that cannot be published. The original goes to `brand/assets-src/` and the manifest records `derived_from`.

**Acceptance criteria.**
- No user ever has to edit `asset-manifest.yaml` by hand.
- The generated record passes `npm run validate`.
- Agents may run `add`. Only the owner can run `approve`, as today.

### BOS-04: Simple change flow for an approved fact
**Problem.** `brand:interview --question X --answer "…"` on an approved question returns `ok: false` with "already approved, nothing changed". The only working path is to hand-write a `brand:propose` JSON batch with `correction: true` and a `quotation` that matches `source_text` word for word. Owners cannot realistically do that.

**Observed.** Three changes each needed a hand-built JSON batch:
- adding "300+ brands" to `personal.experience.highlights`
- switching the Persian body font to Yekan in `brand.type.intent`
- adding Brand OS to `personal.portfolio.projects` and `personal.content.pillars`

**Expected.**
- `npm run brand:interview -- --question X --change "…" [--reason "…"] [--json]` creates a `chg-…` proposal and prints the diff and the impacted ids.
- README step 5, `change <id>: <new value>`, works non-interactively.

**Acceptance criteria.**
- The approved revision stays canonical until the `chg-…` is approved.
- `stale` handling is unchanged.

### BOS-05: Privacy guard false positives
**Problem.** The privacy guard (`packages/brand-core/src/personal-privacy.ts`) refuses legitimate answers.

**Observed.**
1. `personal.content.channels` was refused with "looks like it contains an email address". The trigger was `https://www.tiktok.com/@omid.ca`, because `/@omid.ca` matches an email-like pattern.
2. `personal.privacy.never_publish` was refused with "looks like it contains a birth date". The answer only *named the category* ("… personal registry data such as date of birth"). It contained no date at all, and this question exists to list exactly such categories.

**Expected.**
- Social profile URLs (`/@handle`) and bare handles are not treated as email addresses.
- In `personal.privacy.*` questions, naming a category of data without a value is allowed.
- The refusal says which part of the text triggered it, without echoing the value.

**Acceptance criteria.**
- Both examples above are accepted.
- Every existing refusal test with real personal data still refuses.
- New tests cover en, fa and tr.

### BOS-06: Record provenance of agent-suggested answers
**Problem.** When an agent proposes a value and the owner simply replies ✅, `brand:interview --answer` records `source_type: owner` and `authority: confirmed_by_owner`. Nothing shows that the value came from the agent, not from the owner.

**Observed.** These were suggested by the agent ("standard" defaults or wording) and only confirmed by the owner, yet all were recorded as owner-sourced:
- logo clear space, minimum size and misuse
- type weights and type scale
- engagement format names
- part of the voice pairs

**Expected.** `--answer "…" --origin agent_suggestion` (or `--suggested-by agent`) records `source_type: agent_suggestion` plus an explicit owner confirmation. `agent_suggestion` is already listed in the question bank's `source_types`.

**Acceptance criteria.** `brand:review`, the generated drafts and Studio all show agent-suggested, owner-confirmed facts as distinct from owner-originated facts.

### BOS-07: Clear `--dry-run` output
**Problem.** `brand:approve --dry-run` prints the same review queue, with "Draft, never approved" on every item.

**Observed.** Dry-run output reached the owner after the real approval had already run. The owner concluded that nothing had been approved and asked again.

**Expected.**
- The output starts with: "DRY RUN: N items would be approved. Nothing was changed."
- Each item shows `would approve` or `would skip`, with the reason.

**Acceptance criteria.** Dry-run output cannot be mistaken for the review queue or for the result of a real approval.

---

## 🟡 Low priority

### BOS-08: Coach follow-up does not match the question
**Problem.** After `personal.positioning.boundaries` was answered ("legal, tax, investment advice"), the coach (`criterion: specificity`) asked "Which one group or situation do you have in mind and what is their main problem?". That is an audience question, not a question about expertise boundaries. The same note came back again at approval time.

**Observed.** Every `evidence_support` note was the identical sentence: "From which source can someone outside your company check this claim?". It appeared for `personal.founder.ventures` even though a verified Companies House evidence item already existed for that claim.

**Expected.**
- `suggested_question` is chosen per question type.
- `evidence_support` notes are suppressed when the claim already has verified evidence.

**Acceptance criteria.** A fixture shows that no audience-style follow-up is generated for non-audience questions, and that no `evidence_support` note is generated for a claim with verified evidence.

### BOS-09: Unclear questions and English-only help text
**Problem.**
- `why_it_matters` is English only, even when `prompt_locale: fa`.
- `examples` have no Persian or Turkish versions.
- Three questions confused the owner:
  - `personal.media.visual_templates`: "shouldn't every template use my brand look?" The intended question is which templates to build first.
  - `personal.goals.kpis`: "I don't understand what you mean."
  - `brand.verbal.voice_pairs`: "Should I write these sentences in my own voice?"

**Expected.**
- `why_it_matters` and `examples` get en, fa and tr locale data.
- Reword the three prompts:
  - visual templates: "Which templates should be built first?"
  - KPIs: "For each goal, which number do you watch, and what is it today (with source and date)?"
  - voice pairs: state "in your own words".

**Acceptance criteria.** `brand:validate` checks prompt drift for all three locales, including `why_it_matters` and `examples`.

### BOS-10: Re-verifying evidence changes Git
**Problem.** Running `brand:evidence verify --id` again on evidence that is already verified overwrites `verified_at` and creates a meaningless Git diff.

**Observed.** The owner ran the verify loop for `ev-0002`..`ev-0005` twice. Four `verified_at` values changed for no reason.

**Expected.** When the evidence is already verified, the command prints "already verified" and writes nothing. That matches `brand:approve`, which already prints "Already approved and no change is pending".

**Acceptance criteria.** Re-running the command leaves `git status` clean.

### BOS-11: Slow Studio health check, no auto refresh
> The slow `/healthz` part of this item is explained by **BOS-14** (the sync blocks the event loop). Fix BOS-14 first. What stays here is the auto-refresh and webhook guidance.

**Problem.**
- `GET /healthz` took about 7.7 s, so the owner thought Studio had hung.
- The webhook is off by default, so after a merge Studio shows nothing new until someone presses Refresh.

**Expected.**
- `/healthz` answers quickly and does not depend on GitHub sync.
- When no webhook is configured, the Account page gives one-step setup guidance.
- A lightweight poll of the default-branch SHA runs, respecting the existing rate limits.
- A clear "syncing…" state is shown, so a sync is not mistaken for a hang.

**Acceptance criteria.**
- `/healthz` responds in under 500 ms.
- A merged change appears without a manual Refresh within a bounded time (a few minutes).

### BOS-12: Prune template example assets
**Problem.** After the real logo and icon were added, the template examples were still in the manifest and in the asset folders: `asset.logo.example-wordmark`, `asset.icon.example-mark` and `asset.mascot.placeholder-frame`. The mascot module is disabled for this brand.

**Expected.** `npm run brand:assets -- prune-examples` removes the EXAMPLE assets, or at least hides them in Studio. It acts only when an approved real asset of the same kind exists, or when the related module is disabled.

**Acceptance criteria.**
- `validate` passes after the prune.
- Studio shows only real assets.

### BOS-13: Recurring Token CSS warning
**Problem.** Every `npm run validate` prints: "Token CSS has not been written. Run npm run tokens:build before the docs build." An owner who never builds docs cannot tell whether this matters or what to do.

**Expected.** Either show the warning only when building docs, or reword it to say it is not needed for brand work and matters only before a docs build.

**Acceptance criteria.** A normal `validate` finishes without irrelevant warnings.

---

## Out of scope (product owner decision)
- **Public-repository warning.** The owner deliberately made the brand repository public, because the private repository had no GitHub Actions minutes left. No change is requested here for now.

## Strengths to keep
- Strict separation of record, approve and publish, and agents can never approve or publish.
- Fact versioning. A change creates a new version, and the previous revision stays in the ledger.
- Honest evidence labels: "owner testimony stays owner-stated" never becomes independent verification.
- Asset approval is pinned to exact bytes.
- `brand:next` explains why each question comes next, and the Persian question prompts are good.

---

## Items added later
_The product owner adds items here. Use the next free ID._

### BOS-14: Studio Refresh returns HTTP 504 and freezes the server
**Priority:** 🔴 High. It blocks the owner from seeing any change after a merge, and the owner reports it happens "usually after a push".

**Problem.** Pressing **Refresh** (`POST /brands/omid-ataei/refresh`) after a merge ends in Chrome's "This page isn't working. studio.omidataei.com took too long to respond. HTTP ERROR 504". While a sync runs, the whole Studio process stops answering: `GET /healthz` took about 7.7 s earlier in the session.

**Root cause (measured, not guessed).** There are three causes, and they add up:

1. **`InterviewEngine` re-reads and re-parses YAML on every call (main cause).**
   - `packages/brand-core/src/engine.ts`: `ledger()` is `readYaml(answer-ledger.yaml)` with no cache, and `config()` is the same.
   - `private context()` calls `this.config()` and `latestAnswers(this.ledger().records)` every time it runs.
   - `applicability(question)` (line ~496) calls `this.context()`, so the full ledger is parsed once **per question**. Many other methods call `this.context()` per question too (lines 316, 334, 364, 463, 482, 518, 543).
   - The cost grows with brand progress (number of questions × ledger size). It gets worse exactly as the owner finishes the interview. This repo's ledger is 3,465 lines (about 85 answer records), and the cost is now tens of seconds.

2. **The whole sync runs synchronously on the Node event loop.**
   - `apps/studio/src/sync.ts` `doRefresh` → `extractTarGz` uses `zlib.gunzipSync` and `fs.writeFileSync` (`github/tar.ts`), then `buildProjection(checkout, slug)` (`projection.ts`). All of it is synchronous.
   - While it runs, no other request is served: page views, `/healthz`, and the Docker `HEALTHCHECK` (`--timeout=5s`, `infra/production/Dockerfile`) all wait.
   - The `Promise.race(..., setTimeout(30_000))` fallbacks in `routes/brands.ts` (the `refresh` handler and `brandView`) cannot fire while the loop is blocked, so the "never hang the page" guarantee does not hold.

3. **`POST /refresh` holds the HTTP request open** for up to 30 s by design, waiting for the sync. It should return immediately and show a "syncing" state. Together with causes 1 and 2, the response arrives after the upstream proxy gives up, and the proxy returns 504. The repo's Caddy config uses `response_header_timeout 90s` and Node uses `requestTimeout 60_000`. The production proxy may be stricter, and a slower server CPU makes it worse.

   Every merge changes the default-branch SHA, so every merge forces a full `buildProjection`. That is why the owner sees it "after a push".

**Observed (reproduction).** The current merged `main` (`009ed69`) of `omidlog/omid-ataei` was benchmarked locally with the template's own code (`extractTarGz` + `buildProjection`, run with tsx on an Apple Silicon Mac, Node 24):

| Step | Time |
|---|---|
| Tarball download | 4.3 MB |
| `extractTarGz` | 45 ms |
| `buildProjection` | **40,645 ms** |
| Longest event-loop block | **40,662 ms** |

CPU profile of `buildProjection` (inclusive time):

| Function | Share |
|---|---|
| `InterviewEngine.ledger` (`brand-core/src/engine.ts`) | **83 %** (35.1 s) |
| `readYaml` (`brand-core/src/fsutil.ts`) | 19 % |
| `InterviewEngine.context` | 19 % |
| `InterviewEngine.applicability` | 18 % |
| everything in `projectVisual`, `buildDashboard`, coach, publishing | < 2 % together |

A production server with a slower CPU will take longer than 40 s. Owner screenshot of the 504: `screenshots/BOS-14-refresh-504.webp`.

To reproduce: download the tarball of `omidlog/omid-ataei@main`, call `extractTarGz(archive, { destRoot, include: studioPathAllowed })` and then `buildProjection(destRoot, 'omid-ataei')`, and time it with an event-loop lag probe (a `setInterval` of 50 ms).

**Expected.**
1. **Cache inside `InterviewEngine`.** Memoize `config()`, `ledger()`, `session()` and the derived `context()` / `latestAnswers` per engine instance. Invalidate on the engine's own writes, or key the cache on file `mtime`, `size` and inode. Do not re-parse the ledger per question. Do the same audit for the other readers the projection uses (`readFacts`, `readEvidence`, the question bank, the asset manifest).
2. **Move the projection build off the request event loop.** Run `extractTarGz` + `buildProjection` in a `worker_thread` or child process, or at least use async `zlib.gunzip` and async fs. Then the server, `/healthz` and the Docker health check stay responsive while a sync runs.
3. **Make `POST /refresh` non-blocking.** Start or join the refresh, then redirect at once to the brand page with a visible "Syncing… (started HH:MM)" state that updates on its own, for example with a light poll of a GET status endpoint or a meta refresh. The page should never sit on an open request. Apply the same change to the first-view path in `brandView`.
4. **Show progress and failure clearly.** If a sync takes longer than N seconds, show "still syncing", not an error. If it fails, show the existing `refresh failed` state with the error code.

**Acceptance criteria.**
- `buildProjection` for this repo at `009ed69` (about 85 ledger records, 69 approved facts) finishes in **under 2 s** on a developer laptop.
- Add a regression test or benchmark fixture with at least 150 ledger records. It fails if projection time grows superlinearly, or if it crosses a fixed budget.
- During a refresh, the longest event-loop block in the Studio process is **under 200 ms**, and `GET /healthz` answers in **under 500 ms**.
- `POST /brands/<slug>/refresh` returns a redirect in **under 1 s** every time. No request waits for GitHub or for the projection.
- After a merge to `main`, pressing Refresh never produces a 502, 503 or 504. The new SHA appears once the background sync finishes.
- No change to Studio's write surface. The route allowlist in `tests/studio-server.test.ts` is unchanged. The new status endpoint, if added, is GET only and owner-only.

### BOS-15: "Interview complete" in the CLI, mostly empty in Studio
**Priority:** 🔴 High. The two surfaces contradict each other, and the owner cannot tell what is actually left to do.

**Problem.** The CLI says the interview is done, but Studio shows most of the strategy frameworks as empty:
- `npm run brand:next -- --json` reports `profile: personal-brand, total 79, answered 63, open 0`, with an empty `next` list. The agent told the owner, truthfully per the CLI, that the interview was complete.
- After the merge (`009ed69`, synced), Studio shows these as empty or almost empty:

| Area in Studio | What it shows |
|---|---|
| Business Model Canvas | 0 of 9 complete |
| Business plan | 0 of 8 sections; every item "Not answered yet / missing", e.g. `business.identity.trade_name`, `business.offer.summary`, `business.offer.value_proposition`, `business.stage.current`, `business.plan.milestone` |
| Marketing plan | 0 of 6 complete |
| SWOT / TOWS, Value Proposition Canvas, SOSTAC, OKR | under "Strategy lab", all empty |
| "Ready outputs" | 2 of 14 |

**Root cause.** Two rules disagree about which questions apply to a personal brand:
1. **The interview profile excludes business questions.** `brand/interview/profiles/personal-brand.yaml` has `exclusive: true`: "company legal-entity, SaaS, mascot and other Business OS questions count as not applicable, not missing". So `brand:next` never asks any `business.*` question and reports the interview as complete.
2. **The Studio frameworks include them.** `packages/brand-core/src/visual/bmc.ts` → `canvasApplies()` returns true for a personal brand with a "business facet", and `BUSINESS_FACETS = ['founder-executive', 'consultant-expert']`. This brand has exactly those two facets, so the BMC, the business plan and the plans built on the same rule (`projection.visual.plans.applies`, plus the strategy documents) are shown. They are built from `business.*` questions that the interview never asked.

So with the facets the onboarding wizard suggests, every personal brand reaches "interview complete" while Studio's strategy lab stays empty, with no path to fill it.

**More evidence from a full walk through Studio (logged in as owner, commit `009ed69`).**
- **The brand book asks for brand-level answers the personal profile never asks.**
  - Chapter 01 "Brand overview" is **Missing, 5 open**: trade name, public name override, tagline, offer, primary customer.
  - Chapter 02 "Strategy" is **Partial, 7 open**: purpose, vision, values, differentiation, promise, decision rule.
  - Chapter 07 "Governance" is **Missing, 7 open**.
  - Chapters 03 to 05 also have open items: name use, microcopy, colour themes / semantics / contrast target, type fallback, RTL.

  None of these `brand.*` ids is in `brand/interview/profiles/personal-brand.yaml` → `question_ids`. That is also visible in the approve output: `skipped brand.strategy.purpose  No answer recorded`. Several of them have a personal equivalent that is already approved but not used:
  - public name ← `personal.identity.public_name`
  - offer ← `personal.services.offers`
  - primary customer ← `personal.positioning.primary_audience`
  - approver ← `personal.governance.reviewer`

  Purpose, vision, values and promise apply to a person too, and the profile should ask them. Screenshot: `screenshots/BOS-15-brand-book-overview-unasked.jpg`.
- **The coverage maths reports 100 % on zero questions.** The Business OS page (`/market/marketing-plan`) lists all 12 business modules (Company & Business Plan, Marketing, Finance …) at **Coverage 100 %, Approved 100 %, Unanswered 0**. On the same page, the marketing plan shows **15 missing**. A module with 0 applicable questions should show "Not applicable", not 100 %. Screenshot: `screenshots/BOS-15-business-modules-vacuous-100.jpg`.
- **The Command Center contradicts itself.** "Approved 100 %, Unanswered 0 of 49, Business 0 of 0" sits next to "Business Model Canvas 0 of 9 complete · 9 missing" and "Business plan 0 of 8 · 8 missing". Screenshot: `screenshots/BOS-15-command-center-coverage.webp`.
- **Approved personal answers are not reused.**
  - The OKR tree says "No objectives or key results recorded yet", although `personal.goals.outcomes` and `personal.goals.kpis` are approved with targets and dated baselines (e.g. Instagram 73k → 500k).
  - The marketing plan shows "Content pillars: Missing (`business.marketing.pillars`)", although `personal.content.pillars` is approved.
  - The marketing plan shows "Primary customer: Missing (`business.customer.primary_segment`)", although `personal.positioning.primary_audience` is approved.
  - The Customer Journey Map is empty, and the interview never asked for journey stages.
- Owner screenshot of the empty business plan: `screenshots/BOS-15-business-plan-empty.webp`.

**Product questions to settle (owner input needed before coding).**
- For a founder or consultant personal brand, which business does the canvas describe: the person's consulting practice (offers are already in `personal.services.offers`), or one of the ventures in `personal.experience.relationships` (Fiko, Dadvin)? A person can run several companies, and the current model has one `business.*` namespace per repository.
- Should the strategy frameworks reuse the personal answers that already exist (offers, audience, outcome, channels, KPIs, positioning), instead of asking parallel `business.*` questions?

**Expected.**
1. **One definition of "applies"**, shared by `brand:next` / `brand:status` / completeness and by Studio. If Studio shows a framework, the interview must be able to ask every question that framework needs, and `open` must count them. If the interview treats them as not applicable, Studio must hide the framework or show it as "Not applicable to this profile", never as "missing".
2. **For personal brands with a business facet, map the frameworks onto personal answers where a mapping exists.** Examples:
   - BMC customer segments ← `personal.positioning.primary_audience`
   - value proposition ← `personal.positioning.outcome`
   - channels ← `personal.content.channels`
   - revenue streams / offer ← `personal.services.offers` + `personal.consulting.engagements`
   - business plan KPIs ← `personal.goals.kpis`

   Ask only for what is genuinely missing, as normal interview questions.
3. If the owner wants a full business plan for a venture, offer an explicit path that the CLI tells the owner about: either `brand.profile: universal` with personal on, or a "venture" sub-brand or separate repository.
4. Studio's overview counters ("Ready outputs", per-framework coverage) use the same applicability, so "0 of 9" never appears for a framework the interview considers not applicable.

**Acceptance criteria.**
- For this brand's config (`personal-brand`, facets `founder-executive` + `consultant-expert`), `brand:next` open = 0 implies that no applicable Studio framework shows a "missing" item that has no interview question behind it.
- A test fixture covers the three cases: personal without business facets, personal with business facets, and universal with personal on. In each, the CLI and Studio agree item by item on applicable / answered / missing.
- The decision on the product questions above is written down in `docs-internal/PERSONAL_BRAND.md`.

### BOS-16: Approved logos and icon do not appear in the brand book
**Priority:** 🔴 High. The logo is the first thing an owner checks, and Studio shows an empty placeholder with no actionable reason.

**Problem.** Three assets are approved (exact bytes, `status: approved`): `asset.logo.wordmark-dark` (SVG), `asset.logo.wordmark-light` (SVG) and `asset.icon.key` (PNG 1024). The brand book shows only an empty logo slot, and the icon appears nowhere.

**Root cause.**
1. **The master-logo resolution returns `ambiguous`.**
   - `packages/brand-core/src/visual/identity.ts` → `pickMaster()` picks a master in this order: (1) an asset named by **exact** asset id or manifest path in the approved `brand.logo.masters` fact, (2) an asset tagged `master`, (3) the only approved logo. With two approved logos and neither named nor tagged, the state is `ambiguous` and no logo is shown.
   - The approved `brand.logo.masters` answer is: `brand/assets/logo/ در همین مخزن (logo-omid-ataei-black.svg و logo-omid-ataei-white.svg)…`. `masterReferenceTokens()` produces the tokens `brand/assets/logo/` and `logo-omid-ataei-black.svg`. Neither equals the asset id (`asset.logo.wordmark-dark`) or the manifest path (`brand/assets/logo/logo-omid-ataei-black.svg`), so nothing matches.
   - Nothing told the owner or the agent that this answer is machine-parsed and needs an exact id or path. The question prompt is "Where will approved masters live (path, Figma, or not yet)?", which invites a folder and file names. No validation runs when it is recorded or approved.
2. **Dark and light variants are not modelled.** The two wordmarks are not competing masters. One is for light backgrounds and one for dark backgrounds (`brand.logo.variants` says so). The identity chapter has room for one master only, so a normal two-variant logo set is always `ambiguous` unless one is tagged `master`.
3. **The icon has no place in the identity chapter.** `pickMaster` considers only assets tagged `logo`. `asset.icon.key` is tagged `icon`, so it is never shown in the brand book, even though `brand.logo.variants` lists the key icon as part of the logo system (avatar, favicon, end signature).
4. **Nothing is published.** `brand/publication-policy.yaml` has `approved_asset_ids: []`, so the public edition shows no asset at all. That is correct by design, but Studio should say "approved, not published" explicitly. Today it only shows an empty slot.
5. **The chapter status says "Complete" while the logo is not drawn.**
   - Brand book chapter 06 "Logo" shows **"Complete · 5 approved · 0 draft · 1 open"**, while the same chapter says "Logo construction is waiting … Several approved logo files are registered and none is named as the master, so none is drawn."
   - A chapter whose central artefact is missing must not be "Complete".
   - Screenshot: `screenshots/BOS-16-logo-chapter-complete-but-empty.jpg`. The same screenshot also shows BOS-21: the Persian/English text under "Variants needed" renders out of order.
6. **The assets page sorts template examples first.** The three EXAMPLE placeholders and the mascot turnaround come before the three real, approved assets. A "mascot" filter is shown although the mascot module is disabled (see also BOS-12).

   The previews themselves load correctly: all three approved images return HTTP 200 and decode, and the PNG is 1024 px wide.

**Expected.**
1. When `brand.logo.masters` is recorded or approved, validate it against the asset manifest. If it names no exact asset id or path, warn and offer the matching candidates. The prompt says "name the asset id (e.g. `asset.logo.wordmark-dark`) or the manifest path".
2. Model logo variants: the master plus "on light", "on dark" and "icon / mark". Then a light/dark pair plus an icon renders as one logo system: on a light plate, on a dark plate, and the icon at favicon and avatar sizes.
3. When the state is `ambiguous` or `not_previewable`, Studio shows the reason and the one-line fix, for example: "Two approved logos and none is named as master: tag one `master` or name its asset id in brand.logo.masters". The i18n strings for this already exist (`stepMasterAmbiguous`).
4. The asset gallery and brand book label approved-but-unpublished assets as such, and show the internal preview to the owner.

**Acceptance criteria.**
- With this repo's manifest (two approved wordmarks + one approved icon), the internal brand book shows the dark wordmark on a light plate, the light wordmark on a dark plate, and the key icon, without editing any fact.
- A test checks that a `brand.logo.masters` answer of only file names (no full path) produces a validation warning that lists the matching asset ids.
- A test checks that an `ambiguous` master shows the explanation and fix in the UI, in en, fa and tr.
- A chapter with a missing or ambiguous master logo is never reported as "Complete".

### BOS-17: Approved colours and type never become design tokens
**Problem.** The owner approved `brand.color.roles` (20 roles), `brand.type.scale` (4 roles) and `brand.logo.min_size`. The Design System page shows the approved colour roles at the top. Underneath, every token is still the template example:
- "Colors · 0 approved, 19 draft": `color.brand.primary #123A73` "Template example", `color.brand.secondary #0F6E56`, `color.semantic.danger #9B2331` …
- "All tokens · 0 approved, 51 draft"

`brand/tokens/generated/` does not exist.

**Root cause.**
- The token pipeline (`brand:tokens:generate` → `brand:tokens:approve` → `brand:tokens:publish`, README lines 68 to 70 and 120) is a separate manual step. Nothing in the interview, in `brand:approve` or in Studio tells the owner or the agent that it is needed.
- `brand:approve` ends with "N approved. Nothing was published." and does not mention tokens.
- The owner's colour role names (`lime`, `dark-950`, `surface-bg-1`, `text-title` …) come from the owner's own design system. They do not match the template token ids (`color.brand.primary`, `color.light.canvas`, `color.light.text` …), so it is unclear what generation would even map. Studio shows template examples instead of saying "your approved colours are not tokens yet".

**Expected.**
1. After an approval that touches `brand.color.roles`, `brand.type.scale` or `brand.logo.min_size`, `brand:approve` prints the next step: "Run `npm run brand:tokens:generate` to turn these into draft tokens."
2. Generation maps arbitrary owner role names to token ids, and either suggests or asks for the semantic mapping (which role is primary, canvas, text, onPrimary …), for example by recording it as an interview answer.
3. When approved colour roles exist but tokens are still template examples, the Design System page says so and gives the command. It should hide the template example palette, or collapse it under "Template examples (not your brand)".

**Acceptance criteria.**
- With this repo, running `brand:tokens:generate` produces draft tokens from the 20 approved roles without hand-editing.
- The Design System page never presents template example colours next to approved brand colours without a clear separation and explanation.

Screenshot: `screenshots/BOS-17-design-tokens-template-examples.jpg`.

### BOS-18: "Verified" label is wrong for self-published and mixed claims
**Priority:** 🔴 High. The product promises honest evidence labels, and here it overstates verification.

**Problem.** Two cases show "Verified — Verified by an independent, current source" when the evidence is not independent, or covers only part of the claim.
1. **Self-published source counted as independent.** `personal.positioning.known_for` is shown as **Verified**. Its only evidence is `ev-0004`, `--source link --reference https://omidataei.com`, which is the owner's own website. In `packages/brand-core/src/evidence.ts` (around line 185), `independent` is every verification whose `source_type !== 'owner_testimony'`. So `link` and `document` count as independent even when the owner controls the source. The same applies to `ev-0002` (fiko.io) and `ev-0003` (dadvin.ir), which are the owner's own companies' websites.
2. **One verified item upgrades a mixed claim.** `personal.experience.highlights` v2 holds two claims: the N24 interview (`ev-0006`, third_party, genuinely independent) and "300+ brands" (`ev-0013`, owner_testimony). The whole answer is labelled **Verified**, so the owner-stated "300+ brands" inherits an independent-verification label.

**Expected.**
1. Record whether a source is owner-controlled. Add an `owned: true|false` flag on evidence, or a source type such as `self_published`, and have `brand:evidence add` ask or infer it, for example by matching the brand's own domains from `personal.contact.public_channels`. Owner-controlled sources show as "Owner-published", never "independent".
2. A field that bundles several claims shows the weakest status, or a per-claim breakdown. A single independent item must not make the whole field "Verified".
3. The agent guidance (`AGENTS.md`, `agent-skills/brand-interviewer/SKILL.md`) explains which source type to use for the owner's own website and companies.

**Acceptance criteria.**
- `known_for`, backed only by the owner's website, shows "Owner-published / not independently verified".
- `highlights` with one third-party and one owner-testimony item shows "Partly verified", with the owner-stated part named.
- A test covers both cases.

Screenshot: `screenshots/BOS-18-verified-label-on-owner-stated-claim.jpg`.

### BOS-19: Personal documents are fact lists and missing from the publishing gallery
**Problem.**
1. **"Professional Bio" is not a bio.**
   - The document (`/brand/personal?doc=professional-bio`) shows "Short bio / Medium bio / Long bio — Complete" with "approved text has 24 / 142 / 294 words".
   - Each section is only a stack of approved fact cards (public name, headline, known for, roles …). There is no composed paragraph the owner could paste into LinkedIn or a talk introduction.
   - The word count counts the concatenated facts, not a bio.
2. **No language edition.** The cards mix languages in one "bio": the English headline, the Persian `known_for`, the English outcome, the Persian expertise. The brand supports fa, en and tr, and the owner approved a localized headline, but there is no per-locale document.
3. **Personal documents are missing from the Publishing gallery.**
   - `/governance/documents` lists Brand Book, Visual identity, Business Model Canvas, Mascot atlas, Competitor analysis, Business plan and Marketing plan.
   - It does not list the nine personal documents that are actually complete: Personal Brand Book, Professional Bio, LinkedIn Pack, Website Content Pack, Media Kit, Content Strategy, Portfolio Pack, Services & Offer Pack, Evidence Register.
   - The Command Center's "Exports ready 2 of 14" therefore ignores the most complete part of this brand.

**Expected.**
1. Bio and pack documents give a composed draft per locale, built only from approved facts (`draft_personal_content` already exists for agents). It is clearly labelled as a draft for owner approval and never invented. The fact cards stay as "Sources".
2. Personal documents appear in the Publishing gallery with the same audience × readiness model, and count in "Exports ready".

**Acceptance criteria.**
- For a brand with `modules.personal.enabled`, the Publishing gallery lists the personal documents.
- The Professional Bio offers fa, en and tr editions, each containing only facts approved for that language, or marked untranslated.

### BOS-20: Studio shows the slug-style name "omid ataei" instead of the approved name
**Problem.** The sidebar brand switcher, the breadcrumb ("My brands › omid ataei") and the GitHub & Claude Code page header show **"omid ataei"** in lower case. The approved `personal.identity.public_name` is "Omid Ataei", and `brand.config.yaml` has `brand.name: Omid Ataei` with `name_status: approved`. The brand page title already uses "Omid Ataei", so the two are inconsistent.

**Root cause (likely).** The Studio registry stores the name the wizard captured at creation and never updates it from the synced projection.

**Expected.** Display names come from the synced, approved `brand.name`. The registry value is used only before the first sync.

**Acceptance criteria.** After a sync where `brand.name` changed and is approved, every Studio surface shows the new name.

### BOS-21: Mixed Persian and English text renders out of order
**Problem.**
- Approved values that mix Persian with Latin words, file names or URLs are rendered in the left-to-right English UI without bidi isolation. Words, parentheses and punctuation appear out of order. Example: brand book chapter 06, "Variants needed": `Wordmark تیره (logo-omid-ataei-black.svg) برای پس‌زمینهٔ روشن؛ …` renders scrambled.
- The same happens in the "Demonstrable results" card, where a URL sits inside a Persian sentence.

**Expected.**
- Every rendered fact value uses `dir="auto"` (or `<bdi>`), so the browser picks the paragraph direction from the content.
- Inline Latin runs (file names, URLs, product names) are isolated with `unicode-bidi: isolate`.
- Persian values keep RTL alignment inside the English UI.

**Acceptance criteria.**
- The browser test suite (`tests/studio-browser.test.ts`) gets a fixture with mixed fa/en values (including parentheses, a file name and a URL).
- That fixture renders in logical order in both the en and fa UI.

Screenshots: `screenshots/BOS-16-logo-chapter-complete-but-empty.jpg` (Variants needed) and `screenshots/BOS-18-verified-label-on-owner-stated-claim.jpg` (URL inside Persian text).
