# Template sync

How a fix in the Brand OS template reaches every brand repository, in plain words.

**Status: complete.** All six parts below are built and tested with local git repositories and a fake GitHub. It has not yet run against real GitHub: go through *Before turning this on for real* first.

## The idea

There is one template repository and one private repository per brand. Each brand repository started as a copy of the template. When the template gets a fix or a feature, every brand should get it too, without anyone copying files by hand and without losing anything the brand wrote.

So the template's files are split into three kinds, written down in `.brand-os/sync.json`:

- **Core** files belong to the template: scripts, packages, the Studio and docs apps, schemas, workflows, agent skills, internal docs, tests. An update replaces them.
- **Brand** files belong to the brand: everything under `brand/`, plus docs data the build generates from the brand. An update never touches them.
- **Merge-carefully** files are shared: `package.json`, `package-lock.json`, `.gitignore`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `CHANGELOG.md`. An update merges the template change into the brand's copy line by line and stops at the first real conflict.

A path that no rule matches is treated as a brand file and left alone.

Each brand repository also records which template commit it came from, in `brand/template-version.json`. Studio writes it when it creates a brand, `brand:init` writes it too, and `template:update` moves it forward.

## What an update does

1. Look at the commit the brand recorded and the latest template commit.
2. List the files the template changed between those two commits.
3. For each changed file:
   - brand file: skip it and say so;
   - core file the brand never edited: take the template's version;
   - core file the brand did edit: leave it alone and report a conflict for a person to look at;
   - merge-carefully file: merge both sides; a clean merge is applied, a conflict is reported.
4. Run the template's **migrations** that are new since the brand's recorded commit (see below).
5. Put the result on a **new branch** with one commit, never on `main`.
6. A person reviews and merges the pull request. Nothing is merged automatically.

## Migrations

Most template changes are just new versions of files, and steps 1 to 3 handle them. Sometimes a change needs a little more, for example removing an old template file that a brand still has but that the normal comparison does not see. For that the template ships **migrations** in `.brand-os/migrations/`:

- Each migration is a small JSON file with a number, such as `0001-remove-old-build.json`. They run in number order.
- A migration runs once per brand: only migrations that are new since the brand's recorded template commit run. Running one again changes nothing.
- A migration may only touch template-owned (core) files. If one names a brand file or a shared file, the update stops and nothing is written.
- Today a migration can do one thing: **delete** a core file. It deletes the brand's copy only if the brand never edited it. An edited copy is left alone and listed under *Needs a person*.
- Migrations are plain data, not programs, so Studio can run them safely.
- `template:update` and Studio's update pull request both run them, and both list them, in order, with what each one did: *applied*, *nothing to do* or *needs a person*.

How to write one: `.brand-os/migrations/README.md`.

## Running it yourself

From a brand repository, with a local clone of the template next to it:

```sh
npm run template:update -- --template ../brand-os-template          # dry run: prints what would change
npm run template:update -- --template ../brand-os-template --apply  # creates branch template-update/<sha> and commits
```

Options: `--to <ref>` picks a template commit or tag (default: the template's `HEAD`), `--base <sha>` sets the starting commit when the brand has no record yet, `--branch <name>` names the branch, `--json` prints the plan as JSON. The command never pushes; push the branch and open a pull request as usual. It exits with code 2 when some files need a person, so scripts notice.

## Studio does it for you

The template repository is private, so a brand repository's own `GITHUB_TOKEN` cannot read it. Studio already holds a GitHub token for creating brands, so Studio does the cross-repository work:

- Studio shows **Updates available** on the brand list and on a brand's Overview when its recorded commit is behind the template. If GitHub is slow or rate-limited, it says *Template not checked* and tries again later.
- **Open update PR** (owner only) does what `template:update --apply` does, through the GitHub API: core files the brand never edited are updated, shared files are merged, brand files are skipped, and files that need a person are listed in the pull request. The result is one commit on a new branch `template-update/<sha>` and one pull request.
- If an update pull request is already open, Studio links it instead of opening another.
- Studio **opens** update pull requests and never merges them. This is Studio's second permitted write, after creating a new private repository. It never writes brand files (apart from moving `brand/template-version.json` forward), facts, approvals or the default branch. Every request is recorded in Studio's audit log.
- **Periodic check.** Studio checks every brand against the template on its own, every 6 hours by default (`STUDIO_TEMPLATE_CHECK_MINUTES`; `0` turns it off). By default it only checks, so the brand list shows **Updates available** without anyone opening the page. Set `STUDIO_TEMPLATE_AUTO_PR=1` and it also opens the update pull request for each brand that is behind. It keeps at most one open update pull request per brand: if one is open, it links it and opens nothing. If GitHub fails or limits requests, it waits longer before trying again. Each run is written to the audit log.

## Or let the brand repository do it (optional)

For brands that do not use Studio, every brand repository has a **Template update** GitHub Action (`.github/workflows/template-update.yml`, a template file). Once a week and when you press **Run workflow**, it does what **Open update PR** does, from inside the brand repository, and keeps one update pull request open. It needs a repository secret, `BRAND_OS_TEMPLATE_TOKEN`, that can read the private template; without it the workflow prints *Template update is off* and does nothing. It never pushes to `main`, never merges and never touches brand files. Studio and the Action can both be on and still leave one update pull request: Studio links any open update pull request instead of opening one, and the Action opens nothing when one for the latest template is open (an older one it replaces and closes).

Setup, step by step: `docs/template-update-action.md`.

## How it is tested

Besides the unit tests for each part, `tests/template-sync-e2e.test.ts` runs the whole story with a fake brand and no network: create a brand from a template, change the template (a core file, a shared file, a template copy of a brand file, a migration), let the Action open the update pull request, merge it, and check that the brand's record moved forward and the next update is empty. Brand files are compared before and after every step and never change.

## Before turning this on for real

- [ ] **Studio's provisioning token** (`STUDIO_GITHUB_PROVISION_TOKEN`) has **Contents: Read and write** and **Pull requests: Read and write** on the brand repositories (the allowlisted owner), and can read the template. Without Pull requests write, **Open update PR** reports that it could not open the pull request.
- [ ] Every brand repository has a `brand/template-version.json` with a real template commit. A brand without one shows *No template record*: run `npm run template:update -- --template <template clone> --base <commit>` once.
- [ ] Try **Open update PR** by hand on one brand first, read the pull request, and merge it yourself.
- [ ] Only then decide on `STUDIO_TEMPLATE_AUTO_PR`. It is `0` (check only) by default; `1` makes the periodic check open update pull requests on its own, at most one open per brand.
- [ ] Brand repositories that use the Action instead: add `BRAND_OS_TEMPLATE_TOKEN` (template **Contents: Read-only**), allow Actions to create pull requests, and add `BRAND_OS_PR_TOKEN` (brand repository **Contents**, **Pull requests** and **Workflows: Read and write**) if updates may change workflow files. See `docs/template-update-action.md`.
- [ ] Write down when each token expires.

## Plan

| Chunk | What | Status |
| --- | --- | --- |
| 1 | Manifest (`.brand-os/sync.json`), template version record, `template:update` CLI with dry run and apply on a new branch, tests with throwaway git repositories | Done in part 1 |
| 2 | Studio: record the template commit at creation, **Updates available** indicator, **Open update PR** through the GitHub API (mocked in tests); document the second write | Done |
| 3 | Studio periodic job: check every brand and open at most one open update PR per brand; skip when one is already open. Opening is off unless `STUDIO_TEMPLATE_AUTO_PR=1` | Done |
| 4 | Versioned migrations for breaking changes (`.brand-os/migrations/NNNN-name.json`: ordered, run once, core files only, data not code), run by `template:update` and Studio and listed in the commit and PR | Done |
| 5 | Optional brand-side GitHub Action ("Template update", `workflow_dispatch` and weekly) for owners who add the `BRAND_OS_TEMPLATE_TOKEN` secret; keeps one update pull request open; off without the secret | Done |
| 6 | Fake-brand end-to-end test: create, change template, update PR, merge locally, second update is empty | Done |
