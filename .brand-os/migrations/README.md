# Template migrations

Versioned migrations for breaking changes in template-owned (core) files. `npm run template:update` and Studio's **Open update PR** run every migration that is new since the brand's recorded template commit, in file-name order, and list them in the commit message and the pull request.

- One JSON file per migration: `NNNN-short-name.json` (four digits, then lowercase words). Never rename or edit a released migration; add a new one.
- Data, not code: Studio runs migrations on files downloaded from GitHub and never executes anything from them.
- Core files only. A migration that names a brand-owned, shared (merge-carefully) or unlisted path is refused and the whole update stops.
- Idempotent. A file that is already gone is skipped; running a migration again changes nothing.

```json
{
  "schema_version": 1,
  "version": "0.3.0",
  "description": "Remove the old build script.",
  "operations": [{ "op": "delete", "path": "scripts/old-build.ts", "sha256": ["<sha256 of an earlier template copy>"] }]
}
```

`delete` removes the brand's copy only when it matches the template file at the starting or target commit, or one of the listed SHA-256 hashes. Any other copy was edited by the brand and is listed under *Needs a person*. Details: `docs/template-sync.md`.
