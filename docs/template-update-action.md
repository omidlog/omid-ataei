# Template update action

An optional way for a brand repository to get Brand OS template updates on its own, without Studio. It is the workflow `.github/workflows/template-update.yml`, which every brand repository already has because it comes with the template. It does nothing until you add one secret.

If you use Studio's **Open update PR** or its periodic check, you do not need this. Both can be on at the same time and there is still only one update pull request: Studio links any open update pull request instead of opening one, and this action opens nothing when one for the latest template is open, whoever opened it (an older one it replaces, as below).

## What it does

Once a week (Monday morning, UTC) and whenever you press **Run workflow** on the Actions tab, it:

1. Reads the latest Brand OS template, using the secret below.
2. Works out the update exactly like `npm run template:update`: template files the brand never edited are updated, shared files are merged, brand files are never touched, and anything that needs a person is listed.
3. Keeps **one** update pull request open:
   - already up to date: does nothing;
   - an update pull request for the latest template is already open: does nothing and links it;
   - otherwise: puts the update on a new branch `template-update/<commit>` and opens a pull request. If an older update pull request is still open, it is closed with a link to the new one (its branch is kept).

It never pushes to `main`, never force-pushes, never merges and never changes anything under `brand/` except the template version record. You review and merge the pull request yourself.

## Turn it on

1. **Create a token that can read the template.** On GitHub: *Settings → Developer settings → Fine-grained personal access tokens → Generate new token*. Resource owner: the account that owns the template. Repository access: only the template repository. Permissions: **Contents: Read-only** (Metadata: read is added for you). Pick an expiry date and write it down.
2. **Add it to the brand repository.** In the brand repository: *Settings → Secrets and variables → Actions → New repository secret*. Name: `BRAND_OS_TEMPLATE_TOKEN`. Value: the token.
3. **Let Actions open pull requests.** In the brand repository: *Settings → Actions → General → Workflow permissions*: choose **Read and write permissions** and tick **Allow GitHub Actions to create and approve pull requests**. (The workflow only creates; it never approves or merges.)
4. **Try it.** *Actions → Template update → Run workflow.* The log ends with what it did and a link to the pull request.

Without the secret the workflow still runs on schedule, prints *Template update is off* and stops. Nothing is changed.

## Optional: a second token for pull requests

Two GitHub limits apply to the built-in token the workflow uses for the brand repository:

- it cannot push changes to files under `.github/workflows/`. When an update changes a workflow file, the action stops with a clear message and pushes nothing;
- checks (the `validate` workflow) do not start on a pull request it opens. Close and reopen the pull request to start them.

To remove both limits, add a second secret `BRAND_OS_PR_TOKEN`: a fine-grained token for **the brand repository only** with **Contents: Read and write**, **Pull requests: Read and write** and **Workflows: Read and write**. The action then pushes and opens the pull request with it.

## Settings

- `BRAND_OS_TEMPLATE_TOKEN` (secret, required to turn it on): reads the template.
- `BRAND_OS_PR_TOKEN` (secret, optional): pushes the branch and opens the pull request instead of the built-in token.
- `BRAND_OS_TEMPLATE_REPOSITORY` (variable, optional): `owner/name` of the template, when it is not the one in `.brand-os/sync.json`.

To change the schedule, edit the `cron` line in the workflow. Note that the workflow is a template file: a later template update may change it back, and the change is then listed under *Needs a person*.

## When it stops

- *Template update is off*: the secret is missing.
- *does not contain commit*: the template token cannot see the commit this brand records, or the template history was rewritten. Check the token and the template repository name.
- *changes workflow files*: add `BRAND_OS_PR_TOKEN` or use Studio's **Open update PR**.
- *Branch … already exists*: someone closed an update pull request but kept its branch. Delete the branch and run it again.

How template sync works in general: `docs/template-sync.md`.
