import type { ReadingAction } from '../../../shared/reader'
import { fields, number, preview, string } from '../core/json'
import { executionStatus } from '../core/timeline'

type Description = Pick<ReadingAction, 'title' | 'target'>

const toolTitles: Record<string, string> = {
  exec: '코드 실행',
  js_repl: '코드 실행',
  wait: '실행 대기',
  exec_command: '명령 실행',
  write_stdin: '터미널 입력·조회',
  apply_patch: '파일 수정',
  read_file: '파일 읽기',
  mcp: 'MCP 도구 호출',
  web: '웹 검색 또는 자료 조회',
  image_generation: '이미지 생성',
  spawn_agent: '하위 에이전트에 작업 요청',
  assign_agent_task: '하위 에이전트에 작업 전달',
  send_message: '하위 에이전트에 메시지 전달',
  wait_agent: '하위 에이전트 대기',
  close_agent: '하위 에이전트 닫기',
}

export function toolName(name: unknown) {
  return string(name)?.split(/[:.\/]/).at(-1) ?? ''
}

function shortPath(path: string) {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) || path
}

function target(label: string, value: unknown, path = false): Description['target'] {
  const text = string(value)
  if (!text?.trim()) return undefined
  return { label, text: preview(path ? shortPath(text) : text, 120) }
}

function executableName(value: string) {
  return shortPath(value).toLowerCase().replace(/\.(?:exe|cmd)$/, '')
}

// Only recognize literal arguments. Dynamic expressions, compound commands and redirections stay in the raw input.
function literalWords(text: string): string[] | undefined {
  const command = text.trim()
  if (!command || command.length > 16384) return undefined
  const token = /(?:'([^'\r\n]*)'|"([^"$`\r\n]*)"|([^\s'"$\x60;&|<>()*?\[\]{}]+))(?=[ \t]|$)/y
  const words: string[] = []
  let offset = 0
  while (offset < command.length) {
    token.lastIndex = offset
    const match = token.exec(command)
    if (!match || (match[3]?.endsWith('\\') && token.lastIndex < command.length)) return undefined
    words.push(match[1] ?? match[2] ?? match[3])
    offset = token.lastIndex
    while (command[offset] === ' ' || command[offset] === '\t') offset += 1
  }
  return words
}

function commandWords(input: unknown) {
  const request = fields(input)
  const argv = request.command
  const direct = string(request.cmd) ?? string(input) ?? string(argv)
  if (direct) return literalWords(direct)
  if (Array.isArray(argv) && argv.length && argv.every((arg) => typeof arg === 'string')) {
    const executable = executableName(argv[0])
    if (['powershell', 'pwsh', 'bash', 'sh', 'zsh', 'cmd'].includes(executable)) {
      const script = argv.findIndex((arg) => /^(?:-Command|-c|\/c)$/i.test(arg))
      return script >= 0 && script + 2 === argv.length ? literalWords(argv[script + 1]) : undefined
    }
    return argv as string[]
  }
  const display = string(request.display_command)
  return display && literalWords(display)
}

function operands(args: string[], switches: string[], options: string[], preferred: string[] = [], foldCase = false) {
  const positional: string[] = []
  let selected: string | undefined
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--') return selected ?? positional[0] ?? args[i + 1]
    if (!arg.startsWith('-') || arg === '-') {
      positional.push(arg)
      continue
    }
    const equals = arg.indexOf('=')
    const name = equals < 0 ? arg : arg.slice(0, equals)
    const flag = foldCase ? name.toLowerCase() : name
    if (equals < 0 && switches.includes(flag)) continue
    if (!options.includes(flag) && !preferred.includes(flag)) return undefined
    const value = equals < 0 ? args[++i] : arg.slice(equals + 1)
    if (value === undefined) return undefined
    if (preferred.includes(flag)) {
      if (selected !== undefined) return undefined
      selected = value
    }
  }
  return selected ?? positional[0]
}

function fileTarget(label: string, path: string | undefined): Description['target'] {
  return path && path !== '-' && !/[*?\[\],]/.test(path) ? target(label, path, true) : undefined
}

function describeCommand(input: unknown): Description | undefined {
  const words = commandWords(input)
  if (!words?.length) return undefined
  const [first, ...args] = words
  const executable = executableName(first)
  const command = args[0]?.toLowerCase()
  if (executable === 'git' && command === 'status') return { title: 'Git 변경 상태 확인' }
  if (executable === 'git' && command === 'diff') return { title: '코드 변경 비교' }
  if (['get-content', 'cat', 'type'].includes(executable)) {
    const path = operands(args, ['-raw', '-n', '-b', '-v', '-s'],
      ['-encoding', '-totalcount', '-tail', '-readcount', '-delimiter'], ['-literalpath', '-path'], executable === 'get-content')
    return { title: '파일 읽기', target: fileTarget('읽기 대상', path) }
  }
  if (['get-childitem', 'dir', 'ls'].includes(executable)) {
    const path = operands(args, ['-force', '-file', '-directory', '-recurse', '-l', '-a', '-la'],
      ['-depth', '-filter', '-include', '-exclude'], ['-literalpath', '-path'], executable === 'get-childitem')
    return { title: '폴더 내용 확인', target: fileTarget('폴더', path) }
  }
  if (executable === 'rg' && args[0] === '--files') {
    return { title: '파일 목록 확인' }
  }
  if (executable === 'select-string') {
    const query = operands(args, ['-simplematch', '-casesensitive', '-allmatches', '-list', '-quiet'],
      ['-context', '-path', '-literalpath', '-include', '-exclude', '-encoding'], ['-pattern'], true)
    return { title: '텍스트 검색', target: target('검색어', query) }
  }
  if (executable === 'findstr') return { title: '텍스트 검색' }
  if (['rg', 'grep'].includes(executable)) {
    const query = operands(args, ['-n', '-i', '-s', '-l', '-r', '-F', '-a', '-w', '-v', '-c', '--line-number', '--ignore-case',
      '--fixed-strings', '--no-heading', '--hidden', '--smart-case', '--word-regexp'],
    ['-g', '--glob', '--color', '-m', '--max-count', '-A', '-B', '-C', '--context'],
    ['-e', '--regexp'])
    return { title: '텍스트 검색', target: target('검색어', query) }
  }
  if (executable === 'pytest' || (['cargo', 'dotnet', 'go', 'npm'].includes(executable) && command === 'test')
    || (executable === 'npm' && command === 'run' && args[1]?.toLowerCase() === 'test')) return { title: '테스트 실행' }
}

function patchTarget(input: unknown) {
  const patch = string(input) ?? string(fields(input).patch)
  if (!patch?.startsWith('*** Begin Patch') || !patch.trimEnd().endsWith('*** End Patch')) return undefined
  const paths = [...new Set([...patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((entry) => entry[1].trim()))]
  if (paths.length === 0) return undefined
  return target('파일 대상', shortPath(paths[0]) + (paths.length > 1 ? ` 외 ${paths.length - 1}개` : ''))
}

function uiTargetText(code: string): string | undefined {
  const coords = code.match(/mouse\.(?:click|dblclick)\(\s*(\d+)\s*,\s*(\d+)/)
  if (coords) return `(${coords[1]}, ${coords[2]})`
  const byQuery = code.match(/getBy(?:Role|Text|Label|Placeholder|Title|TestId)\([^)]*?(?:name\s*:\s*)?(['"`])((?:(?!\1)[^\r\n])+)\1/)
  if (byQuery?.[2]) return byQuery[2]
  const direct = code.match(/(?:\.click|\.dblclick|\.tap|locator)\(\s*(['"`])((?:(?!\1)[^\r\n])+)\1/)
  if (direct?.[2]) return direct[2]
  return undefined
}

function codeStringArg(text: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const pattern = new RegExp(`['"]?${key}['"]?\\s*:\\s*(['"\`])((?:(?!\\1)[^\\r\\n])+)\\1`)
    const match = text.match(pattern)
    if (match?.[2]) return match[2]
  }
  return undefined
}

function describeUiCode(code: string): Description | undefined {
  const hasScreenshot = /(?:\.|^|\b)(?:screenshot|takeScreenshot|captureScreen)\s*\(/m.test(code)
  const imageFile = code.match(/(['"`])((?:(?!\1)[^\r\n])+\.(?:png|jpe?g|webp))\1/i)?.[2]

  const twoArgFill = code.match(/\.(?:fill|type)\(\s*(['"`])(?:(?!\1)[^\r\n])*\1\s*,\s*(['"`])((?:(?!\2)[^\r\n])+)\2/)
  const oneArgType = code.match(/(?:keyboard\.type|keyboard\.insertText|\.fill|\.type)\(\s*(['"`])((?:(?!\1)[^\r\n])+)\1/)
  const keyPress = code.match(/(?:keyboard\.press|\.press)\(\s*(['"`])((?:(?!\1)[^\r\n])+)\1/)
  if (twoArgFill || oneArgType || keyPress) {
    const typed = twoArgFill?.[3] ?? oneArgType?.[2]
    const key = keyPress?.[2]
    return {
      title: hasScreenshot ? '키보드 입력 후 캡처' : '키보드 입력',
      target: target(typed ? '입력' : '키', typed ?? key),
    }
  }

  if (/(?:\.click|\.dblclick|mouse\.click|\.tap)\s*\(/.test(code)) {
    const clicked = uiTargetText(code)
    return {
      title: hasScreenshot ? '화면 클릭 후 캡처' : '화면 클릭',
      target: clicked ? target('대상', clicked) : undefined,
    }
  }

  if (/\b(?:mouse\.wheel|scrollTo|scrollBy|scrollIntoViewIfNeeded|\.scroll)\s*\(/.test(code)) {
    const area = uiTargetText(code)
    return {
      title: '화면 스크롤',
      target: area ? target('대상', area) : undefined,
    }
  }

  const gotoUrl = code.match(/\.goto\(\s*(['"`])([^'"`\r\n]+)\1/)?.[2]
  if (gotoUrl) {
    return { title: '앱·페이지 열기', target: target('주소', gotoUrl) }
  }
  if (/(?:_electron|chromium|firefox|webkit|browser)\.launch\s*\(|launchApplication\s*\(/.test(code)) {
    const appPath = code.match(/args\s*:\s*\[\s*(['"`])([^'"`\r\n]+)\1/)?.[2]
    return { title: '앱·페이지 열기', target: appPath ? target('대상', appPath, true) : undefined }
  }

  if (hasScreenshot) {
    return {
      title: '화면 캡처',
      target: imageFile ? target('파일', imageFile, true) : undefined,
    }
  }

  if (/\b(?:firstWindow|boundingBox|waitForSelector|getByRole|getByText|getByLabel|locator|mouse\.move)\s*\(/.test(code) || /\bpage\.\w+\s*\(/.test(code)) {
    const area = uiTargetText(code)
    return {
      title: '창·앱 조작',
      target: area ? target('대상', area) : undefined,
    }
  }

  return undefined
}

export function describeCodeExecution(input: unknown): Description | undefined {
  const request = fields(input)
  const code = string(input) ?? string(request.code) ?? string(request.source_js) ?? string(request.script)
  if (!code?.trim()) return undefined

  const nestedTool = code.match(/codex\.tool\(\s*(['"`])([a-zA-Z0-9_.-]+)\1(?:\s*,\s*([\s\S]{0,400}))?/)
  if (nestedTool) {
    const inner = toolName(nestedTool[2])
    const argsText = nestedTool[3] ?? ''
    if (inner === 'view_image') {
      const path = codeStringArg(argsText, ['path', 'file_path', 'filePath'])
      return { title: '이미지 확인', target: path ? target('파일', path, true) : undefined }
    }
    if (inner === 'read_file') {
      const path = codeStringArg(argsText, ['file_path', 'filePath', 'path'])
      return { title: '파일 읽기', target: path ? target('읽기 대상', path, true) : undefined }
    }
    if (inner === 'exec_command') {
      const cmd = codeStringArg(argsText, ['cmd', 'command'])
      return (cmd && describeCommand(cmd)) || { title: '명령 실행', target: cmd ? target('명령', cmd) : undefined }
    }
    if (inner !== 'exec' && inner !== 'js_repl') {
      const innerDesc = readableTool(inner, undefined)
      return { title: innerDesc.title, target: innerDesc.target }
    }
  }

  if (/\bview_image\b/.test(code)) {
    const imagePath = code.match(/(['"`])([^'"`\r\n]+\.(?:png|jpe?g|webp))\1/i)?.[2]
    return { title: '이미지 확인', target: imagePath ? target('파일', imagePath, true) : undefined }
  }

  const ui = describeUiCode(code)
  if (ui) return ui

  const shellCmd = code.match(/\b(?:execSync|execFileSync|spawnSync)\(\s*(['"`])([^'"`\r\n]+)\1/)?.[2]
  if (shellCmd) {
    return describeCommand(shellCmd) ?? { title: '명령 실행', target: target('명령', shellCmd) }
  }

  const writtenFile = code.match(/\b(?:writeFileSync|writeFile|appendFileSync|appendFile)\(\s*(['"`])([^'"`\r\n]+)\1/)?.[2]
  if (writtenFile) return { title: '파일 수정', target: target('파일 대상', writtenFile, true) }

  const readFilePath = code.match(/\b(?:readFileSync|readFile)\(\s*(['"`])([^'"`\r\n]+)\1/)?.[2]
  if (readFilePath) return { title: '파일 읽기', target: target('읽기 대상', readFilePath, true) }

  const readDirPath = code.match(/\b(?:readdirSync|readdir)\(\s*(['"`])([^'"`\r\n]+)\1/)?.[2]
  if (readDirPath) return { title: '폴더 내용 확인', target: target('폴더', readDirPath, true) }

  const lines = code.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (const line of lines) {
    const comment = line.match(/^\/\/\s*(.+)$/)?.[1]?.trim()
    if (comment && !/^(?:eslint|ts-|@ts-|[-=]{3,})/.test(comment) && /[가-힣a-zA-Z0-9]{2}/.test(comment)) {
      return { title: '코드 실행', target: target('내용', comment) }
    }
  }

  const meaningful = lines.find((line) => !line.startsWith('//')
    && !line.startsWith('/*')
    && !line.startsWith('*')
    && !line.startsWith('import ')
    && !/\brequire\s*\(/.test(line)
    && line !== '{'
    && line !== '}')
  return meaningful ? { title: '코드 실행', target: target('실행', preview(meaningful, 80)) } : undefined
}

export function readableTool(name: unknown, input: unknown, mcpName?: unknown): ReadingAction {
  const tool = toolName(name)
  const command = tool === 'exec_command' && describeCommand(input)
  const codeExec = (tool === 'exec' || tool === 'js_repl') && describeCodeExecution(input)
  const args = fields(input)
  const description: Description = command || codeExec || {
    title: Object.hasOwn(toolTitles, tool) ? toolTitles[tool] : '실행 내용 보기',
    target: tool === 'apply_patch' ? patchTarget(input)
      : tool === 'read_file' ? target('읽기 대상', args.file_path ?? args.filePath ?? args.path, true)
        : tool === 'mcp' ? target('도구 이름', mcpName) : undefined,
  }
  return { stage: 'progress', ...description }
}

export function toolOutcome(result: unknown, hasResult: boolean, lifecycle?: unknown) {
  const exit = number(fields(result).exit_code)
  if (exit !== null) {
    const code = exit === 0 ? '정상 종료 · 코드 0' : `종료 코드 ${exit}`
    if (lifecycle === 'failed') return `${code} · 호출 실패 기록`
    if (lifecycle === 'aborted' || lifecycle === 'cancelled') return `${code} · ${executionStatus(lifecycle)}`
    return code
  }
  if (hasResult && (typeof lifecycle !== 'string' || lifecycle === 'completed' || lifecycle === 'running')) return '결과 있음'
  const status = executionStatus(lifecycle, '호출 종료 기록 있음')
  return hasResult && status ? `결과 있음 · ${status}` : status
}

export function structuredInput(input: unknown) {
  if (typeof input !== 'string') return input
  try { return JSON.parse(input) as unknown } catch { return input }
}
