import { lstat, open, realpath, stat } from 'node:fs/promises'
import { isAbsolute, normalize } from 'node:path'

export const MiB = 1024 * 1024

export function pathKey(path: string): string {
  const normalized = normalize(path)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

export async function canonicalPath(path: string, kind: 'file' | 'directory'): Promise<string> {
  if (!isAbsolute(path)) throw new Error('로컬 절대 경로를 선택하세요.')
  const canonical = await realpath(path)
  const info = await stat(canonical)
  if (kind === 'file' ? !info.isFile() : !info.isDirectory()) {
    throw new Error(kind === 'file' ? '파일을 선택하세요.' : '폴더를 선택하세요.')
  }
  return canonical
}

export async function fixedPath(path: string, kind: 'file' | 'directory'): Promise<void> {
  if (pathKey(await canonicalPath(path, kind)) !== pathKey(path)) {
    throw new Error('등록 경로가 다른 위치를 가리켜 읽을 수 없습니다.')
  }
  const info = await lstat(path)
  if (info.isSymbolicLink() || (kind === 'file' && info.nlink > 1)) {
    throw new Error('파일 또는 폴더 링크를 통해 기록을 읽을 수 없습니다.')
  }
}

export function readBounded(path: string, limit: number, fixed = false, end?: number): Promise<Buffer> {
  return readBytes(path, limit, fixed, end === undefined ? undefined : { size: end, exact: true })
}

export function readPrefix(path: string, limit: number): Promise<Buffer> {
  return readBytes(path, limit, true, { size: limit, exact: false })
}

async function readBytes(
  path: string, limit: number, fixed: boolean, prefix?: { size: number; exact: boolean },
): Promise<Buffer> {
  if (fixed) await fixedPath(path, 'file')
  const handle = await open(path, 'r')
  try {
    const info = await handle.stat()
    const size = prefix ? Math.min(prefix.size, info.size) : info.size
    if (!info.isFile() || size > limit || (prefix && prefix.size > limit)) {
      throw new Error('파일이 읽기 크기 한도를 초과했거나 일반 파일이 아닙니다.')
    }
    if (prefix?.exact && size < prefix.size) throw new Error('지정된 기록 경계까지 파일이 남아 있지 않습니다.')
    if (fixed) {
      await fixedPath(path, 'file')
      const current = await stat(path)
      if (info.dev !== current.dev || info.ino !== current.ino || info.nlink > 1) {
        throw new Error('읽는 중 파일 위치가 바뀌었습니다.')
      }
    }
    const buffer = Buffer.alloc(size)
    let offset = 0
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset)
      if (!bytesRead) throw new Error('읽는 중 파일 크기가 줄었습니다.')
      offset += bytesRead
    }
    return buffer
  } finally {
    await handle.close()
  }
}

export function failureMessage(error: unknown): string {
  if (!(error instanceof Error)) return '기록을 읽는 중 오류가 발생했습니다.'
  switch ((error as NodeJS.ErrnoException).code) {
    case 'ENOENT': return '경로를 찾을 수 없습니다. 이동했거나 삭제됐을 수 있습니다.'
    case 'EACCES':
    case 'EPERM': return '경로를 읽을 수 있는 권한이 없습니다.'
    case 'EBUSY': return '파일이 다른 프로세스에 잠겨 있습니다.'
    case 'ENOSPC': return '임시 파일을 만들 공간이 부족합니다.'
  }
  return error instanceof SyntaxError ? 'JSON 형식이 올바르지 않습니다.' : error.message
}
