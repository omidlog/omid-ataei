import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assess,
  assessable,
  AssuranceError,
  CLAIM_LEVELS,
  claimRank,
  effectiveClaim,
  lowerClaim,
  METHOD_REGISTRY,
  methodById,
  methodClaim,
  POSITIONING_READINESS,
  REFERENCED_METHODS,
  registryErrors,
  RULES_ACCESS,
  RULES_ACCESS_CAP,
  SYNTHETIC_DEMO,
  type Attestation,
  type MethodEntry,
  checkFrameworkClaim,
  PERMITTED_CLAIM_LEVEL,
  VISUAL_FRAMEWORK_METHOD,
} from '@brand-os/brand-core/assurance'
import { BMC_FRAMEWORK, PERMITTED_CLAIMS } from '@brand-os/brand-core/visual'

/**
 * Trust v2 PR-A: the methodology registry and the claim ladder. Nothing can raise a claim level; an
 * unchecked source or an unrecorded edition is cited at `reference_only`; only a method whose rules we
 * authored or licensed can be assessed against; nothing in the template is certified.
 */

const ATTESTATION: Attestation = {
  kind: 'certificate',
  issuer: 'Example Review Firm',
  scope: 'Positioning Readiness rubric v1 rules only',
  reference: 'REV-0001',
  issued_at: '2026-11-01',
  expires_at: null,
  verification_url: null,
}

test('the shipped registry satisfies every invariant', () => {
  assert.deepEqual(registryErrors(), [])
  assert.equal(new Set(METHOD_REGISTRY.map((entry) => entry.method_id)).size, METHOD_REGISTRY.length)
})

test('the claim ladder is ordered and lowerClaim always returns the weaker level', () => {
  CLAIM_LEVELS.forEach((level, index) => assert.equal(claimRank(level), index))
  for (const a of CLAIM_LEVELS) {
    for (const b of CLAIM_LEVELS) {
      const low = lowerClaim(a, b)
      assert.equal(claimRank(low), Math.min(claimRank(a), claimRank(b)))
    }
  }
})

test('effectiveClaim never raises a declared level, for every combination of inputs', () => {
  for (const declared of CLAIM_LEVELS) {
    for (const access of RULES_ACCESS) {
      for (const checked of [null, '2026-11-23']) {
        for (const edition of [null, '1']) {
          for (const attestation of [null, ATTESTATION]) {
            const decision = effectiveClaim({ declared_claim_level: declared, rules_access: access, checked_at: checked, edition, attestation })
            assert.ok(claimRank(decision.level) <= claimRank(declared), `${declared}/${access} rose to ${decision.level}`)
            if (decision.level !== declared) assert.ok(decision.capped_by.length > 0, 'a lowered claim must say why')
            if (checked === null || edition === null) assert.ok(claimRank(decision.level) <= claimRank('informed_by'), 'an unchecked entry never cites requirements')
            if (access === 'unlicensed' && attestation === null) assert.equal(decision.level, 'reference_only')
            if (attestation === null) assert.ok(claimRank(decision.level) <= claimRank('internally_assessed'))
            if (attestation === null && claimRank(declared) <= claimRank('internally_assessed')) assert.ok(claimRank(decision.level) <= claimRank(RULES_ACCESS_CAP[access]))
          }
        }
      }
    }
  }
})

test('the original method is the only assessable entry, and it is internally assessed, not more', () => {
  const claim = methodClaim(POSITIONING_READINESS)
  assert.deepEqual(claim, { level: 'internally_assessed', capped_by: [] })
  for (const entry of REFERENCED_METHODS) {
    const decision = methodClaim(entry)
    // Unchecked open sources may shape our work ("informed by"); unlicensed standards are only named.
    assert.equal(decision.level, entry.rules_access === 'unlicensed' ? 'reference_only' : 'informed_by', entry.method_id)
    assert.equal(entry.checked_at, null)
    assert.equal(entry.edition, null, `${entry.method_id}: an edition nobody verified must not be written down`)
    assert.equal(entry.evaluation_rule_version, null)
    // And none of them may go further until a person checks it, whatever it declares.
    assert.ok(claimRank(methodClaim({ ...entry, declared_claim_level: 'mapped_to' }).level) <= claimRank('informed_by'))
  }
})

test('no ISO entry can be assessed against or cited as anything but a reference', () => {
  const iso = METHOD_REGISTRY.filter((entry) => entry.issuer.startsWith('ISO'))
  assert.ok(iso.length >= 2)
  for (const entry of iso) {
    assert.equal(entry.rules_access, 'unlicensed')
    assert.equal(entry.declared_claim_level, 'reference_only')
    for (const use of ['certification', 'compliance_claim', 'clause_reproduction']) assert.ok(entry.blocked_uses.includes(use), `${entry.method_id} must block ${use}`)
    // Even a person checking edition and source would not lift an unlicensed standard above a citation.
    const checked: MethodEntry = { ...entry, edition: '2021', checked_at: '2026-11-23', checked_by: 'owner', declared_claim_level: 'certified' }
    assert.equal(methodClaim(checked).level, 'reference_only')
    assert.deepEqual(methodClaim(checked).capped_by, ['no_attestation', 'rules_access'])
    assert.deepEqual(methodClaim(entry), { level: 'reference_only', capped_by: [] })
  }
})

test('nothing in the registry is certified or externally reviewed, and nothing carries an attestation', () => {
  for (const entry of METHOD_REGISTRY) {
    assert.equal(entry.attestation, null)
    assert.ok(entry.blocked_uses.includes('certification'))
    assert.ok(!['externally_reviewed', 'certified'].includes(methodClaim(entry).level))
  }
})

test('above internally_assessed needs an attestation, and a review is not a certificate', () => {
  const ours: MethodEntry = { ...POSITIONING_READINESS, method_id: 'example.licensed', rules_access: 'licensed', declared_claim_level: 'certified' }
  assert.deepEqual(methodClaim(ours), { level: 'internally_assessed', capped_by: ['no_attestation'] })
  assert.deepEqual(methodClaim({ ...ours, attestation: { ...ATTESTATION, kind: 'review' } }), { level: 'externally_reviewed', capped_by: ['no_attestation'] })
  assert.deepEqual(methodClaim({ ...ours, attestation: ATTESTATION }), { level: 'certified', capped_by: [] })
})

test('a certificate can be cited for a standard we hold no rules for, but it never makes the standard assessable', () => {
  const iso = REFERENCED_METHODS.find((entry) => entry.rules_access === 'unlicensed')!
  const certified: MethodEntry = { ...iso, edition: '2021', checked_at: '2026-11-23', checked_by: 'owner', declared_claim_level: 'certified', attestation: ATTESTATION }
  assert.equal(methodClaim(certified).level, 'certified')
  assert.equal(assessable(certified), false)
  // Without the certificate the same entry is a citation and nothing more.
  assert.equal(methodClaim({ ...certified, attestation: null }).level, 'reference_only')
  // And an unchecked certificate entry is still only a reference: nobody looked at it.
  assert.equal(methodClaim({ ...certified, checked_at: null, checked_by: null }).level, 'reference_only')
})

test('only an authored or licensed, checked entry with a recorded edition is assessable', () => {
  assert.equal(assessable(POSITIONING_READINESS), true)
  assert.equal(assessable({ ...POSITIONING_READINESS, checked_at: null }), false)
  assert.equal(assessable({ ...POSITIONING_READINESS, edition: null }), false)
  for (const entry of REFERENCED_METHODS) assert.equal(assessable(entry), false, entry.method_id)
})

test('registryErrors catches the drift that would let an unsupported claim through', () => {
  const bad = (patch: Partial<MethodEntry>) => registryErrors([{ ...POSITIONING_READINESS, ...patch }])
  assert.match(bad({ checked_by: null }).join('\n'), /checked_at without checked_by/)
  assert.match(bad({ checked_at: null }).join('\n'), /checked_by without checked_at/)
  assert.match(bad({ blocked_uses: [] }).join('\n'), /certification/)
  assert.match(bad({ evaluation_rule_version: null }).join('\n'), /assessable method needs an evaluation_rule_version/)
  assert.match(bad({ official_source_url: 'http://example.com' }).join('\n'), /https/)
  assert.match(bad({ checked_at: '23/11/2026' }).join('\n'), /YYYY-MM-DD/)
  assert.match(bad({ method_id: 'Bad Id' }).join('\n'), /method_id must match/)
  assert.match(bad({ attestation: { ...ATTESTATION, scope: ' ' } }).join('\n'), /without a scope/)
  assert.match(bad({ attestation: { ...ATTESTATION, issuer: '' } }).join('\n'), /name its issuer/)
  assert.match(registryErrors([POSITIONING_READINESS, POSITIONING_READINESS]).join('\n'), /duplicate/)
  const unlicensedWithRules = REFERENCED_METHODS.find((entry) => entry.rules_access === 'unlicensed')!
  assert.match(registryErrors([{ ...unlicensedWithRules, evaluation_rule_version: '1' }]).join('\n'), /must not carry an evaluation_rule_version/)
})

test('assessing against a method with no controls or no registry entry is refused, not guessed', () => {
  assert.equal(methodById('iso.20671')?.issuer, 'ISO')
  assert.throws(() => assess({ ...SYNTHETIC_DEMO, method_id: 'iso.20671' }), (error: unknown) => error instanceof AssuranceError && error.code === 'no_controls')
  assert.throws(() => assess({ ...SYNTHETIC_DEMO, method_id: 'nope.method' }), (error: unknown) => error instanceof AssuranceError && error.code === 'unknown_method')
})

test('bridge: every visual claim maps onto the ladder, and the BMC page claims no more than the registry allows', () => {
  for (const claim of PERMITTED_CLAIMS) assert.ok(CLAIM_LEVELS.includes(PERMITTED_CLAIM_LEVEL[claim]), claim)
  const check = checkFrameworkClaim(BMC_FRAMEWORK)
  assert.deepEqual(check, { framework_id: 'BMC', method_id: 'strategyzer.bmc', page_claim: 'informed_by', allowed: 'informed_by', ok: true })
  // A page that upgraded itself to "aligned with" would be caught.
  assert.equal(checkFrameworkClaim({ ...BMC_FRAMEWORK, permitted_claim: 'aligned_with' }).ok, false)
  // A framework the registry does not know is never ok.
  assert.equal(checkFrameworkClaim({ ...BMC_FRAMEWORK, framework_id: 'UNKNOWN' }).ok, false)
  for (const methodId of Object.values(VISUAL_FRAMEWORK_METHOD)) assert.ok(methodById(methodId), `${methodId} must be in the registry`)
  // The identity chapter's contrast grid cites WCAG 2 at informed_by, which the unchecked W3C entry allows.
  assert.deepEqual(checkFrameworkClaim({ ...BMC_FRAMEWORK, framework_id: 'WCAG-CONTRAST' }), { framework_id: 'WCAG-CONTRAST', method_id: 'w3c.wcag-2.2', page_claim: 'informed_by', allowed: 'informed_by', ok: true })
})
