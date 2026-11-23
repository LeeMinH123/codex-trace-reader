import { contextBridge, ipcRenderer } from 'electron'
import type { ReaderApi } from '../shared/reader'

const reader: ReaderApi = {
  workspace: () => ipcRenderer.invoke('reader:workspace'),
  recentChats: () => ipcRenderer.invoke('reader:recent-chats'),
  openRecentChat: (id) => ipcRenderer.invoke('reader:open-recent-chat', id),
  chooseSession: () => ipcRenderer.invoke('reader:choose-session'),
  chooseRollout: () => ipcRenderer.invoke('reader:choose-rollout'),
  selectRollout: (id) => ipcRenderer.invoke('reader:select-rollout', id),
  discoverRollouts: () => ipcRenderer.invoke('reader:discover-rollouts'),
  addRolloutCandidate: (id) => ipcRenderer.invoke('reader:add-rollout-candidate', id),
  chooseBundle: () => ipcRenderer.invoke('reader:choose-bundle'),
  findTraceMatches: () => ipcRenderer.invoke('reader:find-trace-matches'),
  chooseTraceRoot: () => ipcRenderer.invoke('reader:choose-trace-root'),
  chooseExecutable: () => ipcRenderer.invoke('reader:choose-executable'),
  useExecutableHint: () => ipcRenderer.invoke('reader:use-executable-hint'),
  selectBundle: (id) => ipcRenderer.invoke('reader:select-bundle', id),
  refresh: () => ipcRenderer.invoke('reader:refresh'),
  discover: () => ipcRenderer.invoke('reader:discover'),
  addCandidate: (id) => ipcRenderer.invoke('reader:add-candidate', id),
  inspect: (token, id) => ipcRenderer.invoke('reader:inspect', token, id),
}

contextBridge.exposeInMainWorld('reader', reader)
