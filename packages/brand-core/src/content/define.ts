import { entitySpec } from '../entities.js'
import type {
  FieldQuestion,
  PublicationRequirement,
  ModuleDef,
  Priority,
  QuestionType,
  SourceType,
  Visibility,
} from '../types.js'

export interface FqInput {
  id: string
  module: string
  path?: string
  label: string
  en: string
  fa: string
  tr: string
  why: string
  example: string
  priority?: Priority
  order: number
  sensitivity?: Visibility
  type?: QuestionType
  options?: string[]
  required?: boolean
  skip?: string
  require?: string
  depends?: string[]
  hints?: string[]
  suggestions?: string[]
  docs?: string[]
  related?: string[]
  completion?: FieldQuestion['completion_rule']
  grant?: FieldQuestion['approval_grant']
  /** Publication gate beyond approval (personal claims). */
  requires?: PublicationRequirement[]
  /** A professional contact field (emails and contact URLs are allowed here). */
  contact?: boolean
}

/** The question bank carries a summary of the item shape; `ENTITY_SPECS` stays the one definition. */
function entitySummary(id: string): NonNullable<FieldQuestion['entity']> {
  const spec = entitySpec(id)
  if (!spec) throw new Error(`${id} is a repeating_entity question without an ENTITY_SPECS entry.`)
  return { id_prefix: spec.id_prefix, max_items: spec.max_items, fields: spec.fields.map((field) => field.key), links: [...spec.links] }
}

const SOURCE_TYPES: SourceType[] = ['owner', 'approved_import', 'external_cited', 'agent_suggestion']

export function fq(input: FqInput): FieldQuestion {
  const type = input.type ?? 'long_text'
  const completion =
    input.completion ??
    (type === 'boolean'
      ? 'boolean'
      : type === 'single_choice'
        ? 'one_of'
        : type === 'number'
          ? 'number'
          : type === 'url'
            ? 'url'
            : type === 'color' || type === 'font' || type === 'logo_spec' || type === 'voice_pairs' || type === 'relationships' || type === 'repeating_entity'
              ? 'structured'
              : 'non_empty')
  return {
    id: input.id,
    module: input.module,
    field_path: input.path ?? input.id,
    label: input.label,
    prompt: { en: input.en, fa: input.fa, tr: input.tr },
    why_it_matters: input.why,
    question_type: type,
    examples: [`EXAMPLE ONLY: ${input.example}`],
    options: input.options,
    suggestions: input.suggestions,
    required_when: input.require ?? 'always',
    skip_when: input.skip,
    depends_on: input.depends ?? [],
    priority: input.priority ?? 'high',
    order: input.order,
    sensitivity: input.sensitivity ?? 'internal',
    ...(input.grant ? { approval_grant: input.grant } : {}),
    ...(input.requires?.length ? { publication_requires: input.requires } : {}),
    ...(input.contact ? { contact_field: true } : {}),
    ...(type === 'repeating_entity' ? { entity: entitySummary(input.id) } : {}),
    language: ['en', 'fa', 'tr'],
    // Each question owns its list: a shared array is written as a YAML alias, and a bank file with more than 100
    // aliases is refused by the YAML parser's default alias limit (Visual V3.2 crossed it in business.yaml).
    source_types: [...SOURCE_TYPES],
    related_outputs: input.docs ?? [],
    related_ids: input.related ?? [],
    completion_rule: completion,
    allows_unknown: true,
    required: input.required ?? true,
    weight: input.required === false ? 1 : 2,
    sector_hints: input.hints ?? [],
    status: 'unanswered',
  }
}

export function mod(
  input: Omit<ModuleDef, 'inputs' | 'artifacts' | 'acceptance' | 'metrics' | 'references'> & {
    inputs?: string[]
    artifacts?: string[]
    acceptance?: string[]
    metrics?: string[]
    references?: string[]
  },
): ModuleDef {
  return {
    ...input,
    inputs: input.inputs ?? [],
    artifacts: input.artifacts ?? [],
    acceptance: input.acceptance ?? [],
    metrics: input.metrics ?? [],
    references: input.references ?? [],
    fields: input.fields.map((field) => ({
      ...field,
      related_outputs: field.related_outputs.length > 0 ? field.related_outputs : [input.draftPath],
    })),
  }
}

export const MASCOT_SKIP = 'config.modules.mascot == false'
export const GAME_SKIP = 'config.modules.gamification == false'
