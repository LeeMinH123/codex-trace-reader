import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ReaderWorkspace } from './sources/workspace'
import { defaultCodexHome } from './sources/recent-chats'
import { defaultTraceRoots } from './sources/trace-discovery'

const reader = new ReaderWorkspace(defaultCodexHome(), defaultTraceRoots())
const renderer = join(__dirname, '../renderer/index.html')
const devUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL
let window: BrowserWindow | null = null
let quitPending = false
let readyToQuit = false

function authorize(event: IpcMainInvokeEvent) {
  const frame = event.senderFrame
  if (!window || event.sender !== window.webContents || frame !== event.sender.mainFrame || !frame) {
    throw new Error('이 화면에서 요청을 처리할 수 없습니다.')
  }
  const source = new URL(frame.url)
  if (devUrl ? source.origin !== new URL(devUrl).origin : source.href !== pathToFileURL(renderer).href) {
    throw new Error('등록된 앱 화면만 기록을 읽을 수 있습니다.')
  }
  return window
}

function idArgument(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2048) {
    throw new Error('기록 식별자가 올바르지 않습니다.')
  }
  return value
}

function viewAction(channel: string, action: (owner: BrowserWindow, argument: unknown) => Promise<void>) {
  ipcMain.handle(channel, (event, argument: unknown) => {
    const owner = authorize(event)
    return reader.queue(async () => {
      if (!quitPending && !owner.isDestroyed()) await action(owner, argument)
      return reader.view()
    })
  })
}

ipcMain.handle('reader:workspace', (event) => { authorize(event); return reader.view() })
ipcMain.handle('reader:recent-chats', (event) => { authorize(event); return reader.queue(() => reader.recentChats()) })
ipcMain.handle('reader:discover', (event) => { authorize(event); return reader.queue(() => reader.discover()) })
ipcMain.handle('reader:discover-rollouts', (event) => { authorize(event); return reader.queue(() => reader.discoverRollouts()) })
ipcMain.handle('reader:inspect', (event, token: unknown, id: unknown) => {
  authorize(event)
  return reader.inspect(idArgument(token), idArgument(id))
})

async function chooseRolloutFile(owner: BrowserWindow, title: string) {
  const result = await dialog.showOpenDialog(owner, {
    title, properties: ['openFile'],
    defaultPath: reader.view().session?.path ?? join(defaultCodexHome(), 'sessions'),
    filters: [{ name: 'Codex 세션 기록', extensions: ['jsonl'] }],
  })
  return result.canceled ? undefined : result.filePaths[0]
}

viewAction('reader:choose-session', async (owner) => {
  const path = await chooseRolloutFile(owner, 'Codex 세션 파일 열기')
  if (path) await reader.openSession(path)
})

viewAction('reader:choose-rollout', async (owner) => {
  const path = await chooseRolloutFile(owner, '같은 채팅의 rollout 파일 추가')
  if (path) await reader.openRollout(path)
})

viewAction('reader:choose-bundle', async (owner) => {
  const { bundles, selectedId } = reader.view()
  const result = await dialog.showOpenDialog(owner, {
    title: '상세 트레이스 폴더 열기', properties: ['openDirectory'],
    defaultPath: bundles.find((bundle) => bundle.id === selectedId)?.path ?? defaultTraceRoots()[0],
  })
  if (!result.canceled && result.filePaths[0]) await reader.openBundle(result.filePaths[0])
})

viewAction('reader:choose-trace-root', async (owner) => {
  const result = await dialog.showOpenDialog(owner, {
    title: '상세 실행 기록을 모아 둔 상위 폴더 선택', properties: ['openDirectory'],
    defaultPath: reader.view().traceSearch?.searched[0],
  })
  if (!result.canceled && result.filePaths[0]) await reader.openTraceRoot(result.filePaths[0])
})

viewAction('reader:find-trace-matches', async () => reader.findTraceMatches())

viewAction('reader:choose-executable', async (owner) => {
  const { executable, executableHint } = reader.view()
  const result = await dialog.showOpenDialog(owner, {
    title: '이 번들을 기록한 codex.exe 선택', properties: ['openFile'],
    defaultPath: executable ?? executableHint ?? app.getPath('home'),
    filters: [{ name: 'Codex 실행 파일', extensions: ['exe'] }],
  })
  if (!result.canceled && result.filePaths[0]) await reader.setExecutable(result.filePaths[0])
})

viewAction('reader:use-executable-hint', async () => reader.useExecutableHint())
viewAction('reader:select-bundle', async (_owner, id) => reader.selectBundle(idArgument(id)))
viewAction('reader:select-rollout', async (_owner, id) => reader.selectRollout(idArgument(id)))
viewAction('reader:open-recent-chat', async (_owner, id) => reader.openRecentChat(idArgument(id)))
viewAction('reader:add-rollout-candidate', async (_owner, id) => reader.addRolloutCandidate(idArgument(id)))
viewAction('reader:add-candidate', async (_owner, id) => reader.addCandidate(idArgument(id)))
viewAction('reader:refresh', async () => reader.refresh())

function openWindow() {
  window = new BrowserWindow({
    title: 'Codex 트레이스 리더',
    width: 1320, height: 880, minWidth: 680, minHeight: 560, backgroundColor: '#f7f7f3',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
    },
  })
  window.removeMenu()
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  window.webContents.session.setPermissionCheckHandler(() => false)
  window.on('closed', () => { window = null })
  if (devUrl) void window.loadURL(devUrl)
  else void window.loadFile(renderer)
}

void app.whenReady().then(() => {
  openWindow()
  app.on('activate', () => { if (!window) openWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', (event) => {
  if (readyToQuit) return
  event.preventDefault()
  if (quitPending) return
  quitPending = true
  void reader.whenIdle().then(() => {
    readyToQuit = true
    app.quit()
  })
})
