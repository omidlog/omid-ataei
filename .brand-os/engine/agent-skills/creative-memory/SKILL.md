# Creative memory

## Goal
While the owner reviews reels, posts, mascot visuals or graphics with you, record why variants were chosen or rejected, with the owner's exact words, so a later session can retrieve the reasons with citations. You record and retrieve. You never approve, publish, post or buy anything.

## Scope
The current brand checkout, run as the owner (no `BRAND_OS_AGENT_TOKEN`; every command refuses under one). Feedback words live in the Knowledge Inbox; creative records only cite them. Guide: `docs-internal/CREATIVE_LEARNING.md`. Knowledge rules: `agent-skills/knowledge-inbox/SKILL.md`.

## Tools
`npm run brand:creative -- <command> --json`: `learn` (one-step correction), `project`, `variant`, `feedback`, `select`, `suggest`, `approve` (owner only), `preferences`, `show`, `list`, `context`, `aspects suggest|list|approve|reject` (approve owner only), `share`.

As an MCP agent with a `creative-read` token (not in the checkout), call the read-only `creative_context` tool instead. It returns approved preferences and cited reasons only; local note text comes back as `quote_withheld: local_note`. Do not ask the owner for more access to work around that.

## Process
1. **Start with context.** Before designing, run `context --surface <s> --series <name>` (or `--project <id>`). Follow `brand_rules` and `preferences.applied`. Use `references` as cited examples. Treat `not_applied` as history or unverified drafts. Quote provenance (`knowledge:kn_…@…`) when you rely on an item.
2. **Register real variants only.** `variant --asset <manifest id>` if the file is in `brand/assets/asset-manifest.yaml`, otherwise `--asset missing`. Never invent files, paths or URLs.
3. **Record the owner's exact words.** `feedback --text "<verbatim, original language>" --source-kind agent_capture` for something said in this conversation. Pick `--verdict` and `--keep`/`--avoid` aspects, and confirm them with the owner. Do not paraphrase in the note.
4. **Selection is not approval.** `select` records the owner's choice for this project only. Never describe it as published, approved brand-wide, or best-performing. There is no performance data.
5. **Suggest, don't decide.** `suggest` a short preference citing the owner's notes (never research notes), with counterexamples. Tell the owner it is a draft and that only they can run `approve` with their approval proof. Default scope is the project. Use `--scope series` only if the owner names it. Brand-wide rules go through `brand:knowledge propose` → `brand:review` → `brand:approve`.
6. **Changed mind.** Capture the new words as a note, then `suggest --supersedes cp_…`. The old preference stays applied until the owner approves the new one, and it stays on disk for audit.
7. **Aspects from the words.** After recording feedback without aspects, you may run `aspects suggest --project <id>` and show the owner the pending suggestions. Only the owner runs `aspects approve` (with their proof) or `aspects reject`. Never present a pending suggestion as the owner's decision.
8. **Sharing to Studio.** Only on the owner's request: `share --id cp_… --dry-run`, show the preview, then `share --id cp_…`. Never commit or push it yourself unless asked; the owner merges the pull request.
9. **Stale sources.** If context shows `stale`, `archived`, `needs_review` or `invalid_approval`, say so and ask the owner. Don't rely on it silently.

## Learning from corrections (one step)
When the owner corrects or edits something you made — a narration script, a voice or delivery note, word choice, an image, a caption — record it in the same turn, before moving on. Don't wait for "save this".

- **MCP agent (Cowork, Claude chat):** call `creative_learn` with `surface` (`narration`, `image`, `video`, `reel`, `caption`, …), `series` (a stable name such as `explainer-reels`), `feedback` (the owner's words, verbatim), `before` / `after` when there is text, a `rule` (≤200 chars, an instruction a later session can follow without the conversation) and `keep` / `avoid` aspects (`voice`, `diction`, `tone`, `pacing`, `composition`, `style`, …).
- **In the checkout (Claude Code):** `npm run brand:creative -- learn --surface narration --series explainer-reels --text "<owner words>" [--before-file b.txt --after-file a.txt] --rule "<rule>" --avoid diction --json`.

It writes local, gitignored files only (`brand/.private`). There is nothing to commit, so a missing git, a cloud-synced or read-only checkout never blocks it. Do not write your own guide file (for example `NARRATION.md`) in another repository instead.

The rule is a **draft**. Tell the owner in one line: "Saved as a draft rule. Approve it with `npm run brand:approve -- --all-pending` and every later <surface>/<series> piece will follow it." Apply it yourself for the rest of this conversation. A later correction of the same point: pass `supersedes: cp_…`.

## Never
Copy note text into statements or descriptions beyond a short label. Link restricted notes. Read another brand's records. Claim a variant performed best. Treat a selection or preference as permission to post, publish or buy ads.
