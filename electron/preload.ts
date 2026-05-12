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
    connectWebVPN: () => ipcRenderer.invoke('knowledge:connect-webvpn'),
    openWoS: () => ipcRenderer.invoke('knowledge:open-wos'),
    onDownloadComplete: (callback: (paper: any) => void) => {
      // 避免重复绑定
      ipcRenderer.removeAllListeners('knowledge:download-complete')
      ipcRenderer.on('knowledge:download-complete', (_event, paper) => callback(paper))
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
