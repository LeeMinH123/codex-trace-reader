import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'
import type { SourceIssue } from '../../shared/reader'
import { readManifest, type Manifest } from './bundle'
import { failureMessage, fixedPath, pathKey } from './files'
import { recordingExecutable } from './reducer'

export function defaultTraceRoots(): string[] {
  const configured = process.env.CODEX_ROLLOUT_TRACE_ROOT
  return [
    ...(configured && isAbsolute(configured) ? [configured] : []),
    ...(process.platform === 'win32' ? [join(homedir(), 'AppData', 'Local', 'codex-rollout-traces')] : []),
  ]
}

export async function findTraceBundles(paths: string[], thread: string, registered: Iterable<string>) {
  const roots = [...new Map(paths.map((path) => [pathKey(path), path])).values()]
  const known = new Set([...registered].map(pathKey))
  const matches = new Map<string, Manifest>()
  let issue: SourceIssue | undefined
  for (const root of roots) {
    try {
      await fixedPath(root, 'directory')
      const entries = await readdir(root, { withFileTypes: true })
      entries.sort((a, b) => a.name.localeCompare(b.name))
      for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.startsWith('trace-')) continue
        const path = join(root, entry.name)
        if (known.has(pathKey(path))) continue
        try {
          const manifest = await readManifest(path, thread)
          if (!matches.has(manifest.id)) matches.set(manifest.id, manifest)
        } catch {
          // Unrelated folders and partially written manifests are excluded.
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') issue ??= { path: root, message: failureMessage(error) }
    }
  }
  return { matches: [...matches.values()], searched: roots, issue }
}

export async function findDesktopExecutable(): Promise<string | null> {
  const hinted = process.env.CODEX_APP_RUNTIME_CLI_PATH
  if (hinted && isAbsolute(hinted)) {
    try { return (await recordingExecutable(hinted)).path } catch { /* Try the installed package. */ }
  }
  const windows = process.env.SystemRoot
  if (process.platform !== 'win32' || !windows || !isAbsolute(windows)) return null
  try {
    const systemPowerShell = join(windows, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const command = 'Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1 -ExpandProperty InstallLocation'
    const { stdout } = await promisify(execFile)(
      systemPowerShell, ['-NoProfile', '-NonInteractive', '-Command', command],
      { windowsHide: true, timeout: 5000, maxBuffer: 32 * 1024 },
    )
    const location = stdout.trim()
    if (isAbsolute(location)) return (await recordingExecutable(join(location, 'app', 'resources', 'codex.exe'))).path
  } catch {
    // The package may be inaccessible or unavailable on this installation.
  }
  return null
}
