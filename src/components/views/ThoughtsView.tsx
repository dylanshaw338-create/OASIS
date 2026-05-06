import { useEffect, useState, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { thoughtsService } from '../../services/dataService'
import type { Thought, ThoughtsStore } from '../../types/data'

// ================================================================
// 主组件
// ================================================================

export default function ThoughtsView() {
  const [store, setStore] = useState<ThoughtsStore | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [isPreview, setIsPreview] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // ref 存最新的 store/selectedId/content，给 keydown 闭包用
  const stateRef = useRef({ store, selectedId, content })
  useEffect(() => { stateRef.current = { store, selectedId, content } }, [store, selectedId, content])

  // ── 初始化 ──
  useEffect(() => {
    async function init() {
      await thoughtsService.migrateFromLocalStorage()
      const loaded = await thoughtsService.load()

      if (loaded.thoughts.length === 0) {
        const first = thoughtsService.createThought('')
        const newStore: ThoughtsStore = { ...loaded, thoughts: [first] }
        await thoughtsService.save(newStore)
        setStore(newStore)
        setSelectedId(first.id)
        setContent('')
      } else {
        const sorted = sortThoughts(loaded.thoughts)
        setStore(loaded)
        setSelectedId(sorted[0].id)
        setContent(sorted[0].content)
      }
    }
    init()
  }, [])

  // ── 切换预览时聚焦编辑器 ──
  useEffect(() => {
    if (!isPreview && store) setTimeout(() => textareaRef.current?.focus(), 30)
  }, [isPreview, store])

  // ── Ctrl+N 新建 ──
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        const { store, selectedId, content } = stateRef.current
        handleNew(store, selectedId, content)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, []) // 只注册一次，通过 ref 读最新状态

  // ── 工具函数：将当前编辑内容保存并产生版本快照 ──
  const flushAndCapture = useCallback(
    async (
      currentStore: ThoughtsStore,
      currentId: string,
      currentContent: string
    ): Promise<ThoughtsStore> => {
      const thought = currentStore.thoughts.find((t) => t.id === currentId)
      if (!thought) return currentStore
      const captured = thoughtsService.captureVersion(thought, currentContent)
      const newStore: ThoughtsStore = {
        ...currentStore,
        thoughts: currentStore.thoughts.map((t) => (t.id === currentId ? captured : t))
      }
      await thoughtsService.save(newStore)
      return newStore
    },
    []
  )

  // ── 选择条目 ──
  const handleSelect = useCallback(
    async (id: string) => {
      const { store, selectedId, content } = stateRef.current
      if (!store || id === selectedId) return

      // 离开前保存版本
      let latestStore = store
      if (selectedId) latestStore = await flushAndCapture(store, selectedId, content)

      const target = latestStore.thoughts.find((t) => t.id === id)
      if (!target) return
      setStore(latestStore)
      setSelectedId(id)
      setContent(target.content)
      setIsPreview(false)
    },
    [flushAndCapture]
  )

  // ── 新建思想 ──
  const handleNew = useCallback(
    async (
      store: ThoughtsStore | null,
      selectedId: string | null,
      content: string
    ) => {
      if (!store) return
      let latestStore = store
      if (selectedId) latestStore = await flushAndCapture(store, selectedId, content)

      const newThought = thoughtsService.createThought('')
      const newStore: ThoughtsStore = {
        ...latestStore,
        thoughts: [newThought, ...latestStore.thoughts]
      }
      await thoughtsService.save(newStore)
      setStore(newStore)
      setSelectedId(newThought.id)
      setContent('')
      setIsPreview(false)
      setTimeout(() => textareaRef.current?.focus(), 50)
    },
    [flushAndCapture]
  )

  // ── 内容变更（防抖自动保存） ──
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      setContent(value)
      setSaveStatus('saving')

      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        const { store, selectedId } = stateRef.current
        if (!store || !selectedId) return
        const thought = store.thoughts.find((t) => t.id === selectedId)
        if (!thought) return
        const updated = thoughtsService.updateThought(thought, value)
        const newStore: ThoughtsStore = {
          ...store,
          thoughts: store.thoughts.map((t) => (t.id === selectedId ? updated : t))
        }
        await thoughtsService.save(newStore)
        setStore(newStore)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 1500)
      }, 500)
    },
    []
  )

  // ── 衍生状态 ──
  const sorted = store ? sortThoughts(store.thoughts) : []

  if (!store) return <LoadingView />

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      {/* ════ 左侧面板 ════ */}
      <aside
        style={{
          width: '200px',
          flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* 新建按钮 */}
        <button
          onClick={() => {
            const { store, selectedId, content } = stateRef.current
            handleNew(store, selectedId, content)
          }}
          style={{
            width: '100%',
            padding: '0.9rem 1rem',
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            cursor: 'pointer',
            color: 'rgba(200,228,252,0.35)',
            fontSize: '0.58rem',
            letterSpacing: '0.22em',
            textAlign: 'left',
            transition: 'color 0.2s',
            flexShrink: 0
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(200,228,252,0.7)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(200,228,252,0.35)')}
        >
          + 新建思想
        </button>

        {/* 条目列表 */}
        <div style={{ flex: 1, overflowY: 'auto' }} className="thought-list">
          {sorted.map((t) => (
            <ThoughtItem
              key={t.id}
              thought={t}
              isActive={t.id === selectedId}
              onClick={() => handleSelect(t.id)}
            />
          ))}
        </div>
      </aside>

      {/* ════ 右侧编辑区 ════ */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {/* 顶部工具栏 */}
        <div
          style={{
            position: 'absolute',
            top: '1.2rem',
            right: '2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1.2rem',
            zIndex: 10
          }}
        >
          {/* 保存状态 */}
          <span
            style={{
              fontSize: '0.52rem',
              letterSpacing: '0.2em',
              color:
                saveStatus === 'saving'
                  ? 'rgba(255,255,255,0.15)'
                  : 'rgba(200,228,252,0.4)',
              transition: 'opacity 0.5s, color 0.3s',
              opacity: saveStatus === 'idle' ? 0 : 1,
              pointerEvents: 'none'
            }}
          >
            {saveStatus === 'saving' ? 'SAVING...' : 'SAVED'}
          </span>

          {/* 阅读/编辑切换 */}
          <button
            onClick={() => setIsPreview((p) => !p)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.52rem',
              letterSpacing: '0.22em',
              color: isPreview ? 'rgba(200,228,252,0.55)' : 'rgba(255,255,255,0.18)',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(200,228,252,0.8)')}
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = isPreview
                ? 'rgba(200,228,252,0.55)'
                : 'rgba(255,255,255,0.18)')
            }
          >
            {isPreview ? 'EDIT' : 'READ'}
          </button>
        </div>

        {/* 编辑器 / 预览 */}
        {isPreview ? (
          <MarkdownPreview content={content} />
        ) : (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            placeholder="# 开始思考..."
            spellCheck={false}
            style={{
              flex: 1,
              width: '100%',
              padding: '3.5rem 15% 3rem 15%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              color: 'rgba(255,255,255,0.92)',
              fontSize: '1rem',
              lineHeight: '2',
              letterSpacing: '0.02em',
              fontFamily: "'SF Mono','Fira Code','Cascadia Code','Consolas',monospace",
              fontWeight: 400,
              caretColor: 'rgba(200,228,252,0.7)',
              overflowY: 'auto'
            }}
          />
        )}
      </div>

      <style>{`
        .thought-list::-webkit-scrollbar { width: 2px; }
        .thought-list::-webkit-scrollbar-track { background: transparent; }
        .thought-list::-webkit-scrollbar-thumb { background: rgba(200,228,252,0.08); }
        textarea::placeholder { color: rgba(255,255,255,0.08); }
        textarea::-webkit-scrollbar { width: 3px; }
        textarea::-webkit-scrollbar-track { background: transparent; }
        textarea::-webkit-scrollbar-thumb { background: rgba(200,228,252,0.1); border-radius: 2px; }
      `}</style>
    </div>
  )
}

// ================================================================
// 工具函数
// ================================================================

function sortThoughts(thoughts: Thought[]): Thought[] {
  return [...thoughts].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

// ================================================================
// 子组件
// ================================================================

function LoadingView() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <p
        style={{
          fontSize: '0.52rem',
          letterSpacing: '0.28em',
          color: 'rgba(255,255,255,0.1)'
        }}
      >
        LOADING...
      </p>
    </div>
  )
}

function ThoughtItem({
  thought,
  isActive,
  onClick
}: {
  thought: Thought
  isActive: boolean
  onClick: () => void
}) {
  const d = new Date(thought.updatedAt)
  const date = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const firstLine = thought.content.split('\n').find((l) => l.trim()) ?? ''
  const preview = firstLine.replace(/^#+\s*/, '').trim().slice(0, 20) || '空白'

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        padding: '0.7rem 1rem',
        background: isActive ? 'rgba(200,228,252,0.04)' : 'transparent',
        border: 'none',
        borderLeft: isActive
          ? '2px solid rgba(200,228,252,0.3)'
          : '2px solid transparent',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s ease'
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = 'transparent'
      }}
    >
      <p
        style={{
          fontSize: '0.48rem',
          letterSpacing: '0.1em',
          color: 'rgba(200,228,252,0.25)',
          marginBottom: '0.28rem'
        }}
      >
        {date} · {time}
      </p>
      <p
        style={{
          fontSize: '0.62rem',
          color: isActive ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.32)',
          letterSpacing: '0.02em',
          lineHeight: 1.4,
          transition: 'color 0.15s'
        }}
      >
        {preview}
      </p>
    </button>
  )
}

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="md-preview">
      <ReactMarkdown>{content}</ReactMarkdown>
      <style>{`
        .md-preview {
          flex: 1;
          padding: 3.5rem 15% 3rem 15%;
          overflow-y: auto;
          color: rgba(255,255,255,0.88);
          font-size: 1rem;
          line-height: 2;
          letter-spacing: 0.02em;
          font-family: 'SF Mono','Fira Code','Cascadia Code','Consolas',monospace;
        }
        .md-preview h1 { font-size:1.5rem; font-weight:300; color:rgba(255,255,255,0.96); margin:2rem 0 1rem; letter-spacing:0.06em; }
        .md-preview h2 { font-size:1.2rem; font-weight:300; color:rgba(255,255,255,0.88); margin:1.75rem 0 0.75rem; }
        .md-preview h3 { font-size:1rem; font-weight:400; color:rgba(255,255,255,0.75); margin:1.25rem 0 0.5rem; }
        .md-preview p  { margin:0.6rem 0; }
        .md-preview a  { color:rgba(200,228,252,0.7); text-decoration:none; border-bottom:1px solid rgba(200,228,252,0.2); }
        .md-preview code { background:rgba(200,228,252,0.07); padding:0.1em 0.4em; font-size:0.9em; color:rgba(200,228,252,0.85); }
        .md-preview pre  { background:rgba(200,228,252,0.04); border:1px solid rgba(200,228,252,0.08); padding:1rem 1.25rem; margin:1rem 0; overflow-x:auto; }
        .md-preview pre code { background:transparent; padding:0; }
        .md-preview blockquote { border-left:2px solid rgba(200,228,252,0.2); margin:1rem 0; padding-left:1rem; color:rgba(255,255,255,0.45); }
        .md-preview strong { color:rgba(255,255,255,0.96); font-weight:500; }
        .md-preview em { color:rgba(200,228,252,0.65); }
        .md-preview hr { border:none; border-top:1px solid rgba(255,255,255,0.07); margin:2rem 0; }
        .md-preview ul, .md-preview ol { padding-left:1.5rem; margin:0.5rem 0; }
        .md-preview li { margin:0.2rem 0; }
        .md-preview::-webkit-scrollbar { width:3px; }
        .md-preview::-webkit-scrollbar-track { background:transparent; }
        .md-preview::-webkit-scrollbar-thumb { background:rgba(200,228,252,0.1); border-radius:2px; }
      `}</style>
    </div>
  )
}
