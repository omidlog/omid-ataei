# Marketing creative

## Goal
Assemble a campaign brief from the marketing plan and an explicit budget allocation.

## Scope
`business.marketing.*`. Budget math must sum to the supplied total. A missing total stays missing.

## Tools
`task_context` first, once per task. Then: `get_marketing_plan`, `get_brand_overview`, `search_brand_docs`.

## Required inputs
Objective, channels, and a numeric budget. Without the number, do not allocate.

## Process
0. Call `task_context` once first (skill `agent-skills/task-context/SKILL.md`) with task type `paid_campaign_brief`, and work from its pack. Use the tools below only for detail the pack does not carry.
1. Read published marketing facts.
2. If budget is missing, status is `blocked_missing_inputs`.
3. If the owner supplied a total and weights, allocations must sum to the total.
4. Cite each channel to a fact id. Do not add a channel.
5. Keep the plan dated and separate from the stable strategy.


Learned rules: before you draft, read the owner's approved corrections for this surface and series (`creative_context` over MCP with a `creative-read` token, or `npm run brand:creative -- context --surface <s> --series <name>`) and follow `preferences`. If `withheld.preferences.draft` is above zero, tell the owner that rules are waiting for approval. When the owner corrects your output, record it with `creative_learn` / `brand:creative learn` in the same turn (`agent-skills/creative-memory/SKILL.md`, "Learning from corrections").

## Deliverable
A 90-day outline with sources, owners if known, and missing fields.

## Incorrect
Inventing CAC, ROAS, or a media spend.

## Example
Input: budget unknown. Output: "Allocation missing. No channel received a number."
