import type { Action, Turn } from '../../../shared/reader'
import { visibleReadingOrder } from './reading-groups'

export interface TimelineMatch {
  turnId: string
  actionId: string
  groupIds: string[]
  hiddenHint?: string
}

export interface TimelineSearchResult {
  words: string[]
  matches: TimelineMatch[]
  matchedActions: Map<string, TimelineMatch>
  turnMatchCounts: Map<string, number>
  groupMatchCounts: Map<string, number>
}

export interface HighlightSegment {
  text: string
  match: boolean
}

export function normalizeSearch(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR')
}

export function searchWords(query: string): string[] {
  return normalizeSearch(query.trim()).split(/\s+/).filter(Boolean)
}

export function visibleTimelineTurns(turns: Turn[], raw: boolean): Turn[] {
  return raw ? turns : turns.filter((turn) => turn.threadTurnId || turn.actions.some((action) => action.reading))
}

function searchFields(action: Action, raw: boolean): { visible: string[]; hidden: string[] } {
  const reading = [
    action.reading?.title,
    action.reading?.target?.label,
    action.reading?.target?.text,
    action.reading?.text,
    action.reading?.outcome,
  ].filter((value): value is string => Boolean(value))
  const record = [
    action.label,
    action.summary,
    action.actor,
    action.status,
    action.parent?.rule,
  ].filter((value): value is string => Boolean(value))
  return raw ? { visible: record, hidden: reading } : { visible: reading, hidden: record }
}

function clipHint(text: string, limit = 140): string {
  const singleLine = text.replace(/\s+/g, ' ').trim()
  return singleLine.length > limit ? singleLine.slice(0, limit) + '…' : singleLine
}

export function searchTimeline(turns: Turn[], query: string, raw: boolean): TimelineSearchResult {
  const words = searchWords(query)
  const matches: TimelineMatch[] = []
  const matchedActions = new Map<string, TimelineMatch>()
  const turnMatchCounts = new Map<string, number>()
  const groupMatchCounts = new Map<string, number>()
  if (words.length === 0) {
    return { words, matches, matchedActions, turnMatchCounts, groupMatchCounts }
  }

  for (const turn of visibleTimelineTurns(turns, raw)) {
    const items = raw
      ? turn.actions.map((action) => ({ action, groupIds: [] as string[] }))
      : visibleReadingOrder(turn)
    for (const { action, groupIds } of items) {
      const { visible, hidden } = searchFields(action, raw)
      const visibleText = normalizeSearch(visible.join(' '))
      const combinedText = normalizeSearch([...visible, ...hidden].join(' '))
      if (!words.every((word) => combinedText.includes(word))) continue
      const missingWords = words.filter((word) => !visibleText.includes(word))
      let hiddenHint: string | undefined
      if (missingWords.length > 0) {
        const source = hidden.find((candidate) => {
          const normalized = normalizeSearch(candidate)
          return missingWords.some((word) => normalized.includes(word))
        })
        if (source) hiddenHint = clipHint(source)
      }
      const match: TimelineMatch = { turnId: turn.id, actionId: action.id, groupIds, hiddenHint }
      matches.push(match)
      matchedActions.set(action.id, match)
      turnMatchCounts.set(turn.id, (turnMatchCounts.get(turn.id) ?? 0) + 1)
      for (const groupId of groupIds) {
        groupMatchCounts.set(groupId, (groupMatchCounts.get(groupId) ?? 0) + 1)
      }
    }
  }

  return { words, matches, matchedActions, turnMatchCounts, groupMatchCounts }
}

export function highlightSegments(text: string, words: string[]): HighlightSegment[] {
  const unique = [...new Set(words.filter(Boolean))].sort((a, b) => b.length - a.length)
  if (!text || unique.length === 0) return [{ text, match: false }]
  const pattern = unique.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const regex = new RegExp(pattern, 'gi')
  const segments: HighlightSegment[] = []
  let last = 0
  for (const hit of text.matchAll(regex)) {
    const start = hit.index ?? 0
    const token = hit[0]
    if (!token) continue
    if (start > last) segments.push({ text: text.slice(last, start), match: false })
    segments.push({ text: token, match: true })
    last = start + token.length
  }
  if (last < text.length) segments.push({ text: text.slice(last), match: false })
  return segments.length > 0 ? segments : [{ text, match: false }]
}
