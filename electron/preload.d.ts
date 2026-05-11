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
  
  title: string
  authors: string[]
  tags: string[]
  abstract: string
  userNotes: string
  aiSummary: string
}

interface KnowledgeAPI {
  importFile: () => Promise<ImportedFile[] | null>
  parsePdf: (localPath: string) => Promise<string>
}

interface AIAPI {
  chat: (config: { provider: string, apiKey: string, model: string }, messages: { role: string, content: string }[]) => Promise<any>
}

interface FutureHCIAPI {
  quit: () => void
  data: DataAPI
  knowledge: KnowledgeAPI
  ai: AIAPI
}

declare global {
  interface Window {
    electron: ElectronAPI
    electronAPI: FutureHCIAPI
  }
}
