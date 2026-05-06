import type { Thought, ThoughtsStore, ThoughtVersion } from '../types/data'

const THOUGHTS_FILE = 'thoughts.json'
const SCHEMA_VERSION = 1
const MAX_VERSIONS = 30

// ——— 内部工具 ———

function emptyStore(): ThoughtsStore {
  return { schemaVersion: SCHEMA_VERSION, thoughts: [] }
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ——— 对外服务 ———

export const thoughtsService = {
  async load(): Promise<ThoughtsStore> {
    try {
      const raw = await window.electronAPI.data.read(THOUGHTS_FILE)
      if (!raw) return emptyStore()
      return raw as ThoughtsStore
    } catch {
      return emptyStore()
    }
  },

  async save(store: ThoughtsStore): Promise<void> {
    await window.electronAPI.data.write(THOUGHTS_FILE, store)
  },

  createThought(content: string): Thought {
    const now = new Date().toISOString()
    return {
      id: makeId(),
      content,
      createdAt: now,
      updatedAt: now,
      tags: [],
      linkedIds: [],
      versions: []
    }
  },

  // 更新内容（不产生版本，用于自动保存）
  updateThought(thought: Thought, content: string): Thought {
    return { ...thought, content, updatedAt: new Date().toISOString() }
  },

  // 更新内容并追加一个版本快照（切换/离开时调用）
  captureVersion(thought: Thought, content: string): Thought {
    // 内容无变化则不产生版本
    const lastVersion = thought.versions[thought.versions.length - 1]
    const hasChange = !lastVersion || lastVersion.content !== thought.content

    const newVersion: ThoughtVersion = { content: thought.content, savedAt: new Date().toISOString() }
    const versions = hasChange
      ? [...thought.versions, newVersion].slice(-MAX_VERSIONS)
      : thought.versions

    return {
      ...thought,
      content,
      updatedAt: new Date().toISOString(),
      versions
    }
  },

  // localStorage 旧数据迁移
  async migrateFromLocalStorage(): Promise<void> {
    const OLD_KEY = 'future-hci-thoughts'
    const legacy = localStorage.getItem(OLD_KEY)
    if (!legacy) return

    const existing = await thoughtsService.load()
    if (existing.thoughts.length > 0) {
      localStorage.removeItem(OLD_KEY)
      return
    }

    const thought = thoughtsService.createThought(legacy)
    const store: ThoughtsStore = { schemaVersion: SCHEMA_VERSION, thoughts: [thought] }
    await thoughtsService.save(store)
    localStorage.removeItem(OLD_KEY)
  }
}
