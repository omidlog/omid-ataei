import { personalConfig } from './conditions.js'
import type { BrandConfig, FieldQuestion } from './types.js'

/** Answers that also update brand.config.yaml, and the priority rank used to order open questions. */

export function isPersonalBrand(config: BrandConfig): boolean {
  return config.brand.profile === 'personal-brand' && personalConfig(config).enabled
}

export const CONFIG_BINDINGS: Array<{ id: string; assign: (config: BrandConfig, value: string) => void }> = [
  {
    id: 'brand.mascot.enabled',
    assign: (config, value) => {
      config.modules.mascot.enabled = value === 'yes'
    },
  },
  {
    id: 'brand.gamification.enabled',
    assign: (config, value) => {
      config.modules.gamification.enabled = value === 'yes'
    },
  },
  {
    id: 'business.identity.sector',
    assign: (config, value) => {
      config.brand.sector = value
    },
  },
  {
    id: 'personal.identity.public_name',
    assign: (config, value) => {
      if (!isPersonalBrand(config)) return
      config.brand.working_name = value
      config.brand.working_name_status = 'draft'
    },
  },
  {
    id: 'business.identity.trade_name',
    assign: (config, value) => {
      // A company trade name never renames a personal brand.
      if (isPersonalBrand(config)) return
      config.brand.working_name = value
      config.brand.working_name_status = 'draft'
    },
  },
  {
    id: 'business.stage.current',
    assign: (config, value) => {
      config.brand.stage = value
    },
  },
  {
    id: 'business.identity.new_or_existing',
    assign: (config, value) => {
      config.brand.new_or_existing = value
    },
  },
]

export function priorityRank(question: FieldQuestion, sector: string | null): number {
  const base = { critical: 0, high: 1, medium: 2, low: 3 }[question.priority]
  if (sector && question.sector_hints.includes(sector)) return base - 0.5
  return base
}
