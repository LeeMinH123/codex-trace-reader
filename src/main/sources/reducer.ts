import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import { fields } from '../records/json'
import { parseTrace } from '../records/trace'
import { rawIndex } from '../records/trace-evidence'
import { canonicalPath, fixedPath, MiB, readBounded } from './files'
import type { Manifest } from './bundle'
import { readTraceEvents } from './trace-turns'

const run = promisify(execFile)
const bundleLimit = 512 * MiB
const stateLimit = 96 * MiB

export interface RecordingExecutable {
  path: string
  identity: string
}

async function executableIdentity(path: string): Promise<string> {
  const file = await stat(path, { bigint: true })
  return [file.dev, file.ino, file.size, file.mtimeNs].join(':')
}

export async function recordingExecutable(path: string): Promise<RecordingExecutable> {
  if (basename(path).toLowerCase() !== 'codex.exe') throw new Error('기록에 사용한 codex.exe를 선택하세요.')
  const executable = await canonicalPath(path, 'file')
  if (basename(executable).toLowerCase() !== 'codex.exe') throw new Error('codex.exe 실행 파일을 확인할 수 없습니다.')
  return { path: executable, identity: await executableIdentity(executable) }
}

export async function reduceBundle(manifest: Manifest, { path: executable, identity }: RecordingExecutable) {
  await fixedPath(executable, 'file')
  if (await executableIdentity(executable) !== identity) throw new Error('선택한 실행 파일이 변경됐습니다. 기록에 사용한 파일을 다시 선택하세요.')
  const temp = await mkdtemp(join(tmpdir(), 'codex-trace-reader-'))
  try {
    const staged = join(temp, 'bundle')
    const payloads = join(staged, 'payloads')
    const sourcePayloads = join(manifest.path, 'payloads')
    const output = join(temp, 'state.json')
    const cliHome = join(temp, 'cli')
    await Promise.all([mkdir(payloads, { recursive: true }), mkdir(cliHome)])

    const raw = await readTraceEvents(manifest.path)
    const events = rawIndex(raw.toString('utf8'))
    const shards = new Set<number>()
    await fixedPath(sourcePayloads, 'directory')
    let remaining = bundleLimit - raw.length - manifest.bytes.length
    for (const entry of await readdir(sourcePayloads, { withFileTypes: true })) {
      if (!/^\d{6,16}\.zst$/.test(entry.name)) continue
      const shard = Number.parseInt(entry.name, 10)
      if (!Number.isSafeInteger(shard) || entry.name !== `${String(shard).padStart(6, '0')}.zst`) continue
      const bytes = await readBounded(join(sourcePayloads, entry.name), remaining, true)
      remaining -= bytes.length
      await writeFile(join(payloads, entry.name), bytes, { flag: 'wx' })
      shards.add(shard)
    }
    await Promise.all([
      writeFile(join(staged, 'manifest.json'), manifest.bytes, { flag: 'wx' }),
      writeFile(join(staged, 'trace.jsonl'), events.partial ? raw.subarray(0, raw.lastIndexOf(10) + 1) : raw, { flag: 'wx' }),
    ])

    const env: NodeJS.ProcessEnv = { ...process.env, CODEX_HOME: cliHome }
    for (const key of Object.keys(env)) {
      if (/^(CODEX_ROLLOUT_TRACE_ROOT|ELECTRON_RUN_AS_NODE|NODE_OPTIONS)$/i.test(key)) delete env[key]
    }
    const options = { cwd: temp, env, windowsHide: true, maxBuffer: MiB }
    let help: string
    try {
      const { stdout } = await run(executable, ['debug', 'trace-reduce', '--help'], { ...options, timeout: 8000 })
      help = stdout
    } catch {
      throw new Error('선택한 codex.exe에서 trace-reduce 명령을 확인할 수 없습니다.')
    }
    if (!/trace-reduce/.test(help) || !/--output\b/.test(help)) {
      throw new Error('선택한 codex.exe에서 trace-reduce의 임시 출력 옵션을 지원하지 않습니다.')
    }
    try {
      await run(executable, ['debug', 'trace-reduce', staged, '--output', output], { ...options, timeout: 45000 })
    } catch (error) {
      const failure = error as { killed?: boolean; code?: unknown }
      if (failure.killed || failure.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') throw new Error('변환이 시간 또는 출력 한도를 초과했습니다.')
      const code = typeof failure.code === 'number' ? ` 종료 코드 ${failure.code}.` : ''
      throw new Error(`번들을 변환하지 못했습니다.${code} 기록에 사용한 실행 파일과 원본 번들 상태를 확인하세요.`)
    }
    if (await executableIdentity(executable) !== identity) throw new Error('변환 중 실행 파일이 변경됐습니다.')
    const state = fields(JSON.parse((await readBounded(output, stateLimit, true)).toString('utf8')))
    if (state.schema_version !== 3 || state.trace_id !== manifest.id
      || state.root_thread_id !== manifest.rootId || state.rollout_id !== manifest.rolloutId
      || state.started_at_unix_ms !== manifest.startedAt) {
      throw new Error('reducer 결과의 스키마 또는 식별 정보가 선택한 번들과 다릅니다.')
    }
    return parseTrace(manifest.path, state, events, shards)
  } finally {
    await rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 })
  }
}
