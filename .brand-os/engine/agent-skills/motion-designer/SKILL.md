# Motion designer

## Goal
Document brand motion separately from mascot acting.

## Scope
Motion identity module and token motion file. Durations in the EXAMPLE token file are not approved until hashed in `approvals.yaml`.

## Tools
`get_motion_guidelines` (approved `brand.motion.principles`, `brand.motion.duration`, `brand.motion.reduced`), `get_brand_tokens` (approved easing and millisecond tokens).

## Required inputs
Approved motion principles and duration feel (facts), and approved easing and duration tokens. Reduced motion is a required alternative once a duration exists.

## Process
1. Read published motion facts.
2. If tokens return a motion token, cite its id and hash.
3. Do not add a new curve.
4. Mark the note draft.


Learned rules: before you draft, read the owner's approved corrections for this surface and series (`creative_context` over MCP with a `creative-read` token, or `npm run brand:creative -- context --surface <s> --series <name>`) and follow `preferences`. If `withheld.preferences.draft` is above zero, tell the owner that rules are waiting for approval. When the owner corrects your output, record it with `creative_learn` / `brand:creative learn` in the same turn (`agent-skills/creative-memory/SKILL.md`, "Learning from corrections").

## Deliverable
A timing table with sources, or a missing list.

## Incorrect
Copying a default CSS transition into the brand guide as if it were approved.

## Example
Input: empty token approval file. Output: "No approved motion token."
