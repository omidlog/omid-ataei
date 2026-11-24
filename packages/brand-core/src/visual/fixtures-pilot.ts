/**
 * SYNTHETIC PILOT BRANDS (Visual V5.1 cross-brand pilot). Two invented brands with no real person, company or
 * client behind them, used only to prove that every visual module is brand-agnostic. Never read from or written to a
 * brand repository; the pilot builds them in a temporary workspace and removes it. Every value carries a marker
 * (`PILOT-A-…`, `PILOT-B-…`) so a value that crosses from one brand into the other is found by a plain text search.
 */
export interface PilotBrand {
  name: string
  slug: string
  industry: string
  language: 'en' | 'fa' | 'tr'
  mascot: boolean
  /** Answered, approved and published. */
  published: Record<string, string>
  /** Answered and left as an owner draft: must never reach a public edition. */
  drafts: Record<string, string>
  /** The marker every value of this brand carries. */
  marker: string
}

export const PILOT_BRANDS: readonly [PilotBrand, PilotBrand] = [
  {
    name: 'Pilot Alpha Study Hall (synthetic)',
    slug: 'pilot-alpha-synthetic',
    industry: 'education',
    language: 'en',
    mascot: false,
    marker: 'PILOT-A',
    published: {
      'business.identity.trade_name': 'PILOT-A Study Hall',
      'business.offer.summary': 'PILOT-A evening study rooms for adult learners',
      'business.model.revenue': 'PILOT-A monthly membership',
      'brand.color.roles': 'primary #1F4E79; onPrimary #FFFFFF; surface #FAF7F2; onSurface #1A1A1A',
    },
    drafts: { 'brand.strategy.purpose': 'PILOT-A-DRAFT purpose never public' },
  },
  {
    name: 'Pilot Beta Ceramics Studio (synthetic)',
    slug: 'pilot-beta-synthetic',
    industry: 'consulting',
    language: 'tr',
    mascot: true,
    marker: 'PILOT-B',
    published: {
      'business.identity.trade_name': 'PILOT-B Seramik Atölyesi',
      'business.offer.summary': 'PILOT-B el yapımı seramik kursları',
      'business.model.revenue': 'PILOT-B kurs başına ücret',
      'brand.color.roles': 'primary #8C3B2A; onPrimary #FFFFFF; surface #F4EFE6; onSurface #222222; accent #2F6F62; onAccent #FFFFFF',
    },
    drafts: { 'brand.strategy.purpose': 'PILOT-B-DRAFT purpose never public' },
  },
]
