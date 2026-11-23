import type { Action, Turn } from '../../../shared/reader'

export interface TitleCount {
  title: string
  count: number
}

export interface ProgressMessageEntry {
  kind: 'message'
  action: Action
}

export interface ProgressActionEntry {
  kind: 'action'
  action: Action
}

export interface ProgressRunEntry {
  kind: 'run'
  id: string
  actions: Action[]
  titles: TitleCount[]
  startTime: number | null
  endTime: number | null
}

export interface ProgressCallGroupEntry {
  kind: 'call-group'
  id: string
  parent: Action
  children: (ProgressActionEntry | ProgressCallGroupEntry)[]
  descendantCount: number
  rules: string[]
  titles: TitleCount[]
  startTime: number | null
  endTime: number | null
}

export type ProgressEntry =
  | ProgressMessageEntry
  | ProgressActionEntry
  | ProgressRunEntry
  | ProgressCallGroupEntry

export function tallyTitles(actions: Action[]): TitleCount[] {
  const counts = new Map<string, number>()
  for (const action of actions) {
    const title = action.reading?.title ?? action.label
    counts.set(title, (counts.get(title) ?? 0) + 1)
  }
  return [...counts.entries()].map(([title, count]) => ({ title, count }))
}

export function formatTitleTally(titles: TitleCount[], maxDistinct = 4): string {
  const shown = titles.slice(0, maxDistinct).map(({ title, count }) => (count > 1 ? `${title} ×${count}` : title))
  return shown.join(' · ') + (titles.length > maxDistinct ? ` 외 ${titles.length - maxDistinct}종` : '')
}

function timeRangeOf(actions: Action[]): { startTime: number | null; endTime: number | null } {
  let startTime: number | null = null
  let endTime: number | null = null
  for (const { time } of actions) {
    if (time === null) continue
    if (startTime === null) startTime = time
    endTime = time
  }
  return { startTime, endTime }
}

function validParentLinks(progressActions: Action[]) {
  const byId = new Map(progressActions.map((action) => [action.id, action]))
  const candidateParent = new Map<string, string>()
  for (const action of progressActions) {
    if (action.kind === 'message') continue
    const parentId = action.parent?.id
    if (!parentId || parentId === action.id) continue
    const parent = byId.get(parentId)
    if (!parent || parent.kind === 'message') continue
    candidateParent.set(action.id, parentId)
  }
  const parentOf = new Map<string, string>()
  const childrenByParent = new Map<string, Action[]>()
  for (const action of progressActions) {
    const parentId = candidateParent.get(action.id)
    if (!parentId) continue
    const seen = new Set<string>([action.id])
    let cursor: string | undefined = parentId
    let cyclic = false
    while (cursor) {
      if (seen.has(cursor)) {
        cyclic = true
        break
      }
      seen.add(cursor)
      cursor = candidateParent.get(cursor)
    }
    if (cyclic) continue
    parentOf.set(action.id, parentId)
    const list = childrenByParent.get(parentId) ?? []
    list.push(action)
    childrenByParent.set(parentId, list)
  }
  return { parentOf, childrenByParent }
}

export function buildProgressFlow(progressActions: Action[]): ProgressEntry[] {
  const { parentOf, childrenByParent } = validParentLinks(progressActions)

  function buildCallGroup(parent: Action): { entry: ProgressCallGroupEntry; descendants: Action[] } {
    const direct = childrenByParent.get(parent.id) ?? []
    const children: (ProgressActionEntry | ProgressCallGroupEntry)[] = []
    const descendants: Action[] = []
    for (const child of direct) {
      descendants.push(child)
      if (childrenByParent.has(child.id)) {
        const nested = buildCallGroup(child)
        children.push(nested.entry)
        descendants.push(...nested.descendants)
      } else {
        children.push({ kind: 'action', action: child })
      }
    }
    const rules: string[] = []
    const seenRules = new Set<string>()
    for (const item of descendants) {
      const ruleText = item.parent?.rule
      if (!ruleText) continue
      for (const token of ruleText.split(' · ')) {
        if (!token || seenRules.has(token)) continue
        seenRules.add(token)
        rules.push(token)
      }
    }
    return {
      entry: {
        kind: 'call-group',
        id: `call:${parent.id}`,
        parent,
        children,
        descendantCount: descendants.length,
        rules,
        titles: tallyTitles(descendants),
        ...timeRangeOf(descendants),
      },
      descendants,
    }
  }

  const entries: ProgressEntry[] = []
  let buffer: Action[] = []
  const flush = () => {
    if (buffer.length === 0) return
    if (buffer.length === 1) {
      entries.push({ kind: 'action', action: buffer[0] })
    } else {
      entries.push({
        kind: 'run',
        id: `run:${buffer[0].id}`,
        actions: buffer,
        titles: tallyTitles(buffer),
        ...timeRangeOf(buffer),
      })
    }
    buffer = []
  }

  for (const action of progressActions) {
    if (parentOf.has(action.id)) continue
    if (action.kind === 'message') {
      flush()
      entries.push({ kind: 'message', action })
    } else if (childrenByParent.has(action.id)) {
      flush()
      entries.push(buildCallGroup(action).entry)
    } else {
      buffer.push(action)
    }
  }
  flush()
  return entries
}

export function collectProgressGroupIds(entries: ProgressEntry[]): string[] {
  const ids: string[] = []
  function visitCallGroup(group: ProgressCallGroupEntry) {
    ids.push(group.id)
    for (const child of group.children) {
      if (child.kind === 'call-group') visitCallGroup(child)
    }
  }
  for (const entry of entries) {
    if (entry.kind === 'run') ids.push(entry.id)
    else if (entry.kind === 'call-group') visitCallGroup(entry)
  }
  return ids
}

export function visibleReadingOrder(turn: Turn): { action: Action; groupIds: string[] }[] {
  const requests = turn.actions.filter((action) => action.reading?.stage === 'request')
  const progress = turn.actions.filter((action) => action.reading?.stage === 'progress')
  const answers = turn.actions.filter((action) => action.reading?.stage === 'answer')
  const ordered: { action: Action; groupIds: string[] }[] = requests.map((action) => ({ action, groupIds: [] }))

  function visitCallGroup(group: ProgressCallGroupEntry, ancestors: string[]) {
    ordered.push({ action: group.parent, groupIds: ancestors })
    const nextAncestors = [...ancestors, group.id]
    for (const child of group.children) {
      if (child.kind === 'action') ordered.push({ action: child.action, groupIds: nextAncestors })
      else visitCallGroup(child, nextAncestors)
    }
  }

  for (const entry of buildProgressFlow(progress)) {
    if (entry.kind === 'message' || entry.kind === 'action') {
      ordered.push({ action: entry.action, groupIds: [] })
    } else if (entry.kind === 'run') {
      for (const action of entry.actions) ordered.push({ action, groupIds: [entry.id] })
    } else {
      visitCallGroup(entry, [])
    }
  }
  for (const action of answers) ordered.push({ action, groupIds: [] })
  return ordered
}

export function summarizeTurnProgress(turn: Turn): { messages: number; tools: number; nested: number } {
  const progress = turn.actions.filter((action) => action.reading?.stage === 'progress')
  const { parentOf } = validParentLinks(progress)
  const messages = progress.filter((action) => action.kind === 'message').length
  const tools = progress.length - messages
  return { messages, tools, nested: parentOf.size }
}
