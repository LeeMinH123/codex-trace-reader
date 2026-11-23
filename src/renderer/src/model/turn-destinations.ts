import type { RolloutInfo, TurnCoverage } from '../../../shared/reader'
import type { TurnDestination } from '../components/common/TurnLinks'
import { stamp } from '../components/common/time'

export function rolloutLabel(rollout: RolloutInfo) {
  const kind = rollout.id === rollout.threadId ? '처음 기록' : '이후 기록'
  return `${stamp(rollout.startedAt)} · ${kind}`
}

export function indexDestinations<T extends { id: string; path: string }>(
  sources: T[], coverage: TurnCoverage[], label: (source: T) => string,
) {
  const bySource = new Map(coverage.map(({ id, turnIds }) => [id, turnIds]))
  const index = new Map<string, TurnDestination[]>()
  for (const source of sources) {
    const target = { id: source.id, label: label(source), path: source.path }
    for (const turnId of bySource.get(source.id) ?? []) {
      const targets = index.get(turnId) ?? []
      targets.push(target)
      index.set(turnId, targets)
    }
  }
  return index
}
