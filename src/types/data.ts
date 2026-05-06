// ============================================================
// 核心数据类型定义
// ============================================================

export interface ThoughtVersion {
  content: string
  savedAt: string // ISO 8601
}

export interface Thought {
  id: string
  content: string
  createdAt: string    // ISO 8601
  updatedAt: string    // ISO 8601
  tags: string[]       // 标签（预留，Phase 1+）
  linkedIds: string[]  // 图谱连接 ID（预留，Phase 2）
  versions: ThoughtVersion[] // 版本快照（最多保留 30 条）
}

export interface ThoughtsStore {
  schemaVersion: number
  thoughts: Thought[]
}

// 预留：论文
export interface Paper {
  id: string
  title: string
  authors: string[]
  abstract: string
  url: string
  addedAt: string
  tags: string[]
  linkedIds: string[]
}

export interface PapersStore {
  schemaVersion: number
  papers: Paper[]
}
