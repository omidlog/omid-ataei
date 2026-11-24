import { redactRestricted } from '../llm/extract.js'
import { privateDataFindings } from '../personal-privacy.js'

/**
 * Content checks that never echo the content. Each finding names a kind only.
 */
const CREDENTIAL_PATTERNS: Array<[string, RegExp]> = [
  ['brand-os agent token', /bos_at_[A-Za-z0-9_-]{20,}/],
  ['data key variable', /BRAND_OS_(?:DATA_KEY|APPROVAL_PROOF|AGENT_TOKEN)\s*[=:]\s*\S{8,}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['API secret key', /\bsk-(?:ant-|proj-|live_|test_)?[A-Za-z0-9_-]{20,}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['JSON web token', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ['password assignment', /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|client[_-]?secret)\s*[=:]\s*["']?[^\s"']{6,}/i],
]

export function credentialFindings(text: string): string[] {
  return CREDENTIAL_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([kind]) => kind)
}

export interface SafetyReport {
  credentials: string[]
  personal: string[]
  restricted_passages: number
}

/** Credentials, personal private data (home address, phone, id numbers…) and restricted (financial/legal) cues. */
export function safetyReport(text: string): SafetyReport {
  // Note ids (kn_<uuid>) contain digit runs that the phone and long-number detectors would flag.
  const withoutIds = text.replace(/\bkn_[a-z0-9][a-z0-9-]{2,63}/g, 'kn_note')
  return {
    credentials: credentialFindings(text),
    personal: privateDataFindings(withoutIds).map((finding) => finding.kind),
    restricted_passages: redactRestricted(withoutIds).redactions,
  }
}

export function safetyBlocksSharing(report: SafetyReport): string[] {
  const reasons: string[] = []
  if (report.credentials.length) reasons.push(`possible credentials (${report.credentials.join(', ')})`)
  if (report.personal.length) reasons.push(`personal private data (${report.personal.join(', ')})`)
  if (report.restricted_passages > 0) reasons.push(`${report.restricted_passages} passage(s) that look like restricted financial or legal data`)
  return reasons
}
