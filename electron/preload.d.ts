import { ElectronAPI } from '@electron-toolkit/preload'

interface DataAPI {
  read: (filename: string) => Promise<unknown | null>
  write: (filename: string, data: unknown) => Promise<void>
}

export interface ImportedFile {
  id: string
  name: string
  originalPath: string
  localPath: string
  size: number
  type: string
  importedAt: number
}

interface KnowledgeAPI {
  importFile: () => Promise<ImportedFile[] | null>
}

interface FutureHCIAPI {
  quit: () => void
  data: DataAPI
  knowledge: KnowledgeAPI
}

declare global {
  interface Window {
    electron: ElectronAPI
    electronAPI: FutureHCIAPI
  }
}
