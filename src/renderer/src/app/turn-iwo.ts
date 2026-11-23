import type { Action, Turn } from '../../../shared/reader'
import { summarizeTurnProgress, tallyTitles, type TitleCount } from './reading-groups'

export interface TurnIwoSummary {
  input: {
    requests: Action[]
    instructions: Action[]
  }
  work: {
    messages: number
    tools: number
    nested: number
    topTitles: TitleCount[]
  }
  output: {
    answers: Action[]
    modifiedFiles: { file: string; actionId: string }[]
    verifications: { label: string; outcome?: string; actionId: string }[]
  }
}

export function buildTurnIwo(turn: Turn, actionsById: Map<string, Action>): TurnIwoSummary {
  const requests = turn.actions.filter((action) => action.reading?.stage === 'request')
  const mappedInstructions = (turn.instructionIds ?? [])
    .map((id) => actionsById.get(id))
    .filter((action): action is Action => Boolean(action))
  const instructions = mappedInstructions.length > 0
    ? mappedInstructions
    : turn.actions.filter((action) => action.kind === 'instruction')

  const progress = summarizeTurnProgress(turn)
  const toolActions = turn.actions.filter((action) => action.reading?.stage === 'progress' && action.kind !== 'message')
  const topTitles = tallyTitles(toolActions).slice(0, 3)

  const answers = turn.actions.filter((action) => action.reading?.stage === 'answer')
  const seenFiles = new Set<string>()
  const modifiedFiles: { file: string; actionId: string }[] = []
  const verifications: { label: string; outcome?: string; actionId: string }[] = []
  for (const action of turn.actions) {
    if (action.reading?.title === '파일 수정' && action.reading.target?.text) {
      const file = action.reading.target.text
      if (!seenFiles.has(file)) {
        seenFiles.add(file)
        modifiedFiles.push({ file, actionId: action.id })
      }
    }
    if (action.reading?.title === '테스트 실행') {
      verifications.push({
        label: action.reading.title,
        outcome: action.reading.outcome,
        actionId: action.id,
      })
    }
  }

  return {
    input: { requests, instructions },
    work: { ...progress, topTitles },
    output: { answers, modifiedFiles, verifications },
  }
}
