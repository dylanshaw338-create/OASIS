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
      try {
        const thought = (currentStore.thoughts || []).find((t) => t.id === currentId)
        if (!thought) return currentStore
        const captured = thoughtsService.captureVersion(thought, currentContent)
        const newStore: ThoughtsStore = {
          ...currentStore,
          thoughts: (currentStore.thoughts || []).map((t) => (t.id === currentId ? captured : t))
        }
        await thoughtsService.save(newStore)
        return newStore
      } catch (err) {
        console.error('保存版本失败:', err)
        return currentStore
      }
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

  // ── 删除思想 ──
  const handleDelete = useCallback(
    async (idToDelete: string) => {
      const { store, selectedId } = stateRef.current
      if (!store) return

      // 弹窗确认
      if (!window.confirm('确定要删除这条记录吗？该操作不可恢复。')) {
        return
      }

      try {
        const remainingThoughts = store.thoughts.filter((t) => t.id !== idToDelete)
        
        let newStore: ThoughtsStore
        let newSelectedId: string | null = null
        let newContent = ''

        if (remainingThoughts.length === 0) {
          // 如果删空了，强制创建一个新的空白条目
          const newThought = thoughtsService.createThought('')
          newStore = { ...store, thoughts: [newThought] }
          newSelectedId = newThought.id
          newContent = ''
        } else {
          newStore = { ...store, thoughts: remainingThoughts }
          // 如果删除的是当前选中的，默认选中排序后的第一个
          if (selectedId === idToDelete) {
            const sorted = sortThoughts(remainingThoughts)
            newSelectedId = sorted[0].id
            newContent = sorted[0].content
          } else {
            // 删除的不是当前选中的，保持当前选中状态
            newSelectedId = selectedId
            newContent = stateRef.current.content
          }
        }

        await thoughtsService.save(newStore)
        setStore(newStore)
        if (newSelectedId !== selectedId) {
          setSelectedId(newSelectedId)
          setContent(newContent)
          setIsPreview(false)
        }
      } catch (err) {
        console.error('删除失败:', err)
        alert('删除失败: ' + String(err))
      }
    },
    []
  )
  const handleNew = useCallback(
    async (
      currentStore: ThoughtsStore | null,
      currentSelectedId: string | null,
      currentContent: string
    ) => {
      try {
        // 核心修复点：即使 currentStore 为空（如由于某些原因没加载出来），也允许创建
        let latestStore = currentStore || { schemaVersion: 1, thoughts: [] }
        
        if (currentSelectedId) {
          latestStore = await flushAndCapture(latestStore, currentSelectedId, currentContent)
        }

        const newThought = thoughtsService.createThought('')
        const newStore: ThoughtsStore = {
          ...latestStore,
          thoughts: [newThought, ...(latestStore.thoughts || [])]
        }
        
        await thoughtsService.save(newStore)
        setStore(newStore)
        setSelectedId(newThought.id)
        setContent('')
        setIsPreview(false)
        setTimeout(() => textareaRef.current?.focus(), 50)
      } catch (err) {
        console.error('新建思想失败:', err)
        alert('新建失败，已拦截崩溃: ' + String(err))
      }
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

  // 移除了提前 return LoadingView，避免完全阻塞界面
  // if (!store) return <LoadingView />

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      {/* ════ 左侧面板：玻璃态侧边栏 ════ */}
      <aside
        className="glass-panel"
        style={{
          width: '240px',
          flexShrink: 0,
          border: 'none',
          borderRight: '1px solid rgba(147, 197, 253, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'rgba(10, 15, 30, 0.2)'
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

          {/* 删除按钮 */}
          <button
            onClick={() => handleDelete(selectedId!)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.52rem',
              letterSpacing: '0.22em',
              color: 'rgba(239, 68, 68, 0.4)', // 红色调
              transition: 'color 0.2s',
              marginRight: '1rem'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(239, 68, 68, 0.9)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(239, 68, 68, 0.4)')}
            title="删除当前笔记"
          >
            DELETE
          </button>

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
            placeholder="# 记录此刻的思维..."
            spellCheck={false}
            style={{
              flex: 1,
              width: '100%',
              padding: '4rem 20% 4rem 15%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              color: 'rgba(255,255,255,0.95)',
              fontSize: '1.1rem',
              lineHeight: '2.2',
              letterSpacing: '0.03em',
              fontFamily: "ui-monospace, 'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Consolas, monospace",
              fontWeight: 300,
              caretColor: 'rgba(147, 197, 253, 0.8)',
              overflowY: 'auto',
              textShadow: '0 0 1px rgba(255,255,255,0.1)'
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
          letterSpacing: '0.15em',
          color: isActive ? 'rgba(147, 197, 253, 0.6)' : 'rgba(147, 197, 253, 0.3)',
          marginBottom: '0.35rem',
          transition: 'color 0.3s'
        }}
      >
        {date} · {time}
      </p>
      <p
        style={{
          fontSize: '0.7rem',
          color: isActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.4)',
          letterSpacing: '0.04em',
          lineHeight: 1.5,
          fontWeight: isActive ? 400 : 300,
          transition: 'all 0.3s ease',
          textShadow: isActive ? '0 0 10px rgba(255,255,255,0.2)' : 'none'
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
