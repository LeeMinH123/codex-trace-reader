import type { Action, Turn } from '../../../shared/reader'
import { tallyTitles } from './reading-groups'
import { buildTurnIwo } from './turn-iwo'

export interface StoryChapter {
  id: string
  index: number
  heading: string
  headingAction?: Action
  fullMessage?: string
  summary: string
  actions: Action[]
  nestedByParent: Map<string, Action[]>
  totalActionCount: number
  visualTags: { label: string; count: number; phase: ToolPhase }[]
}

export interface TurnStory {
  requests: Action[]
  instructions: Action[]
  chapters: StoryChapter[]
  answers: Action[]
  modifiedFiles: { file: string; actionId: string }[]
  verifications: { label: string; outcome?: string; actionId: string }[]
}

export type ToolPhase = 'explore' | 'ui' | 'edit' | 'verify' | 'run'

const exploreTitles = new Set([
  '파일 읽기',
  '폴더 내용 확인',
  '파일 목록 확인',
  '텍스트 검색',
  'Git 변경 상태 확인',
  '코드 변경 비교',
  '웹 검색 또는 자료 조회',
])

const uiTitles = new Set([
  '화면 캡처',
  '화면 클릭',
  '화면 클릭 후 캡처',
  '키보드 입력',
  '키보드 입력 후 캡처',
  '화면 스크롤',
  '앱·페이지 열기',
  '창·앱 조작',
  '이미지 확인',
])

export function phaseOfTool(action: Action): ToolPhase {
  const title = action.reading?.title ?? action.label
  if (exploreTitles.has(title)) return 'explore'
  if (uiTitles.has(title)) return 'ui'
  if (title === '파일 수정') return 'edit'
  if (title === '테스트 실행') return 'verify'
  return 'run'
}

const phaseLabels: Record<ToolPhase, string> = {
  explore: '탐색',
  ui: '화면',
  edit: '수정',
  verify: '검증',
  run: '실행',
}

function buildVisualTags(actions: Action[]): { label: string; count: number; phase: ToolPhase }[] {
  const counts = new Map<ToolPhase, number>()
  for (const action of actions) {
    const phase = phaseOfTool(action)
    counts.set(phase, (counts.get(phase) ?? 0) + 1)
  }
  const order: ToolPhase[] = ['explore', 'ui', 'edit', 'verify', 'run']
  return order
    .filter((phase) => (counts.get(phase) ?? 0) > 0)
    .map((phase) => ({ label: phaseLabels[phase], count: counts.get(phase)!, phase }))
}

function headingForPhase(phase: ToolPhase, actions: Action[]): string {
  if (phase === 'explore') return '자료와 코드 확인'
  if (phase === 'ui') return '화면 확인과 조작'
  if (phase === 'edit') return '파일 수정'
  if (phase === 'verify') return '테스트 확인'
  return tallyTitles(actions)[0]?.title ?? '작업 실행'
}

export function headingFromMessage(text: string): { heading: string; truncated: boolean } {
  const normalized = text.trim()
  if (!normalized) return { heading: '진행 안내', truncated: false }
  const firstLine = normalized.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? ''
  const compact = firstLine.replace(/\s+/g, ' ').trim()
  if (compact.length > 96) {
    return { heading: compact.slice(0, 96).trimEnd() + '…', truncated: true }
  }
  return {
    heading: compact,
    truncated: normalized.replace(/\s+/g, ' ').trim() !== compact,
  }
}

export function summarizeChapterActions(actions: Action[]): string {
  if (actions.length === 0) return ''
  const readFiles: string[] = []
  const seenReads = new Set<string>()
  const editFiles: string[] = []
  const seenEdits = new Set<string>()
  const searchQueries: string[] = []
  const seenSearches = new Set<string>()
  const testActions: Action[] = []
  const uiActions: Action[] = []
  const otherTools: Action[] = []

  for (const action of actions) {
    const title = action.reading?.title ?? action.label
    const target = action.reading?.target?.text
    if (title === '파일 읽기' && target) {
      if (!seenReads.has(target)) {
        seenReads.add(target)
        readFiles.push(target)
      }
    } else if (title === '파일 수정' && target) {
      if (!seenEdits.has(target)) {
        seenEdits.add(target)
        editFiles.push(target)
      }
    } else if (title === '텍스트 검색' && target) {
      if (!seenSearches.has(target)) {
        seenSearches.add(target)
        searchQueries.push(target)
      }
    } else if (title === '테스트 실행') {
      testActions.push(action)
    } else if (uiTitles.has(title)) {
      uiActions.push(action)
    } else {
      otherTools.push(action)
    }
  }

  const phrases: string[] = []
  if (readFiles.length === 1) {
    phrases.push(`${readFiles[0]} 읽음`)
  } else if (readFiles.length === 2) {
    phrases.push(`${readFiles[0]}, ${readFiles[1]} 읽음`)
  } else if (readFiles.length >= 3) {
    phrases.push(`${readFiles[0]}, ${readFiles[1]} 외 ${readFiles.length - 2}개 파일 읽음`)
  }

  if (searchQueries.length === 1) {
    phrases.push(`"${searchQueries[0]}" 검색`)
  } else if (searchQueries.length >= 2) {
    phrases.push(`"${searchQueries[0]}" 외 ${searchQueries.length - 1}건 검색`)
  }

  if (editFiles.length === 1) {
    phrases.push(`${editFiles[0]} 수정`)
  } else if (editFiles.length >= 2) {
    phrases.push(`${editFiles[0]} 외 ${editFiles.length - 1}개 파일 수정`)
  }

  if (testActions.length > 0) {
    const outcome = testActions.at(-1)?.reading?.outcome
    if (outcome) phrases.push(`테스트 실행 (${outcome})`)
    else if (testActions.length > 1) phrases.push(`테스트 실행 ×${testActions.length}`)
    else phrases.push('테스트 실행')
  }

  for (const { title, count } of tallyTitles(uiActions)) {
    if (count > 1) {
      phrases.push(`${title} ×${count}`)
    } else {
      const target = uiActions.find((action) => (action.reading?.title ?? action.label) === title)?.reading?.target?.text
      phrases.push(target ? `${title} (${target})` : title)
    }
  }

  for (const { title, count } of tallyTitles(otherTools)) {
    phrases.push(count > 1 ? `${title} ×${count}` : title)
  }

  return phrases.slice(0, 3).join(' · ')
}

function collectNested(progress: Action[]) {
  const byId = new Map(progress.map((action) => [action.id, action]))
  const childrenByParent = new Map<string, Action[]>()
  const nestedIds = new Set<string>()
  for (const action of progress) {
    if (action.kind === 'message') continue
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

  const descendantsOf = (parentId: string): Action[] => {
    const out: Action[] = []
    for (const child of childrenByParent.get(parentId) ?? []) {
      out.push(child, ...descendantsOf(child.id))
    }
    return out
  }

  return { nestedIds, descendantsOf }
}

export function buildStoryChapters(turn: Turn): StoryChapter[] {
  const progress = turn.actions.filter((action) => action.reading?.stage === 'progress')
  const { nestedIds, descendantsOf } = collectNested(progress)
  const topProgress = progress.filter((action) => !nestedIds.has(action.id))

  const createChapter = (
    id: string,
    index: number,
    heading: string,
    tools: Action[],
    headingAction?: Action,
    fullMessage?: string,
  ): StoryChapter => {
    const nestedByParent = new Map<string, Action[]>()
    const allActions: Action[] = []
    for (const tool of tools) {
      allActions.push(tool)
      const nested = descendantsOf(tool.id)
      if (nested.length > 0) {
        nestedByParent.set(tool.id, nested)
        allActions.push(...nested)
      }
    }
    return {
      id,
      index,
      heading,
      headingAction,
      fullMessage,
      summary: summarizeChapterActions(allActions),
      actions: tools,
      nestedByParent,
      totalActionCount: allActions.length,
      visualTags: buildVisualTags(allActions),
    }
  }

  const chapters: StoryChapter[] = []
  const hasMessages = topProgress.some((action) => action.kind === 'message')

  if (hasMessages) {
    let leadingTools: Action[] = []
    let currentMessage: Action | null = null
    let currentTools: Action[] = []

    const flushMessage = () => {
      if (!currentMessage) return
      const rawText = currentMessage.reading?.text ?? currentMessage.summary
      const { heading, truncated } = headingFromMessage(rawText)
      chapters.push(createChapter(
        `chapter:${currentMessage.id}`,
        chapters.length + 1,
        heading,
        currentTools,
        currentMessage,
        truncated ? rawText : undefined,
      ))
      currentMessage = null
      currentTools = []
    }

    for (const action of topProgress) {
      if (action.kind === 'message') {
        if (!currentMessage && leadingTools.length > 0) {
          const leadPhase = phaseOfTool(leadingTools[0])
          const unified = leadingTools.every((tool) => phaseOfTool(tool) === leadPhase)
          chapters.push(createChapter(
            `chapter:lead:${leadingTools[0].id}`,
            chapters.length + 1,
            unified ? headingForPhase(leadPhase, leadingTools) : '먼저 살펴본 내용',
            leadingTools,
          ))
          leadingTools = []
        }
        flushMessage()
        currentMessage = action
      } else if (currentMessage) {
        currentTools.push(action)
      } else {
        leadingTools.push(action)
      }
    }
    flushMessage()
  } else if (topProgress.length > 0) {
    let currentPhase: ToolPhase | null = null
    let group: Action[] = []
    const flushPhase = () => {
      if (!currentPhase || group.length === 0) return
      chapters.push(createChapter(
        `chapter:${group[0].id}`,
        chapters.length + 1,
        headingForPhase(currentPhase, group),
        group,
      ))
      group = []
    }
    for (const action of topProgress) {
      const phase = phaseOfTool(action)
      if (currentPhase !== null && phase !== currentPhase) {
        flushPhase()
      }
      currentPhase = phase
      group.push(action)
    }
    flushPhase()
  }

  return chapters
}

export function buildTurnStory(turn: Turn, actionsById: Map<string, Action>): TurnStory {
  const iwo = buildTurnIwo(turn, actionsById)
  return {
    requests: iwo.input.requests,
    instructions: iwo.input.instructions,
    chapters: buildStoryChapters(turn),
    answers: iwo.output.answers,
    modifiedFiles: iwo.output.modifiedFiles,
    verifications: iwo.output.verifications,
  }
}
