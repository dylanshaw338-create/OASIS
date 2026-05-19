// ============================================================
// 核心数据类型定义
// ============================================================

export interface ThoughtVersion {
  content: string
  savedAt: string // ISO 8601
}

export interface Thought {
  id: string
  title?: string       // 独立标题（Phase 1 新增）
  category?: string    // 归属的分区（Phase 1 新增）
  content: string
  createdAt: string    // ISO 8601
  updatedAt: string    // ISO 8601
  tags: string[]       // 标签（预留，Phase 1+）
  linkedIds: string[]  // 图谱连接 ID（预留，Phase 2）
  versions: ThoughtVersion[] // 版本快照（最多保留 30 条）
}

export interface ThoughtsStore {
  schemaVersion: number
  categories?: string[] // 自定义分区列表
  thoughts: Thought[]
}

// 统一后的 Paper (论文/文档) 类型
export interface Paper {
  id: string
  name: string
  originalPath: string
  localPath: string
  size: number
  type: string
  importedAt: number
  
  // 学术元数据
  title: string
  authors: string[]
  abstract: string
  tags: string[]
  
  // 用户产生的数据
  userNotes: string
  aiSummary: string
  linkedIds?: string[]
}

export interface PapersStore {
  schemaVersion: number
  papers: Paper[]
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  name?: string
  tool_calls?: any[]
  tool_call_id?: string
  _papers?: any[] // 新增：用于前端渲染论文卡片的隐藏数据
}
