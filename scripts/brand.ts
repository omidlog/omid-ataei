import './cli-errors-install.js'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { stdin as input, stdout as output } from 'node:process'
import { applyInit, backupBrand, CHANGE_DEPTHS, IDENTITY_INTENTS, InterviewEngine, LOGO_PRESENCE, migrateBrand, readSyncManifest, RESET_CONFIRMATION, resetInterviewState, restoreBrand, tokenNextStep, validateIdentityChoice } from '@brand-os/brand-core'
import { checkLogoMastersInRepo } from '@brand-os/brand-core'
import type { BatchResult, IntakeReport, LogoMastersCheck, NextReport, ReviewQueue, Selection } from '@brand-os/brand-core'
import { coachAfterAnswer, coachBeforeApproval, renderAfterAnswer, renderBeforeApproval, type CoachMomentResult } from '@brand-os/brand-core/coach'
import { readOwnerProof } from './proof.js'

const [command, ...rest] = process.argv.slice(2)

/** brand:init --template-commit <sha>: the template commit this brand was created from (for template:update). */
function templateFromFlag(commit: string | undefined) {
  if (commit === undefined) return undefined
  if (!/^[0-9a-f]{7,64}$/.test(commit)) {
    console.error('--template-commit needs a git commit id (hex).')
    process.exit(1)
  }
  const manifest = readSyncManifest(process.cwd())
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as { version?: string }
  return { repository: manifest?.template.repository ?? null, commit, version: pkg.version ?? null, source: 'brand:init' }
}
const root = process.cwd()
const engine = new InterviewEngine(root)
/** One help line for every command that takes the proof. No placeholder sits next to the `<` redirect. */
const PROOF_HELP =
  'The approval proof is read from BRAND_OS_APPROVAL_PROOF, piped stdin (append: < brand/.private/approval-secret), the macOS Keychain (npm run brand:doctor -- --store-proof-keychain), or a hidden prompt. Never from argv.'

if (command === 'init') {
  const { values } = parseArgs({
    args: rest,
    options: {
      name: { type: 'string' },
      slug: { type: 'string' },
      industry: { type: 'string', default: 'TBD' },
      sector: { type: 'string' },
      language: { type: 'string', default: 'en' },
      languages: { type: 'string', default: 'en' },
      website: { type: 'string' },
      mascot: { type: 'string', default: 'false' },
      gamification: { type: 'string', default: 'false' },
      publish: { type: 'string', default: 'private' },
      profile: { type: 'string', default: 'universal' },
      personal: { type: 'string' },
      facets: { type: 'string' },
      yes: { type: 'boolean', default: false },
      reset: { type: 'boolean', default: false },
      'template-commit': { type: 'string' },
      // Optional identity intake: an unapproved owner hint, never an approved fact. Without these flags nothing is written.
      'logo-presence': { type: 'string' },
      'identity-intent': { type: 'string' },
      'change-depth': { type: 'string' },
    },
  })
  if (!values.name || !values.slug) {
    console.error('brand:init needs --name and --slug. Example: npm run brand:init -- --name "Northwind" --slug northwind --yes')
    process.exit(1)
  }
  if (!values.yes) {
    console.error('Refusing to reset interview state without --yes.')
    process.exit(1)
  }
  const identityFlags = values['logo-presence'] !== undefined || values['identity-intent'] !== undefined || values['change-depth'] !== undefined
  const identityChoice = { logo_presence: values['logo-presence'], identity_intent: values['identity-intent'], change_depth: values['change-depth'] }
  if (identityFlags) {
    const checked = validateIdentityChoice(identityChoice)
    if (!checked.ok) {
      console.error(`Identity intake refused (${Object.entries(checked.errors).map(([field, code]) => `${field}: ${code}`).join(', ')}). Nothing was written.`)
      console.error(`--logo-presence ${LOGO_PRESENCE.join('|')}; --identity-intent ${IDENTITY_INTENTS.join('|')}; --change-depth ${CHANGE_DEPTHS.join('|')} (only with evolve or rebrand). "absent" cannot be kept, "present" is not created anew, and a logo evolution needs a logo.`)
      process.exit(2)
    }
  }
  const config = applyInit(root, {
    name: values.name,
    slug: values.slug,
    industry: values.industry ?? 'TBD',
    sector: values.sector,
    language: values.language ?? 'en',
    languages: (values.languages ?? 'en').split(',').map((item) => item.trim()),
    website: values.website ?? null,
    mascot: values.mascot === 'true',
    gamification: values.gamification === 'true',
    publish: values.publish === 'public' ? 'public' : 'private',
    profile: values.profile,
    personal: values.personal === undefined ? undefined : values.personal === 'true',
    facets: values.facets ? values.facets.split(',').map((item) => item.trim()).filter(Boolean) : [],
    reset: values.reset === true,
    template: templateFromFlag(values['template-commit']),
    identity: identityFlags ? { choice: identityChoice, source: 'brand_init' } : undefined,
  })
  const personal = config.modules.personal
  console.log(`Initialized ${config.brand.name} (${config.brand.slug}). Profile ${config.brand.profile}. Mascot ${config.modules.mascot.enabled ? 'on' : 'off'}. Personal ${personal?.enabled ? `on${personal.facets.length ? ` (${personal.facets.join(', ')})` : ''}` : 'off'}.`)
  const identity = config.onboarding?.identity
  if (identity) console.log(`Identity intake (unapproved owner hint, not a brand fact): logo ${identity.logo_presence}, intent ${identity.identity_intent}${identity.change_depth ? `, depth ${identity.change_depth}` : ''}.`)
  console.log(engine.statusText())
} else if (command === 'interview' || command === 'resume') {
  const { values } = parseArgs({
    args: rest,
    options: {
      batch: { type: 'string' },
      question: { type: 'string' },
      answer: { type: 'string' },
      // BOS-04: propose a replacement for an approved fact without the interactive prompt.
      change: { type: 'string' },
      reason: { type: 'string' },
      // BOS-06: the value came from an agent and the owner confirmed it.
      origin: { type: 'string' },
      'suggested-by': { type: 'string' },
      json: { type: 'boolean', default: false },
      assist: { type: 'boolean', default: false },
      text: { type: 'string' },
      file: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      // Visual V3.1: list questions (repeating_entity). One item operation per call; see entityCommand below.
      entity: { type: 'string' },
      item: { type: 'string' },
      field: { type: 'string', multiple: true },
      links: { type: 'string' },
      // Visual V3.2: source references on SWOT, TOWS and Value Proposition Canvas items.
      sources: { type: 'string' },
      position: { type: 'string' },
    },
  })
  if (values.entity !== undefined) {
    await entityCommand(values)
  } else if (values.assist) {
    // Free-text turn: a configured model (or deterministic rules) proposes drafts. Nothing is approved.
    const { assistTurn, resolveProvider } = await import('@brand-os/brand-core')
    let text: string
    if (values.text !== undefined) text = values.text
    else if (values.file) text = values.file === '-' ? await readAllStdin() : fs.readFileSync(path.resolve(values.file), 'utf8')
    else if (input.isTTY) {
      const rl = readline.createInterface({ input, output })
      text = await rl.question('Tell me about the business in your own words (one paragraph):\n> ')
      rl.close()
    } else text = await readAllStdin()
    const resolved = resolveProvider(engine)
    const result = await assistTurn(engine, text, {
      provider: resolved.provider,
      reason: resolved.reason,
      limits: resolved.limits,
      dryRun: values['dry-run'],
      source: { kind: values.file && values.file !== '-' ? 'imported_text' : 'interview_turn', ref: values.file && values.file !== '-' ? path.basename(values.file) : 'assist' },
    })
    if (values.json) {
      console.log(JSON.stringify({ ok: result.mode !== 'refused', mode: result.mode, provider: result.provider, reason: result.reason, provider_error: result.provider_error, report: result.report }, null, 2))
    } else {
      console.log(`${result.mode === 'model' ? 'Model' : result.mode === 'fallback' ? 'Deterministic rules' : 'Refused'}: ${result.reason}`)
      if (result.report) console.log(formatIntake(result.report))
    }
    if (result.mode === 'refused') process.exit(1)
  } else if (values.batch) {
    const answers = JSON.parse(fs.readFileSync(path.resolve(values.batch), 'utf8')) as Record<string, string>
    let steps = 0
    while (steps < 500) {
      const current = engine.current()
      if (!current) break
      const raw = answers[current.id]
      if (raw === undefined) break
      const result = engine.submit(raw)
      console.log(`\n${current.id}\n${result.message}`)
      if (result.kind === 'error' || result.kind === 'exit') break
      steps += 1
    }
    console.log(`\n${engine.statusText()}`)
  } else if (values.change !== undefined) {
    await changeCommand(values)
  } else if (values.question !== undefined || values.answer !== undefined) {
    // Agent mode: answer any question by id, in any order. Same commands as the interactive interview.
    if (!values.question || values.answer === undefined) {
      console.error('Usage: brand:interview --question QUESTION_ID --answer "TEXT | unknown | skip | n/a | estimate: …" [--origin agent_suggestion] [--json]')
      console.error('       brand:interview --question QUESTION_ID --change "NEW VALUE" [--reason "WHY"] [--json]')
      process.exit(2)
    }
    const origin = answerOrigin(values.origin, values['suggested-by'])
    const { dispositionFor, nextReport } = await import('@brand-os/brand-core')
    const question = engine.question(values.question)
    if (question?.sensitivity === 'restricted' && !dispositionFor(values.answer)) {
      // Restricted values must not travel through argv (shell history, process list) or an agent's context.
      const message = `${values.question} is restricted. Answer it yourself in the interactive interview (npm run brand:interview). Nothing was recorded.`
      if (values.json) console.log(JSON.stringify({ ok: false, kind: 'error', question_id: values.question, message }, null, 2))
      else console.error(message)
      process.exit(1)
    }
    const result = engine.answerQuestion(values.question, values.answer, { origin })
    const ok = result.kind === 'recorded'
    // Coach moment 1 (docs-internal/COACH_UX_DECISION.md): advisory, never blocks, silent unless it has one note.
    const coach = ok ? afterAnswerCoach(result.questionId ?? values.question) : null
    // BOS-16: brand.logo.masters is machine-read; say at once when it names no asset exactly. A warning, never a block.
    const logoMasters = ok && (result.questionId ?? values.question) === 'brand.logo.masters' ? logoMastersCheck(values.answer) : null
    if (values.json) {
      const upcoming = nextReport(engine, { limit: 3 })
      console.log(
        JSON.stringify(
          {
            ok,
            kind: result.kind,
            question_id: result.questionId ?? values.question,
            status: result.status ?? null,
            origin,
            message: result.message,
            impact: result.impact ?? null,
            next: upcoming.next.map((item) => ({ id: item.id, prompt: item.prompt, reasons: item.reasons })),
            conflicts: upcoming.conflicts.length,
            coach,
            ...(logoMasters ? { logo_masters: logoMasters } : {}),
          },
          null,
          2,
        ),
      )
    } else {
      console.log(result.message)
      if (logoMasters?.message) console.error(`warning: ${logoMasters.message}`)
      if (coach?.shown) console.log(renderAfterAnswer(coach))
    }
    if (!ok) process.exit(1)
  } else {
    await interactive()
  }
} else if (command === 'next') {
  const { values } = parseArgs({
    args: rest,
    options: {
      json: { type: 'boolean', default: false },
      limit: { type: 'string', default: '5' },
      profile: { type: 'string' },
      locale: { type: 'string' },
    },
  })
  const { nextReport } = await import('@brand-os/brand-core')
  const locale = values.locale === 'fa' || values.locale === 'tr' || values.locale === 'en' ? values.locale : undefined
  const report = nextReport(engine, { limit: Number.parseInt(values.limit ?? '5', 10) || 5, profile: values.profile, locale })
  if (values.json) console.log(JSON.stringify(report, null, 2))
  else console.log(formatNext(report))
} else if (command === 'propose') {
  const { values } = parseArgs({
    args: rest,
    options: {
      file: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
  })
  if (!values.file) {
    console.error('Usage: brand:propose --file <batch.json | -> [--dry-run] [--json]')
    console.error('Stores schema-valid proposals as drafts with provenance. It never approves or publishes.')
    process.exit(2)
  }
  const { applyProposalBatch, parseProposalBatch } = await import('@brand-os/brand-core')
  let parsedJson: unknown
  try {
    const text = values.file === '-' ? await readAllStdin() : fs.readFileSync(path.resolve(values.file), 'utf8')
    parsedJson = JSON.parse(text)
  } catch (error) {
    console.error(`Could not read a JSON proposal batch: ${error instanceof SyntaxError ? 'invalid JSON' : 'file not readable'}. Nothing was stored.`)
    process.exit(2)
  }
  const parsed = parseProposalBatch(parsedJson)
  if (!parsed.ok) {
    if (values.json) console.log(JSON.stringify({ ok: false, errors: parsed.errors }, null, 2))
    else console.error(`Proposal batch rejected. Nothing was stored.\n${parsed.errors.map((line) => `- ${line}`).join('\n')}`)
    process.exit(1)
  }
  const report = applyProposalBatch(engine, parsed.batch, { origin: 'agent', dryRun: values['dry-run'], dropped: parsed.dropped })
  console.log(values.json ? JSON.stringify(report, null, 2) : formatIntake(report))
} else if (command === 'status') {
  console.log(engine.statusText())
} else if (command === 'review') {
  const { values } = parseArgs({
    args: rest,
    options: {
      module: { type: 'string' },
      ids: { type: 'string' },
      all: { type: 'boolean', default: false },
      full: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
  })
  if (values.full) {
    console.log(engine.reviewText(false))
  } else {
    const queue = withSelectionErrors(() => engine.approvals().reviewQueue(selectionFrom(values), { includeSettled: values.all || Boolean(values.ids) }))
    console.log(values.json ? JSON.stringify(queue, null, 2) : formatQueue(queue))
  }
} else if (command === 'validate') {
  const { validateRepo } = await import('@brand-os/brand-core')
  const report = validateRepo(root)
  if (!report.ok) {
    console.error(report.errors.join('\n'))
    process.exit(1)
  }
  console.log('Brand validation passed.')
} else if (command === 'export') {
  const { values } = parseArgs({ args: rest, options: { public: { type: 'boolean', default: false } } })
  const snapshot = engine.exportSnapshot(values.public ? 'public' : 'full')
  const dir = path.join(root, 'brand', 'exports')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, values.public ? 'public-snapshot.json' : 'latest-snapshot.json')
  fs.writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`)
  console.log(`Wrote ${path.relative(root, file)}. Full snapshots can contain restricted answers and are gitignored.`)
} else if (command === 'evidence') {
  // Evidence & rights register for personal claims. add/list/withdraw are open; verify/reject need the owner proof.
  const [action, ...args] = rest
  const { values } = parseArgs({
    args,
    options: {
      claim: { type: 'string' },
      kind: { type: 'string', default: 'verification' },
      source: { type: 'string' },
      reference: { type: 'string' },
      quote: { type: 'string' },
      note: { type: 'string' },
      'granted-by': { type: 'string' },
      scope: { type: 'string' },
      'review-due': { type: 'string' },
      owned: { type: 'boolean', default: false },
      id: { type: 'string' },
      ids: { type: 'string' },
      reason: { type: 'string' },
      json: { type: 'boolean', default: false },
      proof: { type: 'string' },
    },
  })
  if (values.proof !== undefined) {
    console.error('--proof is not accepted on the command line. Nothing was changed.')
    process.exit(2)
  }
  const { addEvidence, readEvidence, claimVerification, publicationBlockers } = await import('@brand-os/brand-core')
  try {
    if (action === 'add') {
      if (!values.claim || !values.source || !values.reference) {
        console.error('Usage: brand:evidence add --claim <question id> --source owner_testimony|document|public_record|third_party|link --reference <url or where it is held> [--owned] [--kind verification|permission] [--scope public|internal] [--granted-by <role or organization>] [--quote <text>] [--note <text>] [--review-due YYYY-MM-DD]. --owned marks a source the owner controls (their own website or company); a reference on the brand\'s own domains is marked owned automatically.')
        process.exit(2)
      }
      const item = addEvidence(root, engine.questions(), {
        claim_id: values.claim,
        kind: values.kind as 'verification' | 'permission',
        source_type: values.source as 'owner_testimony',
        reference: values.reference,
        quote: values.quote ?? null,
        note: values.note ?? null,
        granted_by: values['granted-by'] ?? null,
        scope: (values.scope as 'public' | 'internal' | undefined) ?? null,
        review_due: values['review-due'] ?? null,
        recorded_by: process.env.BRAND_OS_AGENT_TOKEN ? 'agent' : 'owner',
        owned: values.owned,
      })
      const ownedNote = item.owned
        ? values.owned
          ? ' Marked owner-published: it never counts as independent verification.'
          : ' The reference is on one of the brand\'s own domains, so it was marked owner-published: it never counts as independent verification.'
        : ''
      console.log(values.json ? JSON.stringify(item, null, 2) : `Recorded ${item.id} for ${item.claim_id} as pending.${ownedNote} The owner verifies it with brand:evidence verify --id ${item.id}.`)
    } else if (action === 'verify' || action === 'reject') {
      // One proof for one or several ids: --id ev-0001,ev-0002 or --ids ev-0001,ev-0002.
      const ids = [...new Set([values.id, values.ids].filter((entry): entry is string => Boolean(entry)).flatMap((entry) => entry.split(',')).map((entry) => entry.trim()).filter(Boolean))]
      if (ids.length === 0) {
        console.error(`Usage: brand:evidence ${action} --id ev-0001[,ev-0002…] (or --ids) [--reason "WHY"]. ${PROOF_HELP}`)
        process.exit(2)
      }
      if (process.env.BRAND_OS_AGENT_TOKEN) {
        console.error('Evidence review is a human action. Run it from a shell without an agent token.')
        process.exit(2)
      }
      const proof = await readApprovalProof()
      let failed = false
      for (const id of ids) {
        try {
          const result = engine.approvals().reviewEvidence(id, action === 'verify' ? 'verified' : 'rejected', proof, values.reason ?? null)
          console.log(result.message + (result.unpublished.length ? ` Unpublished: ${result.unpublished.join(', ')}.` : ''))
          if (!result.ok) {
            failed = true
            // A rejected proof fails every id the same way; stop instead of repeating it.
            break
          }
        } catch (error) {
          failed = true
          console.error(`${id}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      if (failed) process.exit(1)
    } else if (action === 'withdraw') {
      if (!values.id || !values.reason) {
        console.error('Usage: brand:evidence withdraw --id ev-0001 --reason <why>')
        process.exit(2)
      }
      const result = engine.approvals().withdrawEvidence(values.id, values.reason)
      engine.rebuildDrafts()
      console.log(result.message)
    } else if (action === 'list' || action === undefined) {
      const items = readEvidence(root).filter((item) => !values.claim || item.claim_id === values.claim)
      if (values.json) console.log(JSON.stringify(items, null, 2))
      else if (items.length === 0) console.log('No evidence recorded.')
      else for (const item of items) console.log(`${item.id} ${item.status.padEnd(9)} ${item.kind.padEnd(12)} ${item.source_type.padEnd(15)} ${item.claim_id} — ${item.reference}${item.review_due ? ` (review by ${item.review_due})` : ''}`)
    } else if (action === 'check') {
      const now = new Date()
      const items = readEvidence(root)
      const claims = engine.questions().filter((question) => question.publication_requires?.length && (!values.claim || question.id === values.claim))
      for (const question of claims) {
        const blockers = publicationBlockers(question, null, items, now)
        console.log(`${question.id}: ${claimVerification(question, items, now)}${blockers.length ? ` — blocked: ${blockers.join(' ')}` : ' — eligible after approval'}`)
      }
    } else {
      console.error('Usage: brand:evidence list|add|verify|reject|withdraw|check')
      process.exit(2)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
} else if (command === 'retract') {
  const { values } = parseArgs({ args: rest, options: { question: { type: 'string' }, reason: { type: 'string' }, proof: { type: 'string' } } })
  if (values.proof !== undefined) {
    console.error('--proof is not accepted on the command line. Nothing was changed.')
    process.exit(2)
  }
  if (!values.question || !values.reason) {
    console.error('Usage: brand:retract --question <id> --reason <why>. Removes an approved claim, unpublishes it and rebuilds drafts. Needs the owner proof.')
    process.exit(2)
  }
  if (process.env.BRAND_OS_AGENT_TOKEN) {
    console.error('Retraction is a human action. Run it from a shell without an agent token.')
    process.exit(2)
  }
  const step = engine.approvals().retract(values.question, await readApprovalProof(), values.reason)
  console.log(step.message)
  if (step.kind === 'error') process.exit(1)
} else if (command === 'approve' || command === 'publish') {
  const { values } = parseArgs({
    args: rest,
    options: {
      module: { type: 'string' },
      ids: { type: 'string' },
      question: { type: 'string' },
      actor: { type: 'string', default: 'owner' },
      unpublish: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      // BOS-01: everything pending (facts, change proposals, evidence, draft assets) with one proof.
      'all-pending': { type: 'boolean', default: false },
      exclude: { type: 'string' },
      // Declared only so it can be refused without echoing its value.
      proof: { type: 'string' },
    },
  })
  if (values.proof !== undefined) {
    console.error(`--proof is not accepted: a secret on the command line leaks into shell history and the process list. Nothing was changed.`)
    console.error(PROOF_HELP)
    process.exit(2)
  }
  if (process.env.BRAND_OS_AGENT_TOKEN) {
    console.error(`brand:${command} refuses to run while BRAND_OS_AGENT_TOKEN is set. Approval and publication are human actions; run them from a shell without an agent token.`)
    process.exit(2)
  }
  if (command === 'publish' && (values.question || values['all-pending'])) {
    console.error('brand:publish takes --ids or --module.')
    process.exit(2)
  }
  if (values['all-pending']) {
    if (values.module || values.ids || values.question) {
      console.error('--all-pending takes no --module, --ids or --question. Use --exclude id,… to leave items out.')
      process.exit(2)
    }
    await approveAllPendingCommand({ dryRun: values['dry-run'], json: values.json, exclude: values.exclude, actor: values.actor ?? 'owner' })
    process.exit(process.exitCode ?? 0)
  }
  if (values.exclude !== undefined) {
    console.error('--exclude works with --all-pending only.')
    process.exit(2)
  }
  const ids = [values.ids, values.question].filter(Boolean).join(',')
  const selection = selectionFrom({ module: values.module, ids: ids || undefined })
  if (!selection.module && !selection.ids?.length) {
    console.error(
      command === 'approve'
        ? 'Usage: brand:approve --module MODULE_ID | --ids ID,chg-… | --all-pending [--exclude ID,…] [--actor owner] [--dry-run] [--json]'
        : 'Usage: brand:publish --module MODULE_ID | --ids ID,… [--unpublish] [--dry-run] [--json]',
    )
    console.error(PROOF_HELP)
    process.exit(2)
  }
  const approvals = engine.approvals()
  if (command === 'approve') {
    const queue = withSelectionErrors(() => approvals.reviewQueue(selection, { includeSettled: Boolean(selection.ids) }))
    // Coach moment 2: notes on the drafts in this batch, before the proof prompt. Text mode only, on stderr, never
    // blocking; the approve JSON contract is unchanged.
    const coachNotes = values.json ? '' : beforeApprovalCoach(queue)
    if (values['dry-run']) {
      // BOS-07: a preview, never the review queue and never an approval result.
      const { dryRunReport, formatDryRun } = await import('@brand-os/brand-core')
      const report = dryRunReport(withSelectionErrors(() => approvals.approvalPlan(selection, { actor: values.actor ?? 'owner' })))
      console.log(values.json ? JSON.stringify(report, null, 2) : formatDryRun(report))
      if (coachNotes) console.error(coachNotes)
      process.exit(0)
    }
    if (coachNotes) console.error(`${coachNotes}\n`)
    // BOS-16: approving a brand.logo.masters answer that names no asset exactly leaves the brand book without a master.
    const mastersDraft = queue.items.find((item) => item.question_id === 'brand.logo.masters' && item.action !== 'none')
    const mastersText = mastersDraft ? (mastersDraft.changes.find((change) => !change.stale)?.proposed_value ?? mastersDraft.draft?.value) : null
    const mastersCheck = typeof mastersText === 'string' ? logoMastersCheck(mastersText) : null
    if (mastersCheck?.message) console.error(`warning: ${mastersCheck.message}\n`)
    if (!values.json) console.error(`About to approve ${queue.pending} item(s) as ${values.actor ?? 'owner'}. Approval does not publish.`)
    const proof = await readApprovalProof()
    const result = withSelectionErrors(() => approvals.approveBatch(selection, proof, values.actor ?? 'owner'))
    console.log(values.json ? JSON.stringify(result, null, 2) : formatBatch(result))
    // BOS-17: approving a token source (color roles, semantic map, type scale, logo size) leaves the draft tokens
    // out of date. Say what to run next; nothing is generated here. Text mode only: the JSON contract is unchanged.
    const nextStep = values.json ? null : tokenNextStep(result.results.filter((item) => item.outcome === 'approved').map((item) => item.question_id))
    if (nextStep) console.log(nextStep)
    if (!result.ok) process.exit(1)
  } else {
    if (values['dry-run']) {
      const queue = withSelectionErrors(() => approvals.reviewQueue(selection, { includeSettled: true }))
      console.log(values.json ? JSON.stringify(queue, null, 2) : formatQueue(queue))
      process.exit(0)
    }
    const proof = await readApprovalProof()
    const result = withSelectionErrors(() => approvals.publish(selection, proof, { unpublish: values.unpublish }))
    if (values.json) console.log(JSON.stringify(result, null, 2))
    else {
      for (const item of result.results) console.log(`${item.outcome.padEnd(11)} ${item.id}  ${item.reason}`)
      console.log(result.proof === 'rejected' ? 'Proof rejected. Nothing was changed.' : `${result.changed} change(s) written to the publication allowlist.`)
    }
    if (!result.ok) process.exit(1)
  }
} else if (command === 'query') {
  const { values } = parseArgs({
    args: rest,
    options: {
      tool: { type: 'string' },
      query: { type: 'string', default: '' },
      kind: { type: 'string' },
      module: { type: 'string' },
      ids: { type: 'string' },
      emotion: { type: 'string' },
      stage: { type: 'string' },
      'use-case': { type: 'string' },
      angle: { type: 'string' },
      section: { type: 'string' },
      id: { type: 'string' },
      'pin-revision': { type: 'string' },
      'pin-sha': { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      channel: { type: 'string' },
      week: { type: 'string' },
      slot: { type: 'string' },
      lang: { type: 'string' },
      'task-type': { type: 'string' },
      request: { type: 'string' },
      mode: { type: 'string' },
      count: { type: 'string' },
      locale: { type: 'string' },
      'output-format': { type: 'string' },
      'scope-id': { type: 'string' },
      'include-unapproved': { type: 'boolean', default: false },
    },
  })
  if (values['include-unapproved']) {
    console.error('--include-unapproved is ignored. It grants nothing: drafts, EXAMPLE tokens, and internal facts are never returned by this flag.')
  }
  const core = await import('@brand-os/brand-core')
  // Same resolution as the MCP server: the token comes from the environment, never from argv.
  let ctx
  try {
    ctx = core.resolveAgentContext(root, engine.config().brand.slug, process.env[core.AGENT_TOKEN_ENV])
  } catch (error) {
    console.error(error instanceof core.AgentTokenError ? error.message : 'Agent token resolution failed.')
    process.exit(1)
  }
  const tool = values.tool ?? 'get_brand_status'
  const q = values.query ?? ''
  const handlers: Record<string, () => unknown> = {
    brand_retrieve: () => {
      const kind = values.kind ?? 'facts'
      if (!(core.RETRIEVE_KINDS as readonly string[]).includes(kind)) {
        console.error(`--kind must be one of: ${core.RETRIEVE_KINDS.join(', ')}`)
        process.exit(1)
      }
      return core.brandRetrieve(engine, ctx, {
        kind: kind as (typeof core.RETRIEVE_KINDS)[number],
        module: values.module,
        ids: values.ids ? values.ids.split(',').map((id) => id.trim()).filter(Boolean) : undefined,
        query: q || undefined,
        filters: { emotion: values.emotion, stage: values.stage, use_case: values['use-case'], angle: values.angle },
      })
    },
    search_brand_docs: () => core.searchBrandDocs(engine, q, ctx),
    get_brand_tokens: () => core.getBrandTokens(engine, ctx),
    list_mascot_assets: () => core.listMascotAssets(engine, ctx),
    list_mascot_stages: () => core.listMascotStages(engine, ctx),
    search_mascot_assets: () => core.searchMascotAssets(engine, q, ctx),
    get_design_component: () => core.getDesignComponent(engine, q || 'button', ctx),
    get_social_template: () => core.getSocialTemplate(engine, q || 'unspecified', ctx),
    get_asset_metadata: () => core.getAssetMetadata(engine, q, ctx),
    get_brand_overview: () => core.getBrandOverview(engine, ctx),
    get_brand_guidelines: () => core.getBrandGuidelines(engine, ctx),
    get_logo_rules: () => core.getLogoRules(engine, ctx),
    get_mascot_guidelines: () => core.getMascotGuidelines(engine, ctx),
    get_mascot_profile: () => core.getMascotProfile(engine, ctx),
    get_motion_guidelines: () => core.getMotionGuidelines(engine, ctx),
    get_marketing_plan: () => core.getMarketingPlan(engine, ctx),
    get_business_plan: () => core.getBusinessPlan(engine, ctx),
    get_brand_status: () => core.getBrandStatus(engine, ctx),
    draft_personal_content: () => core.draftPersonalContent(engine, q || 'professional-bio', ctx, values.section),
    // Strategy Feed (strategy-seo-read / strategy-ads-read tokens): the same gate as the MCP tools.
    strategy_list: async () => (await import('@brand-os/brand-core/strategy')).runStrategyTool(root, engine.config().brand.slug, ctx, 'strategy_list'),
    strategy_get: async () => {
      const pin = values['pin-revision'] || values['pin-sha'] ? { revision: values['pin-revision'] ? Number(values['pin-revision']) : undefined, content_sha256: values['pin-sha'] } : undefined
      return (await import('@brand-os/brand-core/strategy')).runStrategyTool(root, engine.config().brand.slug, ctx, 'strategy_get', { strategy_id: values.id, pin })
    },
    /**
     * Task Context Engine (docs-internal/TASK_CONTEXT.md). Read-only, one owner-issued token, one pack.
     * `--request` runs the deterministic en/fa/tr classifier (shared with the MCP tool, `runTaskContextTool`): the text
     * is classified and dropped, never stored, logged or copied into the pack. An unclear request returns
     * `need_task_type` instead of a guess.
     */
    task_context: () =>
      core.runTaskContextTool(
        engine,
        ctx,
        {
          request: values.request,
          task_type: values['task-type'],
          channel: values.channel,
          deliverable_count: values.count,
          locale: values.locale,
          request_mode: values.mode,
          output_format: values['output-format'],
          scope_id: values['scope-id'],
        },
        { taskTypeHint: '--task-type' },
      ),
    // Content Bridge (content-read tokens): the same gate as the MCP tools. Reads only; reports go through MCP content_report.
    content_calendar: async () =>
      (await import('@brand-os/brand-core/content-bridge')).runContentTool(root, engine.config().brand.slug, ctx, 'content_calendar', { from: values.from, to: values.to, channel: values.channel, lang: values.lang }),
    content_brief: async () => {
      const pin = values['pin-revision'] || values['pin-sha'] ? { revision: values['pin-revision'] ? Number(values['pin-revision']) : undefined, content_sha256: values['pin-sha'] } : undefined
      return (await import('@brand-os/brand-core/content-bridge')).runContentTool(root, engine.config().brand.slug, ctx, 'content_brief', { week_id: values.week, slot_id: values.slot, pin, lang: values.lang })
    },
  }
  const handler = handlers[tool]
  if (!handler) {
    console.error(`Unknown tool ${tool}. Tools: ${Object.keys(handlers).sort().join(', ')}`)
    process.exit(1)
  }
  console.log(JSON.stringify(await handler(), null, 2))
} else if (command === 'agent-token') {
  const [action, ...tokenArgs] = rest
  const { values } = parseArgs({
    args: tokenArgs,
    options: { profile: { type: 'string' }, label: { type: 'string' }, id: { type: 'string' }, json: { type: 'boolean', default: false } },
  })
  const core = await import('@brand-os/brand-core')
  if (!['issue', 'list', 'revoke'].includes(action ?? '')) {
    console.error('Usage: brand:agent-token issue --profile <internal-read|design|marketing|finance|knowledge-read|creative-read|strategy-seo-read|strategy-ads-read|content-read> --label <name> | list | revoke --id <agt_…>')
    console.error(PROOF_HELP)
    process.exit(1)
  }
  const proof = await readApprovalProof()
  if (!core.approvalProofMatches(root, proof)) {
    console.error('Approval proof rejected. Agent tokens are managed by the owner only. Nothing was changed.')
    process.exit(1)
  }
  if (action === 'issue') {
    if (!core.isAgentProfile(values.profile)) {
      console.error(`--profile must be one of: ${Object.keys(core.AGENT_PROFILES).join(', ')}`)
      process.exit(1)
    }
    const issued = core.issueAgentToken(root, { brandId: engine.config().brand.slug, profile: values.profile, label: values.label ?? '' })
    if (values.json) {
      console.log(JSON.stringify({ ...issued.record, token: issued.token }, null, 2))
    } else {
      console.log(`Issued ${issued.record.id} (${issued.record.profile}) for ${issued.record.brand_id}.`)
      console.log('Token (shown once, store it in your agent host as BRAND_OS_AGENT_TOKEN; only its hash is kept):')
      console.log(issued.token)
    }
  } else if (action === 'list') {
    const tokens = core.listAgentTokens(root)
    if (values.json) console.log(JSON.stringify(tokens, null, 2))
    else if (tokens.length === 0) console.log('No agent tokens issued.')
    else for (const item of tokens) console.log(`${item.id}  ${item.profile.padEnd(13)} ${item.revoked ? 'revoked ' : 'active  '} ${item.created_at}  ${item.label}`)
  } else {
    if (!values.id) {
      console.error('Need --id <agt_…>.')
      process.exit(1)
    }
    const revoked = core.revokeAgentToken(root, values.id)
    if (!revoked) {
      console.error(`No token ${values.id}.`)
      process.exit(1)
    }
    console.log(`Revoked ${revoked.id}. Restart any MCP server that was started with it.`)
  }
} else if (command === 'doctor') {
  const { values } = parseArgs({
    args: rest,
    options: {
      json: { type: 'boolean', default: false },
      'create-approval-secret': { type: 'boolean', default: false },
      // Opt-in macOS Keychain storage of the approval proof (BOS-01). The value is never printed.
      'store-proof-keychain': { type: 'boolean', default: false },
      'forget-proof-keychain': { type: 'boolean', default: false },
    },
  })
  const { ensureApprovalSecret, forgetKeychainProof, formatDoctor, runDoctor, storeKeychainProof } = await import('@brand-os/brand-core')
  if (values['create-approval-secret']) {
    // Creates the file only when absent. The value is never printed; read it locally when you approve.
    ensureApprovalSecret(root)
    if (!values.json) console.log('Approval secret is at brand/.private/approval-secret (mode 0600). Its value is not printed.')
  }
  if (values['store-proof-keychain'] || values['forget-proof-keychain']) {
    if (values['store-proof-keychain'] && values['forget-proof-keychain']) {
      console.error('Choose --store-proof-keychain or --forget-proof-keychain, not both.')
      process.exit(2)
    }
    if (process.env.BRAND_OS_AGENT_TOKEN) {
      console.error('Keychain storage of the approval proof is an owner action. Refusing while BRAND_OS_AGENT_TOKEN is set. Nothing was changed.')
      process.exit(2)
    }
    const slug = engine.config().brand.slug
    const stored = values['store-proof-keychain'] ? storeKeychainProof(root, slug) : forgetKeychainProof(slug)
    if (values.json) console.log(JSON.stringify({ keychain: stored }, null, 2))
    else console.log(stored.message)
    if (!stored.ok) process.exit(1)
    process.exit(0)
  }
  const report = runDoctor(root)
  console.log(values.json ? JSON.stringify(report, null, 2) : formatDoctor(report))
  if (!report.ok) process.exit(1)
} else if (command === 'document') {
  const { values } = parseArgs({
    args: rest,
    options: {
      type: { type: 'string', default: 'brand-book' },
      audience: { type: 'string', default: 'internal' },
      json: { type: 'boolean', default: false },
    },
  })
  const { buildNamedDocument, DOCUMENT_KINDS, renderDocumentMarkdown } = await import('@brand-os/brand-core')
  const kind = DOCUMENT_KINDS.find((item) => item === values.type)
  if (!kind || (values.audience !== 'internal' && values.audience !== 'public')) {
    console.error(`Usage: brand:document --type ${DOCUMENT_KINDS.join('|')} [--audience internal|public] [--json]`)
    process.exit(2)
  }
  if (values.audience === 'internal' && process.env.BRAND_OS_AGENT_TOKEN) {
    // The internal edition includes drafts. Agents read approved knowledge through brand_retrieve instead.
    console.error('The internal edition includes drafts and is for the owner. With an agent token, use --audience public or brand:query.')
    process.exit(2)
  }
  const model = buildNamedDocument(engine, kind, values.audience)
  console.log(values.json ? JSON.stringify(model, null, 2) : renderDocumentMarkdown(model))
} else if (command === 'tokens:generate') {
  const { values } = parseArgs({ args: rest, options: { json: { type: 'boolean', default: false }, 'dry-run': { type: 'boolean', default: false } } })
  const { generateTokens } = await import('@brand-os/brand-core')
  const report = generateTokens(root, engine.config().brand.slug, { dryRun: values['dry-run'] })
  if (values.json) console.log(JSON.stringify(report, null, 2))
  else {
    for (const source of report.sources) console.log(`${source.state.padEnd(12)} ${source.question_id}`)
    for (const token of report.tokens) console.log(`${token.outcome.padEnd(16)} ${token.id}  ${token.reason}`)
    const semantic = report.semantic
    for (const item of semantic.applied) console.log(`mapped           ${item.token_id} = ${item.role}  From approved ${semantic.question_id}.`)
    for (const problem of semantic.problems) console.log(`problem          ${semantic.question_id}: ${problem}`)
    if (semantic.suggestions.length > 0) {
      console.log(`\nSuggested mapping for ${semantic.question_id} (NOT applied; the template ids stay template examples until you approve an answer):`)
      for (const item of semantic.suggestions) console.log(`  ${item.slot.padEnd(12)} = ${item.role.padEnd(16)} ${item.reason}`)
      console.log(`Review and edit it, then record it as a draft answer and approve it:\n  ${semantic.answer_command}\n`)
    }
    console.log(report.files.length ? `Wrote ${report.files.join(', ')}` : report.dry_run ? 'Dry run. Nothing was written.' : 'No token files changed.')
    console.log(report.note)
  }
  if (!report.ok) process.exit(1)
} else if (command === 'tokens:approve' || command === 'tokens:publish') {
  const { values } = parseArgs({
    args: rest,
    options: {
      ids: { type: 'string' },
      actor: { type: 'string', default: 'owner' },
      unpublish: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      // Declared only so it can be refused without echoing its value.
      proof: { type: 'string' },
    },
  })
  if (values.proof !== undefined) {
    console.error('--proof is not accepted: a secret on the command line leaks into shell history and the process list. Nothing was changed.')
    process.exit(2)
  }
  if (process.env.BRAND_OS_AGENT_TOKEN) {
    console.error(`brand:${command} refuses to run while BRAND_OS_AGENT_TOKEN is set. Token approval and publication are human actions.`)
    process.exit(2)
  }
  const ids = (values.ids ?? '').split(',').map((id) => id.trim()).filter(Boolean)
  if (ids.length === 0) {
    console.error(`Usage: brand:${command} --ids <token.id,…>${command === 'tokens:publish' ? ' [--unpublish]' : ' [--actor owner]'} [--json]`)
    console.error(PROOF_HELP)
    process.exit(2)
  }
  const { approveTokens, publishTokens } = await import('@brand-os/brand-core')
  const proof = await readApprovalProof()
  const result = command === 'tokens:approve' ? approveTokens(root, ids, proof, values.actor ?? 'owner') : publishTokens(root, ids, proof, { unpublish: values.unpublish })
  if (values.json) console.log(JSON.stringify(result, null, 2))
  else {
    if (result.proof === 'rejected') console.log('Proof rejected. Nothing was changed.')
    for (const error of result.errors) console.error(error)
    for (const item of result.results) console.log(`${item.outcome.padEnd(11)} ${item.id}  ${item.reason}`)
  }
  if (!result.ok) process.exit(1)
} else if (command === 'assets') {
  const [sub, ...args] = rest
  if (sub === 'check') {
    const { values } = parseArgs({ args, options: { ids: { type: 'string' }, json: { type: 'boolean', default: false } } })
    const { checkAssets } = await import('@brand-os/asset-catalog')
    const ids = values.ids ? values.ids.split(',').map((id) => id.trim()).filter(Boolean) : undefined
    const reports = checkAssets(root, ids)
    if (values.json) console.log(JSON.stringify({ ok: reports.every((report) => report.ok), assets: reports }, null, 2))
    else {
      for (const report of reports) {
        console.log(`${(report.ok ? 'ok' : report.fixable ? 'fixable' : 'refused').padEnd(8)} ${report.id}  ${report.path}`)
        for (const issue of report.issues) console.log(`         ${issue.fixable ? 'fixable' : 'blocks '} ${issue.code}${issue.line ? ` line ${issue.line}` : ''}: ${issue.message}`)
        for (const warning of report.warnings) console.log(`         warning ${warning.code}${warning.line ? ` line ${warning.line}` : ''}: ${warning.message}`)
        if (report.fix) console.log(`         fix: ${report.fix}`)
        else if (!report.ok) console.log('         fix: not automatic. Fix the source file and export it again.')
      }
      const failing = reports.filter((report) => !report.ok).length
      console.log(reports.length === 0 ? 'No SVG assets in the manifest.' : `${reports.length} SVG asset(s) checked, ${failing} not publishable.`)
    }
    if (reports.some((report) => !report.ok)) process.exit(1)
  } else if (sub === 'normalize') {
    const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { id: { type: 'string' }, 'dry-run': { type: 'boolean', default: false }, json: { type: 'boolean', default: false } } })
    const ids = [...(values.id ? [values.id] : []), ...positionals]
    if (ids.length === 0) {
      console.error('Usage: brand:assets normalize <asset.id> [more ids] [--dry-run] [--json]')
      process.exit(2)
    }
    const { normalizeAsset } = await import('@brand-os/asset-catalog/normalize')
    const reports = []
    for (const id of ids) reports.push(await normalizeAsset(root, id, { dryRun: values['dry-run'] }))
    if (values.json) console.log(JSON.stringify({ ok: reports.every((report) => report.ok), assets: reports }, null, 2))
    else {
      for (const report of reports) {
        console.log(`${report.outcome.padEnd(15)} ${report.id}  ${report.reason}`)
        if (report.original && report.outcome !== 'unchanged') console.log(`                original kept at ${report.original}`)
        if (report.checksum_before && report.checksum_after && report.checksum_before !== report.checksum_after) console.log(`                sha256 ${report.checksum_before.slice(0, 12)}… -> ${report.checksum_after.slice(0, 12)}…`)
        if (report.render_check) console.log(`                render check: ${report.render_check.result} (${report.render_check.renderer}${report.render_check.width ? `, ${report.render_check.width}x${report.render_check.height}` : ''})${report.render_check.detail ? ` ${report.render_check.detail}` : ''}`)
        for (const issue of report.issues ?? []) console.log(`                ${issue.code}${issue.line ? ` line ${issue.line}` : ''}: ${issue.message}`)
      }
      if (reports.some((report) => report.approval === 'reset')) console.log('An approval was reset. The owner approves the new file with: npm run brand:assets -- approve --ids <id>')
    }
    if (reports.some((report) => !report.ok)) process.exit(1)
  } else if (sub === 'add') {
    // BOS-03: agents may add; the record is always a draft and only the owner approves it (brand:assets approve).
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        id: { type: 'string' },
        name: { type: 'string' },
        kind: { type: 'string' },
        tags: { type: 'string' },
        visibility: { type: 'string' },
        license: { type: 'string' },
        render: { type: 'string' },
        size: { type: 'string' },
        normalize: { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
      },
    })
    const file = positionals[0]
    if (!file || !values.id || !values.name || positionals.length > 1) {
      console.error('Usage: brand:assets add <file> --id <asset.id> --name "…" [--kind logo|icon|mascot|illustration|photo|motion|audio] [--tags a,b] [--visibility public|internal] [--license "…"] [--normalize | --render png [--size 1024]] [--dry-run] [--json]')
      process.exit(2)
    }
    if (values.visibility !== undefined && values.visibility !== 'public' && values.visibility !== 'internal') {
      console.error('--visibility must be public or internal.')
      process.exit(2)
    }
    if (values.render !== undefined && values.render !== 'png') {
      console.error('--render supports png only.')
      process.exit(2)
    }
    const size = values.size === undefined ? undefined : Number(values.size)
    const { addAsset } = await import('@brand-os/asset-catalog/manage')
    const report = await addAsset(root, file, {
      id: values.id,
      name: values.name,
      kind: values.kind,
      tags: values.tags ? values.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
      visibility: values.visibility as 'public' | 'internal' | undefined,
      license: values.license,
      render: values.render as 'png' | undefined,
      size,
      normalize: values.normalize,
      dryRun: values['dry-run'],
    })
    if (values.json) console.log(JSON.stringify(report, null, 2))
    else {
      console.log(`${report.outcome.padEnd(9)} ${report.id}${report.path ? `  ${report.path}` : ''}`)
      console.log(`          ${report.reason}`)
      if (report.original) console.log(`          original kept at ${report.original}`)
      if (report.checksum_sha256) console.log(`          sha256 ${report.checksum_sha256}  ${report.mime ?? ''}`)
      if (report.verdict) {
        console.log(`          publication check: ${report.verdict.publishable ? 'publishable' : 'refused'}`)
        for (const issue of report.verdict.issues) console.log(`          ${issue.fixable ? 'fixable' : 'blocks '} ${issue.code}${issue.line ? ` line ${issue.line}` : ''}: ${issue.message}`)
        for (const warning of report.verdict.warnings) console.log(`          warning ${warning.code}${warning.line ? ` line ${warning.line}` : ''}: ${warning.message}`)
      }
      for (const fix of report.fixes ?? []) console.log(`          fix: ${fix}`)
      for (const error of report.validation ?? []) console.log(`          validate: ${error}`)
    }
    if (!report.ok) process.exit(1)
  } else if (sub === 'prune-examples') {
    const { values } = parseArgs({ args, options: { 'dry-run': { type: 'boolean', default: false }, json: { type: 'boolean', default: false } } })
    const { pruneExampleAssets } = await import('@brand-os/asset-catalog/manage')
    const report = pruneExampleAssets(root, { dryRun: values['dry-run'], modules: { mascot: engine.config().modules.mascot.enabled === true } })
    if (values.json) console.log(JSON.stringify(report, null, 2))
    else {
      if (report.items.length === 0) console.log('No template example assets in the manifest.')
      for (const item of report.items) {
        console.log(`${item.outcome.padEnd(13)} ${item.id}  ${item.reason}`)
        for (const file of item.files) console.log(`              ${item.outcome === 'removed' ? 'deleted' : 'would delete'} ${file}`)
      }
      if (values['dry-run']) console.log('Dry run: nothing was changed.')
      else if (report.items.some((item) => item.outcome === 'removed')) console.log('Run npm run validate, then commit the manifest and the removed files.')
    }
  } else if (sub === 'approve') {
    const { values } = parseArgs({
      args,
      options: {
        ids: { type: 'string' },
        actor: { type: 'string', default: 'owner' },
        json: { type: 'boolean', default: false },
        // Declared only so it can be refused without echoing its value.
        proof: { type: 'string' },
      },
    })
    if (values.proof !== undefined) {
      console.error('--proof is not accepted: a secret on the command line leaks into shell history and the process list. Nothing was changed.')
      process.exit(2)
    }
    if (process.env.BRAND_OS_AGENT_TOKEN) {
      console.error('brand:assets approve refuses to run while BRAND_OS_AGENT_TOKEN is set. Asset approval is a human action.')
      process.exit(2)
    }
    const ids = (values.ids ?? '').split(',').map((id) => id.trim()).filter(Boolean)
    if (ids.length === 0) {
      console.error('Usage: brand:assets approve --ids <asset.id,…> [--actor owner] [--json]')
      console.error(PROOF_HELP)
      process.exit(2)
    }
    const { approveAssets } = await import('@brand-os/brand-core')
    const result = approveAssets(root, ids, await readApprovalProof(), values.actor ?? 'owner')
    if (values.json) console.log(JSON.stringify(result, null, 2))
    else {
      if (result.proof === 'rejected') console.log('Proof rejected. Nothing was changed.')
      for (const item of result.results) console.log(`${item.outcome.padEnd(10)} ${item.id}  ${item.reason}`)
    }
    if (!result.ok) process.exit(1)
  } else {
    console.error('Usage: brand:assets check [--ids <asset.id,…>] [--json]')
    console.error('       brand:assets approve --ids <asset.id,…> [--actor owner] [--json]   (owner only; proof never on argv)')
    console.error('       brand:assets normalize <asset.id> [--dry-run] [--json]')
    console.error('       brand:assets add <file> --id <asset.id> --name "…" [--kind …] [--tags a,b] [--visibility public|internal] [--normalize | --render png [--size 1024]] [--dry-run] [--json]')
    console.error('       brand:assets prune-examples [--dry-run] [--json]')
    process.exit(sub ? 1 : 0)
  }
} else if (command === 'finance') {
  const { values } = parseArgs({ args: rest, options: { input: { type: 'string' }, json: { type: 'boolean', default: false } } })
  if (!values.input) {
    console.error('Usage: brand:finance --input <file outside the repository | restricted:<name>> [--json]')
    console.error('Inputs inside the checkout must be gitignored and untracked, for example brand/restricted/finance/<name>.yaml.')
    process.exit(2)
  }
  const { FinanceInputError, FinanceInputPathError, formatFinanceReport, runFinanceFile } = await import('@brand-os/brand-core')
  try {
    // Results are printed locally only. Nothing is written to the repository or sent to a model provider.
    const report = runFinanceFile(root, values.input)
    console.log(values.json ? JSON.stringify(report, null, 2) : formatFinanceReport(report))
  } catch (error) {
    if (error instanceof FinanceInputError) {
      console.error('Finance input is invalid:')
      for (const message of error.errors) console.error(`  - ${message}`)
    } else if (error instanceof FinanceInputPathError) console.error(error.message)
    else throw error
    process.exit(1)
  }
} else if (command === 'backup') {
  const saved = backupBrand(root)
  console.log(`Backed up ${saved.files.length} files to ${path.relative(root, saved.directory)}`)
} else if (command === 'restore') {
  const { values } = parseArgs({ args: rest, options: { from: { type: 'string' } } })
  if (!values.from) {
    console.error('Need --from <backup-directory>.')
    process.exit(1)
  }
  const restored = restoreBrand(root, path.resolve(values.from))
  console.log(`Restored ${restored.restored.length} files.`)
} else if (command === 'migrate') {
  const migrated = migrateBrand(root)
  console.log(`Migrated ${migrated.from} -> ${migrated.to}. Fact values and module prose were not rewritten.`)
  if (migrated.mascot.changed.length > 0) console.log(`Mascot lifecycle: ${migrated.mascot.changed.length} catalog states moved to the lifecycle enum (${migrated.mascot.files.join(', ')}).`)
  if (migrated.mascot.downgraded.length > 0) console.log(`These states claimed approved without artwork and are now defined: ${migrated.mascot.downgraded.join(', ')}`)
  if (migrated.question_text.length > 0) console.log(`Question wording refreshed from the template (prompts, why it matters, examples; no answer changed): ${migrated.question_text.join(', ')}`)
  // Visual V3.1: list questions. Free text becomes a draft or a change proposal for review; nothing is approved, and
  // text that cannot be read as a list stays exactly as written and is flagged.
  const { formatEntityMigration, migrateEntityAnswers } = await import('@brand-os/brand-core')
  for (const line of formatEntityMigration(migrateEntityAnswers(engine))) console.log(line)
} else if (command === 'reset') {
  const { values } = parseArgs({ args: rest, options: { confirm: { type: 'string' } } })
  if (values.confirm !== RESET_CONFIRMATION) {
    console.error(`Refusing reset. Pass --confirm "${RESET_CONFIRMATION}"`)
    process.exit(1)
  }
  const result = resetInterviewState(root, values.confirm)
  console.log(`Interview state cleared. Backup: ${path.relative(root, result.backup)}`)
} else {
  console.log(`Commands: init, interview, resume, next, propose, status, review, validate, export, approve, publish, document, tokens:generate, tokens:approve, tokens:publish, assets, query, agent-token, doctor, finance, backup, restore, migrate, reset`)
  process.exit(command ? 1 : 0)
}

function selectionFrom(values: { module?: string; ids?: string }): Selection {
  const ids = values.ids ? values.ids.split(',').map((id) => id.trim()).filter(Boolean) : undefined
  return { ...(values.module ? { module: values.module } : {}), ...(ids?.length ? { ids } : {}) }
}

function withSelectionErrors<T>(run: () => T): T {
  try {
    return run()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Request failed.')
    process.exit(2)
  }
}

function show(value: unknown, withheld: boolean): string {
  if (withheld) return '[restricted withheld]'
  if (value === null || value === undefined) return 'none'
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function formatQueue(queue: ReviewQueue): string {
  const lines = [`# Review queue (${queue.brand_id})`, '', `${queue.pending} item(s) need a decision. Approval does not publish.`, '']
  for (const item of queue.items) {
    lines.push(`## ${item.question_id} [${item.state}] ${item.classification}, needs ${item.required_grant}`)
    lines.push(`- ${item.reason}`)
    if (item.approved) lines.push(`- Approved v${item.approved.version} (${item.approved.publication}): ${show(item.approved.value, item.withheld)}`)
    if (item.draft) {
      const state = item.draft.proposal_state ? `, ${item.draft.proposal_state} proposal` : ''
      lines.push(`- Draft ${item.draft.answer_id} (${item.draft.status}, ${item.draft.authority}${state}): ${show(item.draft.value, item.withheld)}`)
      if (item.draft.provenance === 'agent_suggested_owner_confirmed') lines.push('- Origin: Agent-suggested, owner-confirmed. An agent proposed this value; the owner confirmed it. Not owner-authored.')
      else if (item.draft.provenance === 'agent_suggestion') lines.push('- Origin: Agent suggestion, not confirmed by the owner.')
      if (item.draft.proposal_state === 'tentative') lines.push('- Tentative: the owner described this as possible, not decided. Approve only if it is now a decision.')
    }
    for (const change of item.changes) {
      lines.push(`- Change ${change.id} against v${change.expected_version}${change.stale ? ' (stale)' : ''}: ${show(change.proposed_value, item.withheld)}`)
      if (change.reason) lines.push(`  Reason: ${change.reason}`)
    }
    if (item.impact.documents.length) lines.push(`- Documents: ${item.impact.documents.join(', ')}`)
    if (item.impact.questions.length) lines.push(`- Linked questions: ${item.impact.questions.join(', ')}`)
    if (item.impact.published) lines.push('- Currently published. An approved replacement is unpublished until you run brand:publish again.')
    lines.push('')
  }
  return lines.join('\n')
}

function formatIntake(report: IntakeReport): string {
  const lines = [`${report.dry_run ? 'Dry run' : `Intake ${report.batch_id}`} (${report.origin}${report.provider ? `, ${report.provider}` : ''})`]
  for (const item of report.results) {
    lines.push(`${item.outcome.padEnd(15)} ${item.question_id ?? `#${item.index}`}${item.state ? ` [${item.state}]` : ''}  ${item.reason}`)
  }
  for (const conflict of report.conflicts) lines.push(`Ask: ${conflict.ask}`)
  for (const item of report.follow_ups) lines.push(`Follow-up${item.question_id ? ` (${item.question_id})` : ''}: ${item.text}`)
  for (const item of report.owner_questions) lines.push(`Owner asked: ${item.text}`)
  if (report.redactions > 0) lines.push(`${report.redactions} passage(s) were withheld from the model as possible restricted data.`)
  lines.push(report.notice)
  return lines.join('\n')
}

function formatNext(report: NextReport): string {
  const lines = [`# Next (${report.brand_id}, profile ${report.profile.id}: ${report.profile.answered}/${report.profile.total} answered)`, '']
  for (const conflict of report.conflicts) lines.push(`Conflict on ${conflict.question_id}: ${conflict.ask}`)
  for (const item of report.follow_ups) lines.push(`Follow-up${item.question_id ? ` (${item.question_id})` : ''}: ${item.text}`)
  for (const item of report.next) {
    lines.push(`- [${item.priority}] ${item.id}: ${item.prompt}`)
    lines.push(`  why now: ${item.reasons.join('; ')}`)
  }
  if (report.tentative.length) lines.push('', `Tentative: ${report.tentative.map((item) => item.question_id).join(', ')}`)
  if (report.unresolved.length) lines.push(`Unresolved: ${report.unresolved.map((item) => item.question_id).join(', ')}`)
  if (report.owner_only.length) lines.push(`Owner-only (restricted): ${report.owner_only.map((item) => item.question_id).join(', ')}`)
  lines.push('', ...report.suggested_actions.map((action) => `→ ${action}`))
  return lines.join('\n')
}

/**
 * `brand:interview -- --question <id> --entity add|edit|move|remove|list …` for list questions (repeating_entity).
 * Every write goes through the normal change flow: a draft, or a pending change proposal when the list is approved.
 * Nothing is approved here.
 */
async function entityCommand(values: { question?: string; entity?: string; item?: string; field?: string[]; links?: string; sources?: string; position?: string; json?: boolean }): Promise<void> {
  const { ENTITY_OPERATIONS, entityFormat, entityLines, entitySpec, readEntityList } = await import('@brand-os/brand-core')
  const usage = 'Usage: brand:interview --question <list question id> --entity list | add --field name=… [--field key=…] [--links id,id] [--sources ref,ref] [--position N] | edit --item <id> [--field key=…] [--links id,id|none] [--sources ref,ref|none] | move --item <id> --position N | remove --item <id> [--json]'
  const done = (ok: boolean, payload: Record<string, unknown>, text: string): never => {
    if (values.json) console.log(JSON.stringify({ ok, ...payload }, null, 2))
    else (ok ? console.log : console.error)(text)
    process.exit(ok ? 0 : 1)
  }
  const operation = values.entity ?? ''
  if (!values.question || (operation !== 'list' && !(ENTITY_OPERATIONS as readonly string[]).includes(operation))) {
    console.error(usage)
    process.exit(2)
  }
  const question = engine.question(values.question)
  const spec = entitySpec(values.question)
  if (!question || question.question_type !== 'repeating_entity' || !spec) done(false, { kind: 'error', question_id: values.question, message: 'not a list question' }, `${values.question} is not a list question. Nothing was recorded.`)
  const fields: Record<string, string> = {}
  for (const pair of values.field ?? []) {
    const eq = pair.indexOf('=')
    if (eq < 1) done(false, { kind: 'error', message: `--field ${pair}` }, `--field needs key=value, for example --field name="Independent cafés". Fields: ${spec!.fields.map((field) => field.key).join(', ')}.`)
    fields[pair.slice(0, eq).trim()] = pair.slice(eq + 1)
  }
  const links = values.links === undefined ? undefined : values.links.trim().toLowerCase() === 'none' ? [] : values.links.split(/[,،\s]+/).filter(Boolean)
  const sources = values.sources === undefined ? undefined : values.sources.trim().toLowerCase() === 'none' ? [] : values.sources.split(/[,،\s]+/).filter(Boolean)
  const position = values.position === undefined ? undefined : Number(values.position)
  if (operation === 'list') {
    const latest = engine.ledger().records.filter((record) => record.question_id === values.question && !record.superseded_by).at(-1)
    const read = readEntityList(spec!, latest?.value ?? null)
    const lines = read.state === 'items' ? entityLines(spec!, read.list) : read.state === 'legacy' ? ['Legacy free text (kept as written, not a list yet). Run npm run brand:migrate to propose a conversion.'] : ['No items yet.']
    done(true, { kind: 'list', question_id: values.question, status: latest?.status ?? null, state: read.state, items: read.state === 'items' ? read.list.items : [], format: entityFormat(spec!) }, [`${values.question} (${latest?.status ?? 'unanswered'})`, ...lines, `Format: ${entityFormat(spec!)}`].join('\n'))
  }
  if (operation !== 'add' && !values.item) done(false, { kind: 'error', message: '--item is required' }, `--entity ${operation} needs --item <id>. ${usage}`)
  if (position !== undefined && !Number.isInteger(position)) done(false, { kind: 'error', message: '--position must be a whole number' }, '--position must be a whole number.')
  const op =
    operation === 'add'
      ? { op: 'add' as const, fields, links, sources, position }
      : operation === 'edit'
        ? { op: 'edit' as const, id: values.item!, fields, links, sources }
        : operation === 'move'
          ? { op: 'move' as const, id: values.item!, position: position ?? 0 }
          : { op: 'remove' as const, id: values.item! }
  const result = engine.entityOperation(values.question!, op)
  const ok = result.kind === 'recorded' || result.kind === 'impact'
  done(ok, { kind: result.kind, question_id: values.question, item_id: result.item_id ?? null, status: result.status ?? null, message: result.message }, ok ? `${result.item_id ?? ''}: ${result.message}` : result.message)
}

/** Coach moment 1: at most one advisory note right after an answer. Silent on anything unimportant; never throws. */
function afterAnswerCoach(questionId: string): CoachMomentResult {
  return coachAfterAnswer(engine, questionId, { locale: engine.session().locale })
}

function logoMastersCheck(text: string): LogoMastersCheck {
  return checkLogoMastersInRepo(root, text)
}

/** Coach moment 2: notes on the plain drafts in an approval batch (change proposals are counted, not advised on). */
function beforeApprovalCoach(queue: ReviewQueue): string {
  const draftIds = queue.items.filter((item) => item.state === 'draft').map((item) => item.question_id)
  const changeIds = queue.items.filter((item) => item.state === 'change_pending').map((item) => item.question_id)
  if (draftIds.length === 0) return ''
  return renderBeforeApproval(coachBeforeApproval(engine, { draftIds, changeIds }, { locale: engine.session().locale }))
}

async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of input) chunks.push(Buffer.from(chunk as Buffer))
  return Buffer.concat(chunks).toString('utf8')
}

function formatBatch(result: BatchResult): string {
  const lines = result.results.map((item) => `${item.outcome.padEnd(9)} ${item.id}${item.version ? ` v${item.version}` : ''}  ${item.reason}`)
  lines.push(result.proof === 'rejected' ? 'Proof rejected. Nothing was changed.' : `${result.approved} approved. Nothing was published.`)
  return lines.join('\n')
}

async function interactive(): Promise<void> {
  const rl = readline.createInterface({ input, output })
  console.log('Brand OS interview. Type help for commands. exit pauses the session.')
  try {
    while (true) {
      const question = engine.current()
      if (!question) {
        console.log(engine.statusText())
        break
      }
      const locale = engine.session().locale
      const prompt = engine.promptText(question, locale)
      console.log(`\n${question.id} [${question.priority}]`)
      if (prompt.fellBack) console.log(`No ${locale} prompt stored. Showing English.`)
      console.log(prompt.text)
      console.log(`Why: ${engine.helpText(question, locale).why}`)
      if (question.options) console.log(`Options: ${question.options.join(', ')}`)
      if (question.question_type === 'repeating_entity') {
        const { entityFormat, entitySpec } = await import('@brand-os/brand-core')
        const spec = entitySpec(question.id)
        if (spec) console.log(`List: ${entityFormat(spec)} Later edits: npm run brand:interview -- --question ${question.id} --entity add|edit|move|remove|list`)
      }
      const raw = await rl.question('> ')
      const result = engine.submit(raw)
      console.log(result.message)
      if (result.kind === 'exit') break
      if (result.kind === 'recorded') {
        const coach = afterAnswerCoach(result.questionId ?? question.id)
        if (coach.shown) console.log(`\n${renderAfterAnswer(coach)}`)
      }
    }
  } finally {
    rl.close()
  }
}

/** Owner proof through the shared resolver (scripts/proof.ts): env, piped stdin, macOS Keychain, hidden prompt. Never argv. */
async function readApprovalProof(): Promise<string | undefined> {
  return readOwnerProof({ slug: engine.config().brand.slug })
}

/** BOS-06: `--origin agent_suggestion` (alias `--suggested-by agent`). Anything else is refused before writing. */
function answerOrigin(origin: string | undefined, suggestedBy: string | undefined): 'owner' | 'agent_suggestion' {
  if (origin === undefined && suggestedBy === undefined) return 'owner'
  const fromOrigin = origin === undefined ? undefined : origin === 'agent_suggestion' || origin === 'agent' ? 'agent_suggestion' : origin === 'owner' ? 'owner' : null
  const fromSuggested = suggestedBy === undefined ? undefined : suggestedBy === 'agent' ? 'agent_suggestion' : suggestedBy === 'owner' ? 'owner' : null
  if (fromOrigin === null || fromSuggested === null || (fromOrigin && fromSuggested && fromOrigin !== fromSuggested)) {
    console.error('--origin takes agent_suggestion or owner (alias: --suggested-by agent). Nothing was recorded.')
    process.exit(2)
  }
  return (fromOrigin ?? fromSuggested) as 'owner' | 'agent_suggestion'
}

/**
 * BOS-04: `brand:interview --question ID --change "VALUE" [--reason "WHY"] [--json]`. The same path as the interactive
 * `change ID: VALUE`: on an approved fact it files a pending chg- proposal against the current version (the approved
 * revision stays canonical); on a draft it updates the draft. Nothing is approved here.
 */
async function changeCommand(values: { question?: string; change?: string; reason?: string; origin?: string; 'suggested-by'?: string; json?: boolean }): Promise<void> {
  const fail = (message: string, code = 1): never => {
    if (values.json) console.log(JSON.stringify({ ok: false, kind: 'error', question_id: values.question ?? null, message }, null, 2))
    else console.error(message)
    process.exit(code)
  }
  if (!values.question || !values.change?.trim()) fail('Usage: brand:interview --question QUESTION_ID --change "NEW VALUE" [--reason "WHY"] [--json]', 2)
  if (values.origin !== undefined || values['suggested-by'] !== undefined) fail('--origin applies to --answer only. Nothing was recorded.', 2)
  const questionId = values.question!
  const question = engine.question(questionId)
  if (!question) fail(`Unknown question ${questionId}. Nothing was recorded.`)
  const { dispositionFor } = await import('@brand-os/brand-core')
  if (question!.sensitivity === 'restricted' && !dispositionFor(values.change!)) {
    fail(`${questionId} is restricted. Change it yourself in the interactive interview (change ${questionId}: …). Nothing was recorded.`)
  }
  const before = engine.approvals().reviewQueue({ ids: [questionId] }).items[0]
  const result = engine.changeAnswer(questionId, values.change!, false, 'owner', { reason: values.reason ?? null })
  if (result.kind === 'error') fail(result.message)
  const impact = result.impact
  const proposed = result.changeId ? engine.approvals().pendingChanges().find((item) => item.id === result.changeId)?.proposed_value ?? values.change! : values.change!
  const payload = {
    ok: true,
    kind: result.changeId ? 'change_proposed' : 'draft_updated',
    question_id: questionId,
    change_id: result.changeId ?? null,
    expected_version: result.expectedVersion ?? null,
    approved: before?.approved ? { version: before.approved.version, value: before.approved.value } : null,
    proposed_value: proposed,
    reason: values.reason?.trim() || null,
    impact: { documents: impact?.impactedDocuments ?? [], questions: impact?.impactedQuestions ?? [] },
    message: result.message,
    next: result.changeId ? `npm run brand:review -- --ids ${result.changeId}, then the owner approves it: npm run brand:approve -- --ids ${result.changeId}` : null,
  }
  if (values.json) {
    console.log(JSON.stringify(payload, null, 2))
    return
  }
  const lines = [result.message, '']
  if (payload.approved) lines.push(`- approved v${payload.approved.version}: ${show(payload.approved.value, false)}`)
  lines.push(`+ proposed${result.changeId ? ` (${result.changeId})` : ''}: ${proposed}`)
  if (payload.reason) lines.push(`  reason: ${payload.reason}`)
  lines.push('', `Impacted documents: ${payload.impact.documents.join(', ') || 'none'}`, `Impacted questions: ${payload.impact.questions.join(', ') || 'none'}`)
  if (payload.next) lines.push('', `Next: ${payload.next}`)
  console.log(lines.join('\n'))
}

/** BOS-01 and BOS-07: `brand:approve --all-pending [--exclude …] [--dry-run] [--json]`. */
async function approveAllPendingCommand(options: { dryRun: boolean; json: boolean; exclude?: string; actor: string }): Promise<void> {
  const { approveAllPending, dryRunReport, formatAllPending, formatDryRun, planAllPending } = await import('@brand-os/brand-core')
  const approvals = engine.approvals()
  const exclude = options.exclude ? options.exclude.split(',').map((id) => id.trim()).filter(Boolean) : []
  const plan = planAllPending(approvals, root, { exclude, actor: options.actor })
  const queue = approvals.reviewQueue({}, { includeSettled: false })
  const approving = new Set(plan.entries.filter((entry) => entry.decision === 'approve' && entry.kind === 'fact').map((entry) => entry.id))
  const coachNotes = options.json ? '' : beforeApprovalCoach({ ...queue, items: queue.items.filter((item) => approving.has(item.question_id)) })
  if (options.dryRun) {
    const report = dryRunReport(plan.entries, plan.unmatched_excludes)
    console.log(options.json ? JSON.stringify(report, null, 2) : formatDryRun(report))
    if (coachNotes) console.error(coachNotes)
    return
  }
  const count = plan.entries.filter((entry) => entry.decision === 'approve').length
  if (count === 0) {
    // Nothing to approve: no proof is read and nothing is written. The skips are still reported.
    const result = approveAllPending(approvals, root, plan, undefined, options.actor)
    console.log(options.json ? JSON.stringify(result, null, 2) : formatAllPending(result))
    return
  }
  if (coachNotes) console.error(`${coachNotes}\n`)
  if (!options.json) console.error(`About to approve ${count} item(s) as ${options.actor}: facts, change proposals, evidence and assets. Approval does not publish.`)
  const proof = await readApprovalProof()
  const result = approveAllPending(approvals, root, plan, proof, options.actor)
  console.log(options.json ? JSON.stringify(result, null, 2) : formatAllPending(result))
  if (!result.ok) process.exitCode = 1
}
