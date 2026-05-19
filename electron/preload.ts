import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  quit: () => ipcRenderer.send('quit-app'),
  data: {
    read: (filename: string): Promise<unknown | null> =>
      ipcRenderer.invoke('data:read', filename),
    write: (filename: string, data: unknown): Promise<void> =>
      ipcRenderer.invoke('data:write', filename, data)
  },
  knowledge: {
    importFile: () => ipcRenderer.invoke('knowledge:import'),
    parsePdf: (localPath: string) => ipcRenderer.invoke('knowledge:parse-pdf', localPath),
    showInFolder: (localPath: string) => ipcRenderer.invoke('knowledge:show-in-folder', localPath),
    deletePaper: (localPath: string) => ipcRenderer.invoke('knowledge:delete-paper', localPath),
    connectWebVPN: () => ipcRenderer.invoke('knowledge:connect-webvpn'),
    openWoS: () => ipcRenderer.invoke('knowledge:open-wos'),
    onDownloadComplete: (callback: (paper: any) => void) => {
      // 避免重复绑定
      ipcRenderer.removeAllListeners('knowledge:download-complete')
      ipcRenderer.on('knowledge:download-complete', (_event, paper) => callback(paper))
    },
    testDoiDownload: (doi: string) => ipcRenderer.invoke('knowledge:test-doi-download', doi),
    searchPapers: (query: string) => ipcRenderer.invoke('knowledge:search-papers', query)
  },
  vpn: {
    saveCredentials: (account, password) => ipcRenderer.invoke('vpn:save-credentials', account, password),
    getCredentials: () => ipcRenderer.invoke('vpn:get-credentials'),
    clearCredentials: () => ipcRenderer.invoke('vpn:clear-credentials'),
    submitSms: (code) => ipcRenderer.invoke('vpn:submit-sms', code),
    onRequireSms: (callback) => {
      ipcRenderer.removeAllListeners('vpn:require-sms')
      ipcRenderer.on('vpn:require-sms', (_event, tailNumber) => callback(tailNumber))
    }
  },
  ai: {
    chat: (config: any, messages: any[]): Promise<any> => ipcRenderer.invoke('ai:chat', config, messages)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('electronAPI', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.electronAPI = api
}
