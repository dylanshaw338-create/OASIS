import { useEffect, useState, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { thoughtsService } from '../../services/dataService'
import type { Thought, ThoughtsStore } from '../../types/data'
import ContextMenu, { MenuItem } from '../ui/ContextMenu'
import PromptDialog from '../ui/PromptDialog'

// ================================================================
// 主组件
// ================================================================

export default function ThoughtsView() {
  const [store, setStore] = useState<ThoughtsStore | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('默认分区')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isPreview, setIsPreview] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [promptConfig, setPromptConfig] = useState<{ isOpen: boolean; title: string; defaultValue: string; onConfirm: (val: string) => void; onCancel: () => void } | null>(null)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // ref 存最新的 store/selectedId/content/title 给 keydown 闭包用
  const stateRef = useRef({ store, selectedId, title, content, selectedCategory })
  useEffect(() => { stateRef.current = { store, selectedId, title, content, selectedCategory } }, [store, selectedId, title, content, selectedCategory])

  // ── 初始化 ──
  useEffect(() => {
    async function init() {
      await thoughtsService.migrateFromLocalStorage()
      const loaded = await thoughtsService.load()

      if (loaded.thoughts.length === 0) {
        const first = thoughtsService.createThought('', '默认分区')
        const newStore: ThoughtsStore = { ...loaded, thoughts: [first] }
        await thoughtsService.save(newStore)
        setStore(newStore)
        setSelectedCategory('默认分区')
        setSelectedId(first.id)
        setTitle('')
        setContent('')
      } else {
        const sorted = sortThoughts(loaded.thoughts)
        setStore(loaded)
        const cat = sorted[0]?.category || '默认分区'
        setSelectedCategory(cat)
        setSelectedId(sorted[0].id)
        setTitle(sorted[0].title || '')
        setContent(sorted[0].content)
      }
    }
    init()
  }, [])

  // ── 切换预览时聚焦编辑器 ──
  useEffect(() => {
    // 只有在刚刚退出预览模式时，且焦点不在输入框时，才自动聚焦编辑器
    if (!isPreview) {
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        setTimeout(() => textareaRef.current?.focus(), 30)
      }
    }
  }, [isPreview])

  // ── Ctrl+N 新建 ──
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        const { store, selectedId, content, title, selectedCategory } = stateRef.current
        handleNew(store, selectedId, content, title, selectedCategory)
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
      currentContent: string,
      currentTitle: string
    ): Promise<ThoughtsStore> => {
      try {
        const thought = (currentStore.thoughts || []).find((t) => t.id === currentId)
        if (!thought) return currentStore

        const hasContentChange = thought.content !== currentContent
        const hasTitleChange = (thought.title || '') !== currentTitle

        if (!hasContentChange && !hasTitleChange) {
          return currentStore // 如果没有任何改变，直接返回，不触发更新和乱跳
        }

        const captured = thoughtsService.captureVersion(thought, currentContent)
        captured.title = currentTitle 
        if (hasTitleChange && !hasContentChange) {
          captured.updatedAt = new Date().toISOString()
        }

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

  // ── 切换分区 ──
  const handleCategorySelect = useCallback(async (cat: string) => {
    const { store, selectedId, content, title, selectedCategory } = stateRef.current
    if (!store || cat === selectedCategory) return

    // 离开前保存当前编辑的思想版本
    let latestStore = store
    if (selectedId) latestStore = await flushAndCapture(store, selectedId, content, title)

    const sorted = sortThoughts(latestStore.thoughts)
    const thoughtsInCat = sorted.filter(t => (t.category || '默认分区') === cat)
    
    if (thoughtsInCat.length > 0) {
      setStore(latestStore)
      setSelectedCategory(cat)
      setSelectedId(thoughtsInCat[0].id)
      setTitle(thoughtsInCat[0].title || '')
      setContent(thoughtsInCat[0].content)
      setIsPreview(false)
    } else {
      // 如果分区为空，自动创建一条空白笔记
      const newThought = thoughtsService.createThought('', cat)
      const newStore: ThoughtsStore = {
        ...latestStore,
        thoughts: [newThought, ...latestStore.thoughts]
      }
      await thoughtsService.save(newStore)
      setStore(newStore)
      setSelectedCategory(cat)
      setSelectedId(newThought.id)
      setTitle('')
      setContent('')
      setIsPreview(false)
    }
  }, [flushAndCapture])

  // ── 选择条目 ──
  const handleSelect = useCallback(
    async (id: string) => {
      const { store, selectedId, content, title } = stateRef.current
      if (!store || id === selectedId) return

      // 离开前保存版本
      let latestStore = store
      if (selectedId) latestStore = await flushAndCapture(store, selectedId, content, title)

      const target = latestStore.thoughts.find((t) => t.id === id)
      if (!target) return
      setStore(latestStore)
      setSelectedCategory(target.category || '默认分区')
      setSelectedId(id)
      setTitle(target.title || '')
      setContent(target.content)
      setIsPreview(false)
    },
    [flushAndCapture]
  )

  // ── 删除思想 ──
  const handleDelete = useCallback(
    async (idToDelete: string) => {
      const { store, selectedId, selectedCategory } = stateRef.current
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
        let newTitle = ''

        if (remainingThoughts.length === 0) {
          // 如果删空了整个库，强制创建一个新的空白条目
          const newThought = thoughtsService.createThought('', selectedCategory)
          newStore = { ...store, thoughts: [newThought] }
          newSelectedId = newThought.id
          newContent = ''
          newTitle = ''
        } else {
          newStore = { ...store, thoughts: remainingThoughts }
          // 如果删除的是当前选中的
          if (selectedId === idToDelete) {
            const sorted = sortThoughts(remainingThoughts)
            const catThoughts = sorted.filter(t => (t.category || '默认分区') === selectedCategory)
            if (catThoughts.length > 0) {
              newSelectedId = catThoughts[0].id
              newContent = catThoughts[0].content
              newTitle = catThoughts[0].title || ''
            } else {
              // 如果当前分区空了，自动创建一条
              const newThought = thoughtsService.createThought('', selectedCategory)
              newStore = { ...store, thoughts: [newThought, ...remainingThoughts] }
              newSelectedId = newThought.id
              newContent = ''
              newTitle = ''
            }
          } else {
            // 删除的不是当前选中的，保持当前选中状态
            newSelectedId = selectedId
            newContent = stateRef.current.content
            newTitle = stateRef.current.title
          }
        }

        await thoughtsService.save(newStore)
        setStore(newStore)
        if (newSelectedId !== selectedId) {
          setSelectedId(newSelectedId)
          setContent(newContent)
          setTitle(newTitle)
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
      currentContent: string,
      currentTitle: string,
      targetCategory: string = '默认分区'
    ) => {
      try {
        // 核心修复点：即使 currentStore 为空（如由于某些原因没加载出来），也允许创建
        let latestStore = currentStore || { schemaVersion: 1, categories: ['默认分区'], thoughts: [] }
        
        if (currentSelectedId) {
          latestStore = await flushAndCapture(latestStore, currentSelectedId, currentContent, currentTitle)
        }

        const newThought = thoughtsService.createThought('', targetCategory)
        const newStore: ThoughtsStore = {
          ...latestStore,
          thoughts: [newThought, ...(latestStore.thoughts || [])]
        }
        
        await thoughtsService.save(newStore)
        setStore(newStore)
        setSelectedCategory(targetCategory)
        setSelectedId(newThought.id)
        setTitle('')
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

  // ── 内容与标题变更（防抖自动保存） ──
  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      setContent(value)
      triggerAutoSave(title, value)
    },
    [title] // 需要最新 title，所以加依赖，或者使用 stateRef。但 triggerAutoSave 会从参数拿
  )

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setTitle(value)
      triggerAutoSave(value, content)
    },
    [content]
  )

  const triggerAutoSave = useCallback((newTitle: string, newContent: string) => {
    setSaveStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const { store, selectedId } = stateRef.current
      if (!store || !selectedId) return
      const thought = store.thoughts.find((t) => t.id === selectedId)
      if (!thought) return
      const updated = thoughtsService.updateThought(thought, newContent)
      updated.title = newTitle
      const newStore: ThoughtsStore = {
        ...store,
        thoughts: store.thoughts.map((t) => (t.id === selectedId ? updated : t))
      }
      await thoughtsService.save(newStore)
      setStore(newStore)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1500)
    }, 500)
  }, [])

  // ── 衍生状态 ──
  const sorted = store ? sortThoughts(store.thoughts) : []
  const filteredThoughts = sorted.filter(t => (t.category || '默认分区') === selectedCategory)
  const categories = store?.categories || ['默认分区']

  // ── 菜单处理函数 ──
  const handleContextMenuPartition = (e: React.MouseEvent, cat: string) => {
    e.preventDefault()
    setContextMenu({
      x: e.pageX,
      y: e.pageY,
      items: [
        {
          label: '重命名分区',
          onClick: () => {
            setPromptConfig({
              isOpen: true,
              title: '输入新的分区名称:',
              defaultValue: cat,
              onConfirm: async (newName) => {
                setPromptConfig(null)
                if (!newName || newName.trim() === '' || newName === cat || categories.includes(newName)) return
                if (!store) return
                const newStore: ThoughtsStore = {
                  ...store,
                  categories: store.categories!.map(c => c === cat ? newName : c),
                  thoughts: store.thoughts.map(t => (t.category || '默认分区') === cat ? { ...t, category: newName } : t)
                }
                await thoughtsService.save(newStore)
                setStore(newStore)
                if (selectedCategory === cat) setSelectedCategory(newName)
              },
              onCancel: () => setPromptConfig(null)
            })
          }
        },
        {
          label: '删除分区',
          danger: true,
          onClick: async () => {
            if (cat === '默认分区') {
              alert('“默认分区”不能删除。')
              return
            }
            if (!confirm(`确定要删除分区 "${cat}" 吗？\n其中的思想将被移动到“默认分区”。`)) return
            if (!store) return

            // 离开前保存当前编辑的思想版本
            const { selectedId, content, title } = stateRef.current
            let latestStore = store
            if (selectedId) latestStore = await flushAndCapture(store, selectedId, content, title)

            const newStore: ThoughtsStore = {
              ...latestStore,
              categories: latestStore.categories!.filter(c => c !== cat),
              thoughts: latestStore.thoughts.map(t => (t.category || '默认分区') === cat ? { ...t, category: '默认分区' } : t)
            }
            await thoughtsService.save(newStore)
            setStore(newStore)
            if (selectedCategory === cat) {
              setSelectedCategory('默认分区')
              // 自动切换焦点到默认分区的第一条笔记
              const sorted = sortThoughts(newStore.thoughts)
              const defaultThoughts = sorted.filter(t => (t.category || '默认分区') === '默认分区')
              if (defaultThoughts.length > 0) {
                setSelectedId(defaultThoughts[0].id)
                setTitle(defaultThoughts[0].title || '')
                setContent(defaultThoughts[0].content)
              }
            }
          }
        }
      ]
    })
  }

  const handleContextMenuThought = (e: React.MouseEvent, t: Thought) => {
    e.preventDefault()
    const menuItems: MenuItem[] = [
      {
        label: '重命名',
        onClick: () => {
          setPromptConfig({
            isOpen: true,
            title: '输入新的标题:',
            defaultValue: t.title || '',
            onConfirm: async (newTitle) => {
              setPromptConfig(null)
              if (!store) return
              const newStore: ThoughtsStore = {
                ...store,
                thoughts: store.thoughts.map(thought => thought.id === t.id ? { ...thought, title: newTitle } : thought)
              }
              await thoughtsService.save(newStore)
              setStore(newStore)
              if (t.id === selectedId) {
                setTitle(newTitle)
              }
            },
            onCancel: () => setPromptConfig(null)
          })
        }
      },
      {
        label: '删除思想',
        danger: true,
        onClick: () => handleDelete(t.id)
      }
    ]
    
    if (categories.length > 1) {
      categories.forEach(cat => {
        if (cat !== (t.category || '默认分区')) {
          menuItems.push({
            label: `移动到: ${cat}`,
            onClick: async () => {
              if (!store) return
              const newStore: ThoughtsStore = {
                ...store,
                thoughts: store.thoughts.map(thought => thought.id === t.id ? { ...thought, category: cat } : thought)
              }
              await thoughtsService.save(newStore)
              setStore(newStore)
              // 如果移动的是当前选中的思想，跟随它跳转到新分区
              if (t.id === selectedId) {
                setSelectedCategory(cat)
              }
            }
          })
        }
      })
    }
    
    setContextMenu({
      x: e.pageX,
      y: e.pageY,
      items: menuItems
    })
  }

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {promptConfig && (
        <PromptDialog
          isOpen={promptConfig.isOpen}
          title={promptConfig.title}
          defaultValue={promptConfig.defaultValue}
          onConfirm={promptConfig.onConfirm}
          onCancel={promptConfig.onCancel}
        />
      )}

      {/* ════ 列 1：分区侧边栏 ════ */}
      <aside
        style={{
          width: '180px',
          flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.03)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'rgba(0,0,0,0.2)'
        }}
      >
        <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ fontSize: '0.55rem', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)' }}>
            PARTITIONS
          </span>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto' }} className="thought-list">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategorySelect(cat)}
              onContextMenu={(e) => handleContextMenuPartition(e, cat)}
              style={{
                width: '100%',
                padding: '0.7rem 1rem',
                background: selectedCategory === cat ? 'rgba(200,228,252,0.08)' : 'transparent',
                border: 'none',
                borderLeft: selectedCategory === cat
                  ? '3px solid rgba(200,228,252,0.5)'
                  : '3px solid transparent',
                cursor: 'pointer',
                textAlign: 'left',
                color: selectedCategory === cat ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)',
                fontSize: '0.65rem',
                letterSpacing: '0.05em',
                transition: 'all 0.2s',
                textShadow: selectedCategory === cat ? '0 0 8px rgba(255,255,255,0.2)' : 'none'
              }}
              onMouseEnter={(e) => {
                if (selectedCategory !== cat) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
              }}
              onMouseLeave={(e) => {
                if (selectedCategory !== cat) e.currentTarget.style.background = 'transparent'
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        <button
          onClick={() => {
            setPromptConfig({
              isOpen: true,
              title: '输入新分区名称:',
              defaultValue: '',
              onConfirm: async (newCat) => {
                setPromptConfig(null)
                if (!newCat || newCat.trim() === '' || categories.includes(newCat)) return
                if (!store) return
                
                // 离开前保存当前编辑的思想版本
                const { selectedId, content, title } = stateRef.current
                let latestStore = store
                if (selectedId) latestStore = await flushAndCapture(store, selectedId, content, title)

                // 创建新分区并自动创建一条空白笔记
                const newThought = thoughtsService.createThought('', newCat)
                const newStore: ThoughtsStore = {
                  ...latestStore,
                  categories: [...(latestStore.categories || ['默认分区']), newCat],
                  thoughts: [newThought, ...latestStore.thoughts]
                }
                await thoughtsService.save(newStore)
                setStore(newStore)
                setSelectedCategory(newCat)
                setSelectedId(newThought.id)
                setTitle('')
                setContent('')
                setIsPreview(false)
              },
              onCancel: () => setPromptConfig(null)
            })
          }}
          style={{
            padding: '0.8rem 1rem',
            background: 'transparent',
            border: 'none',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            cursor: 'pointer',
            color: 'rgba(200,228,252,0.4)',
            fontSize: '0.55rem',
            letterSpacing: '0.1em',
            textAlign: 'left',
            transition: 'color 0.2s'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(200,228,252,0.8)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(200,228,252,0.4)')}
        >
          + NEW SECTION
        </button>
      </aside>

      {/* ════ 列 2：思想列表 ════ */}
      <aside
        style={{
          width: '260px',
          flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.03)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'rgba(0,0,0,0.1)'
        }}
      >
        {/* 新建按钮 */}
        <button
          onClick={() => {
            const { store, selectedId, content, title, selectedCategory } = stateRef.current
            handleNew(store, selectedId, content, title, selectedCategory)
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
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }} className="thought-list">
          {filteredThoughts.length === 0 && (
            <div style={{ padding: '4rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 0.3 }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem' }}><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.75rem', letterSpacing: '0.1em' }}>此分区暂无思想</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.55rem', marginTop: '0.4rem', letterSpacing: '0.05em' }}>等待被唤醒的留白...</div>
            </div>
          )}
          {filteredThoughts.map((t) => (
            <div key={t.id} onContextMenu={(e) => handleContextMenuThought(e, t)}>
              <ThoughtItem
                thought={t}
                isActive={t.id === selectedId}
                onClick={() => handleSelect(t.id)}
              />
            </div>
          ))}
        </div>
      </aside>

      {/* ════ 列 3：编辑区 ════ */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', WebkitAppRegion: 'no-drag' }}>
        {selectedId ? (
          <>
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '4rem 15% 4rem 15%', overflow: 'hidden' }}>
          {!isPreview && (
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              placeholder="无标题"
              spellCheck={false}
              className="title-input"
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'rgba(255,255,255,0.95)',
                fontSize: '2.2rem',
                fontWeight: 300,
                letterSpacing: '0.02em',
                marginBottom: '1rem',
                padding: '0',
                WebkitAppRegion: 'no-drag',
                WebkitUserSelect: 'text',
                userSelect: 'text',
                pointerEvents: 'auto',
                transition: 'text-shadow 0.3s ease'
              }}
            />
          )}
          {isPreview ? (
            <div style={{ flex: 1, overflowY: 'auto', marginLeft: '-15%', marginRight: '-15%', WebkitAppRegion: 'no-drag', WebkitUserSelect: 'text', userSelect: 'text', pointerEvents: 'auto' }}>
              <MarkdownPreview content={title ? `# ${title}\n\n${content}` : content} />
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              placeholder="记录此刻的思维..."
              spellCheck={false}
              className="content-textarea"
              style={{
                flex: 1,
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                color: 'rgba(255,255,255,0.85)',
                fontSize: '1.05rem',
                lineHeight: '2.2',
                letterSpacing: '0.03em',
                fontFamily: "ui-monospace, 'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Consolas, monospace",
                fontWeight: 300,
                caretColor: 'rgba(147, 197, 253, 0.8)',
                overflowY: 'auto',
                WebkitAppRegion: 'no-drag',
                WebkitUserSelect: 'text',
                userSelect: 'text',
                pointerEvents: 'auto',
                transition: 'text-shadow 0.3s ease'
              }}
            />)}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '0.8rem', letterSpacing: '0.1em' }}>
            没有选择任何笔记
          </div>
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
        
        /* Focus 时的微霓虹光晕反馈 */
        .title-input:focus {
          text-shadow: 0 0 16px rgba(147, 197, 253, 0.3) !important;
        }
        .content-textarea:focus {
          text-shadow: 0 0 8px rgba(255, 255, 255, 0.1) !important;
        }
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
  const preview = thought.title || firstLine.replace(/^#+\s*/, '').trim() || '空白'

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
          textShadow: isActive ? '0 0 10px rgba(255,255,255,0.2)' : 'none',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
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
