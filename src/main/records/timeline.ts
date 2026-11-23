import { randomUUID } from 'node:crypto'
import type { Action, ActionDetail, ActionKind, DetailSection, Timeline, Turn } from '../../shared/reader'
import { compareId, display, number, string, type Fields } from './json'

export interface Snapshot {
  timeline: Timeline
  inspect(actionId: string): ActionDetail | null
}

export function section(title: string, value: unknown, kind?: DetailSection['kind']): DetailSection[] {
  return value === undefined || value === null || value === '' ? [] : [{ title, text: display(value), kind }]
}

export function position(execution: Fields): { time: number | null; sequence: number | null } {
  return { time: number(execution.started_at_unix_ms), sequence: number(execution.started_seq) }
}

export function chronologically(a: Pick<Action, 'time' | 'sequence' | 'id'>, b: typeof a): number {
  const timeOrder = (a.time ?? Infinity) - (b.time ?? Infinity)
  const sequenceOrder = (a.sequence ?? Infinity) - (b.sequence ?? Infinity)
  return timeOrder || sequenceOrder || compareId(a.id, b.id)
}

export function executionStatus(value: unknown, completed = '종료 기록 있음'): string | undefined {
  const statuses: Record<string, string> = {
    completed, failed: '기록상 실패', cancelled: '취소 기록', aborted: '중단 기록',
    running: '종료 기록 없음', starting: '시작 기록', yielded: '중간 반환 기록', terminated: '종료 기록',
  }
  const status = string(value)
  return status && (Object.hasOwn(statuses, status) ? statuses[status] : '상태 확인 불가')
}

export function messageLabel(role: unknown, channel?: unknown): [ActionKind, string] {
  switch (role) {
    case 'user': return ['message', '사용자 메시지']
    case 'assistant':
      if (channel === 'final') return ['message', '최종 응답']
      if (channel === 'commentary') return ['message', '진행 메시지']
      return ['message', '에이전트 메시지']
    case 'developer': return ['instruction', '개발자 지침']
    case 'system': return ['instruction', '시스템 지침']
    case 'tool': return ['tool', '도구 메시지']
    default: return ['record', '메시지']
  }
}

export function snapshot(
  meta: Pick<Timeline, 'lastAt' | 'status' | 'note'>,
  turns: Turn[],
  inspect: Snapshot['inspect'],
): Snapshot {
  return { timeline: { ...meta, token: randomUUID(), checkedAt: Date.now(), turns }, inspect }
}
