import { ElectronAPI } from '@electron-toolkit/preload'

interface DataAPI {
  read: (filename: string) => Promise<unknown | null>
  write: (filename: string, data: unknown) => Promise<void>
}

interface FutureHCIAPI {
  quit: () => void
  data: DataAPI
}

declare global {
  interface Window {
    electron: ElectronAPI
    electronAPI: FutureHCIAPI
  }
}
