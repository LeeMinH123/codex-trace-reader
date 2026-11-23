import { basename, join } from 'node:path'
import type { BundleInfo } from '../../shared/reader'
import { fields, number, string } from '../records/json'
import { MiB, readBounded } from './files'

export interface Manifest extends BundleInfo {
  rootId: string
  rolloutId: string
  bytes: Buffer
}

export async function readManifest(path: string, sessionId: string): Promise<Manifest> {
  if (!basename(path).startsWith('trace-')) throw new Error('trace-로 시작하는 상세 번들 폴더를 선택하세요.')
  const bytes = await readBounded(join(path, 'manifest.json'), MiB, true)
  const data = fields(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')))
  const rootId = string(data.root_thread_id)
  if (!rootId) throw new Error('manifest.json의 root_thread_id에서 채팅 ID를 확인할 수 없습니다.')
  if (rootId !== sessionId) throw new Error('선택한 폴더의 채팅 ID가 세션과 다릅니다. 상세 기록 다시 찾기를 사용해 보세요.')
  const id = string(data.trace_id)
  const rolloutId = string(data.rollout_id)
  const startedAt = number(data.started_at_unix_ms)
  if (!id || !rolloutId || startedAt === null || Math.abs(startedAt) > 8.64e15) {
    throw new Error('manifest.json에서 번들 ID, 실행 ID 또는 시작 시각을 확인할 수 없습니다.')
  }
  if (data.schema_version !== 3) throw new Error('데스크톱 트레이스 스키마 3을 지원합니다.')
  if (data.raw_event_log !== 'trace.jsonl' || data.payloads_dir !== 'payloads') {
    throw new Error('manifest.json의 이벤트 파일 또는 페이로드 폴더가 표준 번들 경로와 다릅니다.')
  }
  return { id, rootId, rolloutId, startedAt, path, bytes }
}

export function bundleInfo({ id, path, startedAt }: BundleInfo): BundleInfo {
  return { id, path, startedAt }
}
