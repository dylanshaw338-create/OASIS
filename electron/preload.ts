import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  quit: () => ipcRenderer.send('quit-app'),
  data: {
    read: (filename: string): Promise<unknown | null> =>
      ipcRenderer.invoke('data:read', filename),
    write: (filename: string, data: unknown): Promise<void> =>
      ipcRenderer.invoke('data:write', filename, data)
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
