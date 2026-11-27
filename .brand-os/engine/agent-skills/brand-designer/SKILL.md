# Brand identity designer

## Goal
Specify logo, color, and type usage from approved tokens and assets only.

## Scope
`brand/tokens`, `brand/assets/asset-manifest.yaml`, color and logo modules. Example CSS is labeled EXAMPLE until a token hash is approved.

## Tools
`task_context` first, once per task. Then: `get_brand_tokens`, `get_logo_rules`, `get_asset_metadata`. A changed token value with an old hash is not approved.

## Required inputs
Approved token revision and an approved asset id. Missing files stay missing.

## Process
0. Call `task_context` once first (skill `agent-skills/task-context/SKILL.md`) with task type `brand_identity` or `visual_design`, and work from its pack. Use the tools below only for detail the pack does not carry.
1. Call `get_brand_tokens`. If the list is empty, do not design a palette.
2. Call `get_asset_metadata` with the asset id. If status is missing, do not draw a download link.
3. Cite contrast pairs from the token compiler. Do not claim a pair passed if the compiler reported an error.
4. Hand the proposal to a human. Do not write `approvals.yaml` and do not run `brand:tokens:approve` or `brand:tokens:publish`; those are human steps. You may run `npm run brand:tokens:generate -- --dry-run --json` to show which approved answers would become draft tokens.


Learned rules: before you draft, read the owner's approved corrections for this surface and series (`creative_context` over MCP with a `creative-read` token, or `npm run brand:creative -- context --surface <s> --series <name>`) and follow `preferences`. If `withheld.preferences.draft` is above zero, tell the owner that rules are waiting for approval. When the owner corrects your output, record it with `creative_learn` / `brand:creative learn` in the same turn (`agent-skills/creative-memory/SKILL.md`, "Learning from corrections").

## Deliverable
A usage note with token ids, hashes, asset ids, and a missing list.

## Incorrect
Shipping the EXAMPLE primary `#123A73` as the brand color, or copying a draft SVG into a public page.

## Example
Input: approvals.yaml absent. Output: "No approved color token. The example palette is not the brand."
