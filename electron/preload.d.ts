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
  showInFolder: (localPath: string) => Promise<boolean>
  deletePaper: (localPath: string) => Promise<boolean>
  connectWebVPN: () => Promise<boolean>
  openWoS: () => Promise<boolean>
  onDownloadComplete: (callback: (paper: any) => void) => void
  testDoiDownload: (doi: string) => Promise<boolean>
  searchPapers: (query: string) => Promise<any[]>
}

interface VpnAPI {
  saveCredentials: (account: string, password: string) => Promise<boolean>
  getCredentials: () => Promise<{ account: string } | null>
  clearCredentials: () => Promise<boolean>
  submitSms: (code: string) => Promise<boolean>
  onRequireSms: (callback: (tailNumber: string | null) => void) => void
}

interface AIAPI {
  chat: (config: { provider: string, apiKey: string, model: string }, messages: { role: string, content: string }[]) => Promise<any>
}

interface FutureHCIAPI {
  quit: () => void
  data: DataAPI
  knowledge: KnowledgeAPI
  vpn: VpnAPI
  ai: AIAPI
}

declare global {
  interface Window {
    electron: ElectronAPI
    electronAPI: FutureHCIAPI
  }
}
