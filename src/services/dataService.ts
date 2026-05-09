import type { Thought, ThoughtsStore, ThoughtVersion } from '../types/data'

const THOUGHTS_FILE = 'thoughts.json'
const SCHEMA_VERSION = 1
const MAX_VERSIONS = 30

// ——— 内部工具 ———

function emptyStore(): ThoughtsStore {
  return { schemaVersion: SCHEMA_VERSION, categories: ['默认分区'], thoughts: [] }
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ——— 对外服务 ———

export const thoughtsService = {
  async load(): Promise<ThoughtsStore> {
    try {
      const raw = await window.electronAPI.data.read(THOUGHTS_FILE)
      // 防御性编程：如果读取的 JSON 没有 thoughts 数组，返回初始状态
      if (!raw || !Array.isArray((raw as any).thoughts)) return emptyStore()
      const store = raw as ThoughtsStore
      if (!store.categories) {
        store.categories = ['默认分区']
      }
      return store
    } catch {
      return emptyStore()
    }
  },

  async save(store: ThoughtsStore): Promise<void> {
    await window.electronAPI.data.write(THOUGHTS_FILE, store)
  },

  createThought(content: string, category: string = '默认分区'): Thought {
    const now = new Date().toISOString()
    return {
      id: makeId(),
      title: '',
      category,
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

  // 更新标题
  updateThoughtTitle(thought: Thought, title: string): Thought {
    return { ...thought, title, updatedAt: new Date().toISOString() }
  },

  // 更新分区
  updateThoughtCategory(thought: Thought, category: string): Thought {
    return { ...thought, category, updatedAt: new Date().toISOString() }
  },

  // 更新内容并追加一个版本快照（切换/离开时调用）
  captureVersion(thought: Thought, content: string): Thought {
    // 核心修复：防范旧数据中没有 versions 数组导致的 undefined.length 崩溃
    const safeVersions = thought.versions || []
    const lastVersion = safeVersions[safeVersions.length - 1]
    const hasChange = !lastVersion || lastVersion.content !== content

    const newVersion: ThoughtVersion = { content, savedAt: new Date().toISOString() }
    const versions = hasChange
      ? [...safeVersions, newVersion].slice(-MAX_VERSIONS)
      : safeVersions

    return {
      ...thought,
      content,
      // 只有内容真的变了，才强制更新 updatedAt；否则保留原样，避免单纯点击导致乱跳
      updatedAt: hasChange ? new Date().toISOString() : thought.updatedAt,
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
