import type { Action, ReadingAction } from '../../shared/reader'
import { fields, preview, string, type Fields } from './json'

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntities(text: string) {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const point = /^#x/i.test(entity) ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1))
      return point > 0 && point <= 0x10ffff && (point < 0xd800 || point > 0xdfff) ? String.fromCodePoint(point) : match
    }
    return Object.hasOwn(entities, entity.toLowerCase()) ? entities[entity.toLowerCase()] : match
  })
}

export function userRequest(text: string): string {
  const content = decodeEntities(text)
    .replace(/<(environment_context|instructions|turn_aborted|attachments)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi, '')
    .replace(/^#{1,6}\s+(?:AGENTS\.md instructions|Context from my IDE setup|Files mentioned by the user|Attachments)\b[^\n]*(?:\n(?!#{1,6}\s)[^\n]*)*/gim, '')
    .replace(/^#{1,6}\s+(?:My request for Codex|User request)\s*:?\s*$/gim, '')
    .trim()
  if (/^<(?:environment_context|instructions|turn_aborted|attachments)(?:\s|>)/i.test(content)) return ''
  return content
}

function withoutMarkup(text: string) {
  return decodeEntities(text)
    .replace(/!?\[([^\]\n]*)\]\((?:<[^>\n]*>|[^)\n]*)\)/g, '$1')
    .replace(/^[ \t]*(?:#{1,6}|>)\s+/gm, '')
    .replace(/(\*\*|__|~~|`+)([^\n]+?)\1/g, '$2')
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|$|[.,!?])/g, '$1$2')
}

export function plainPreview(text: string, limit: number) {
  return preview(withoutMarkup(text)
    .replace(/^[ \t]*[-*+]\s+/gm, '')
    .replace(/(^|[\s(])(?:[a-z]:[\\/]|\/(?:Users|home|mnt|tmp)\/)[^\s)`]+/gi,
      (path, space: string) => space + (path.trim().split(/[\\/]/).at(-1) ?? '')), limit)
}

export function readableMessage(role: unknown, channel: unknown, body: string): ReadingAction | undefined {
  if (role === 'user') {
    const text = userRequest(body)
    if (text) return { stage: 'request', title: '사용자 요청', text: readingExcerpt(text) }
  }
  if (role === 'assistant' && body.trim()) {
    if (channel === 'final') return { stage: 'answer', title: '답변', text: readingExcerpt(body) }
    if (channel === 'commentary') return { stage: 'progress', title: '진행 메시지', text: readingExcerpt(body) }
  }
}

function readingExcerpt(text: string) {
  const visible = withoutMarkup(text).trim()
  return visible.length > 1400 ? visible.slice(0, 1400) + '…' : visible
}

const instructionRules: Array<[label: string, test: (raw: string, lower: string) => boolean]> = [
  ['앱·작업공간 맥락', (_raw, lower) => lower.includes('<app-context') || lower.includes('codex desktop context')],
  ['하위 에이전트 역할', (_raw, lower) => lower.includes('<multi_agent_role')],
  ['멀티에이전트 모드', (_raw, lower) => lower.includes('<multi_agent_mode')],
  ['현재 시각 정보', (_raw, lower) => lower.includes('<codex_apps_client_time_context')],
  ['권한·샌드박스 규칙', (_raw, lower) => lower.includes('<permissions instructions>') || lower.includes('<sandbox')],
  ['협업 모드 지침', (_raw, lower) => lower.includes('<collaboration_mode')],
  ['응답 성향 지침', (_raw, lower) => lower.includes('<personality_spec')],
  ['사용 가능한 스킬 목록', (raw, lower) => lower.includes('<skills_instructions>') || raw.includes('## Skills')],
  ['저장소 지침 (AGENTS.md)', (raw, lower) => raw.includes('AGENTS.md') || lower.includes('# agents.md')],
  ['Codex 기본 지침', (raw, lower) => raw.startsWith('You are Codex') || lower.startsWith('you are codex')],
]

function stripXmlTags(text: string) {
  return text.replace(/<\/?[a-zA-Z_][a-zA-Z0-9_:-]*(?:\s+[^>]*)?>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function describeInstructionMessage(role: unknown, body: string): { label: string; summary: string } {
  const raw = body.trim()
  const lower = raw.toLowerCase()
  const matched = instructionRules.find(([, test]) => test(raw, lower))
  const label = matched ? matched[0] : (role === 'system' ? '시스템 지침' : '개발자 지침')

  if (label === '현재 시각 정보') {
    const timezone = raw.match(/<timezone>([^<]+)<\/timezone>/i)?.[1]?.trim()
    const currentDate = raw.match(/<current_date>([^<]+)<\/current_date>/i)?.[1]?.trim()
    const parts = [timezone, currentDate].filter(Boolean)
    if (parts.length > 0) return { label, summary: parts.join(' · ') }
  }

  const stripped = stripXmlTags(raw)
  return {
    label,
    summary: plainPreview(stripped || raw, 140),
  }
}

export function describeSettingsRecord(item: Fields): string {
  const parts: string[] = []
  const model = string(item.model)
  if (model) parts.push(`모델 ${model}`)

  const cwd = string(item.cwd)
  if (cwd) {
    const folder = cwd.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) || cwd
    parts.push(`폴더 ${folder}`)
  }

  const approval = string(item.approval_policy)
    ?? string(fields(item.approval_policy).mode)
    ?? string(fields(item.approval_policy).type)
  if (approval) parts.push(`승인 ${approval}`)

  const sandbox = string(item.sandbox_policy)
    ?? string(fields(item.sandbox_policy).type)
    ?? string(fields(item.sandbox_policy).mode)
  if (sandbox) parts.push(`샌드박스 ${sandbox}`)

  const effort = string(item.effort) ?? string(item.reasoning_effort)
  if (effort) parts.push(`추론 ${effort}`)

  return preview(parts.join(' · '), 140)
}

export function selectInstructionIds(actions: Action[]): string[] {
  const seenGuides = new Set<string>()
  const ids: string[] = []
  let latestSettingsId: string | undefined
  let latestNonEmptySettingsId: string | undefined

  for (const action of actions) {
    if (action.label === '설정 기록') {
      latestSettingsId = action.id
      if (action.summary.trim()) latestNonEmptySettingsId = action.id
      continue
    }
    const key = `${action.label}:${action.summary}`
    if (seenGuides.has(key)) continue
    seenGuides.add(key)
    ids.push(action.id)
  }

  const chosenSettingsId = latestNonEmptySettingsId ?? latestSettingsId
  if (chosenSettingsId) ids.push(chosenSettingsId)
  return ids
}

