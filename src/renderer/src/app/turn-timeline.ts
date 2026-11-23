import type { Action, Turn } from '../../../shared/reader'

export interface TimelineBar {
  action: Action
  kind: 'model' | 'tool' | 'message'
  label: string
  depth: 0 | 1
  startPct: number
  widthPct: number
  durationMs: number | null
  isPoint: boolean
  hasDelivery: boolean
}

export interface TurnTimelineData {
  startMs: number | null
  endMs: number | null
  totalMs: number
  bars: TimelineBar[]
  ticks: { pct: number; offsetMs: number; timeMs: number | null }[]
}

export function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0 || !Number.isFinite(ms)) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60000)
  const secs = Math.round((ms % 60000) / 1000)
  return secs === 60 ? `${mins + 1}m 0s` : `${mins}m ${secs}s`
}

function clipText(value: string | undefined, limit: number): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > limit ? text.slice(0, limit) + '…' : text
}

function compareChrono(a: Pick<Action, 'time' | 'sequence' | 'id'>, b: Pick<Action, 'time' | 'sequence' | 'id'>): number {
  const timeOrder = (a.time ?? Infinity) - (b.time ?? Infinity)
  const sequenceOrder = (a.sequence ?? Infinity) - (b.sequence ?? Infinity)
  return timeOrder || sequenceOrder || (a.id < b.id ? -1 : a.id === b.id ? 0 : 1)
}

export function buildTurnTimeline(turn: Turn): TurnTimelineData {
  const items = turn.actions
    .filter((action) => action.reading?.stage === 'progress' || action.kind === 'model')
    .slice()
    .sort(compareChrono)

  const byId = new Map(items.map((action) => [action.id, action]))
  const childrenByParent = new Map<string, Action[]>()
  const nestedIds = new Set<string>()
  for (const action of items) {
    if (action.kind === 'message' || action.kind === 'model') continue
    const parentId = action.parent?.id
    if (!parentId || parentId === action.id) continue
    const parent = byId.get(parentId)
    if (!parent || parent.kind === 'message') continue
    const seen = new Set<string>([action.id])
    let cursor: string | undefined = parentId
    let cyclic = false
    while (cursor) {
      if (seen.has(cursor)) {
        cyclic = true
        break
      }
      seen.add(cursor)
      cursor = byId.get(cursor)?.parent?.id
    }
    if (cyclic) continue
    nestedIds.add(action.id)
    const list = childrenByParent.get(parentId) ?? []
    list.push(action)
    childrenByParent.set(parentId, list)
  }

  const ordered: { action: Action; depth: 0 | 1 }[] = []
  const visit = (action: Action, depth: 0 | 1) => {
    ordered.push({ action, depth })
    for (const child of childrenByParent.get(action.id) ?? []) {
      visit(child, 1)
    }
  }
  for (const action of items) {
    if (!nestedIds.has(action.id)) visit(action, 0)
  }

  let minTime: number | null = null
  let maxTime: number | null = null
  for (const { action } of ordered) {
    if (action.time !== null) {
      if (minTime === null || action.time < minTime) minTime = action.time
      const finish = action.endTime ?? action.time
      if (finish !== null && (maxTime === null || finish > maxTime)) maxTime = finish
    }
  }

  const startMs = minTime
  const endMs = minTime !== null && maxTime !== null ? Math.max(maxTime, minTime) : null
  const totalMs = startMs !== null && endMs !== null ? Math.max(endMs - startMs, 1) : 1

  let modelCounter = 0
  const bars: TimelineBar[] = ordered.map(({ action, depth }) => {
    const kind: TimelineBar['kind'] = action.kind === 'model' ? 'model' : action.kind === 'message' ? 'message' : 'tool'
    let label: string
    if (kind === 'model') {
      modelCounter += 1
      label = `모델 요청 ${modelCounter}`
    } else if (kind === 'message') {
      label = clipText(action.reading?.text ?? action.summary, 36) || '진행 메시지'
    } else {
      label = [action.reading?.title ?? action.label, action.reading?.target?.text].filter(Boolean).join(' · ')
    }

    const durationMs = action.time !== null && action.endTime !== undefined && action.endTime !== null && action.endTime >= action.time
      ? action.endTime - action.time
      : null

    let startPct = 0
    let widthPct = 0
    let isPoint = true
    if (startMs !== null && action.time !== null) {
      startPct = Math.max(0, Math.min(100, ((action.time - startMs) / totalMs) * 100))
      if (durationMs !== null && durationMs > 0) {
        isPoint = false
        widthPct = Math.min(100 - startPct, Math.max((durationMs / totalMs) * 100, 1.5))
      }
    }

    return {
      action,
      kind,
      label,
      depth,
      startPct,
      widthPct,
      durationMs,
      isPoint,
      hasDelivery: Boolean(action.deliveries && action.deliveries.length > 0),
    }
  })

  const ticks = [0, 25, 50, 75, 100].map((pct) => {
    const offsetMs = startMs !== null ? (totalMs * pct) / 100 : 0
    return {
      pct,
      offsetMs,
      timeMs: startMs !== null ? Math.round(startMs + offsetMs) : null,
    }
  })

  return { startMs, endMs, totalMs, bars, ticks }
}
