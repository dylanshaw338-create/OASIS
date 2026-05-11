import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Paper } from '../../types/data'
import ReactMarkdown from 'react-markdown'

type RightPanelTab = 'metadata' | 'ai'

export default function PapersView() {
  const [papers, setPapers] = useState<Paper[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  
  // 右侧面板状态
  const [activeTab, setActiveTab] = useState<RightPanelTab>('metadata')
  const [editingPaper, setEditingPaper] = useState<Paper | null>(null)
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)

  // AI 对话状态
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiMessages, setAiMessages] = useState<{role: string, content: string}[]>([])
  const aiMessagesEndRef = useRef<HTMLDivElement>(null)

  const selectedPaper = papers.find(p => p.id === selectedId)

  // 1. 初始加载
  useEffect(() => {
    const loadKnowledgeBase = async () => {
      try {
        const data = await window.electronAPI.data.read('knowledge_base.json')
        if (data && Array.isArray(data)) {
          setPapers(data)
          if (data.length > 0) {
            setSelectedId(data[0].id)
            setEditingPaper(data[0])
          }
        }
      } catch (err) {
        console.error('Failed to load knowledge base:', err)
      } finally {
        setLoading(false)
      }
    }
    loadKnowledgeBase()
  }, [])

  // 监听选中切换
  useEffect(() => {
    if (selectedPaper) {
      setEditingPaper(selectedPaper)
      setAiMessages([]) // 切换论文时清空 AI 上下文
    } else {
      setEditingPaper(null)
    }
  }, [selectedId, selectedPaper?.id])

  // 自动滚动 AI 聊天
  useEffect(() => {
    aiMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiMessages])

  // 2. 导入文件
  const handleImport = async () => {
    try {
      const imported = await window.electronAPI.knowledge.importFile()
      if (imported && imported.length > 0) {
        const newPapers = [...imported, ...papers] as Paper[]
        setPapers(newPapers)
        await window.electronAPI.data.write('knowledge_base.json', newPapers)
        if (!selectedId) {
          setSelectedId(imported[0].id)
        }
      }
    } catch (err) {
      console.error('Import failed:', err)
    }
  }

  // 3. 元数据与笔记防抖保存
  const handleMetadataChange = (field: keyof Paper, value: any) => {
    if (!editingPaper) return
    const updated = { ...editingPaper, [field]: value }
    setEditingPaper(updated)

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const newPapers = papers.map(p => p.id === updated.id ? updated : p)
      setPapers(newPapers)
      await window.electronAPI.data.write('knowledge_base.json', newPapers)
    }, 500)
  }

  // 4. AI 总结论文
  const handleSummarize = async () => {
    if (!selectedPaper || aiLoading) return
    
    // 如果不是 PDF，提示无法总结
    if (selectedPaper.type.toLowerCase() !== 'pdf') {
      setAiMessages(prev => [...prev, { role: 'assistant', content: '抱歉，目前仅支持对 PDF 格式的文件进行自动解析和总结。' }])
      return
    }

    setAiLoading(true)
    setAiMessages([{ role: 'user', content: '请阅读这篇论文并给出详细的结构化总结。' }])
    
    try {
      // 1. 本地提取 PDF 文本
      const text = await window.electronAPI.knowledge.parsePdf(selectedPaper.localPath)
      if (!text || text.trim().length === 0) {
        throw new Error('未能从该 PDF 中提取到有效的文本内容。可能是纯图片 PDF 或已加密。')
      }
      const truncatedText = text.slice(0, 15000) // 截断防止超出 Token

      // 2. 组装 Prompt
      const systemPrompt = `你是一个专业的学术 AI 助手。请基于以下论文文本内容回答问题。如果文本包含乱码，请尽力推测其原意。论文文本：\n\n${truncatedText}`
      
      const config = await window.electronAPI.data.read('ai_config.json') as any
      if (!config || !config.apiKey) throw new Error('请先在全局 AI 面板中配置 API Key')

      const payload = [
        { role: 'system', name: 'system', content: systemPrompt },
        { role: 'user', content: '请详细总结这篇论文的核心贡献、研究方法、主要实验结果和结论。' }
      ]

      const res = await window.electronAPI.ai.chat(config, payload)
      const aiResponse = res.choices?.[0]?.message?.content || res.choices?.[0]?.messages?.[res.choices[0].messages.length - 1]?.content || ''
      
      setAiMessages(prev => [...prev, { role: 'assistant', content: aiResponse }])
      
      // 自动把总结保存到元数据的 aiSummary 中
      handleMetadataChange('aiSummary', aiResponse)

    } catch (err: any) {
      console.error(err)
      setAiMessages(prev => [...prev, { role: 'assistant', content: `[Error] ${err.message}` }])
    } finally {
      setAiLoading(false)
    }
  }

  // 5. AI 自由对话
  const handleAiSend = async () => {
    if (!aiInput.trim() || aiLoading || !selectedPaper) return
    
    if (selectedPaper.type.toLowerCase() !== 'pdf') {
      setAiMessages(prev => [...prev, { role: 'assistant', content: '抱歉，非 PDF 格式文件无法读取文本内容。' }])
      return
    }

    const userMsg = aiInput
    setAiInput('')
    setAiMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setAiLoading(true)

    try {
      const text = await window.electronAPI.knowledge.parsePdf(selectedPaper.localPath)
      const truncatedText = text.slice(0, 15000)

      const systemPrompt = `你是一个专业的学术 AI 助手。请基于以下论文文本内容回答用户问题。论文文本：\n\n${truncatedText}`
      const config = await window.electronAPI.data.read('ai_config.json') as any
      if (!config || !config.apiKey) throw new Error('请先在全局 AI 面板中配置 API Key')

      const payload = [
        { role: 'system', name: 'system', content: systemPrompt },
        ...aiMessages,
        { role: 'user', content: userMsg }
      ]

      const res = await window.electronAPI.ai.chat(config, payload)
      const aiResponse = res.choices?.[0]?.message?.content || res.choices?.[0]?.messages?.[res.choices[0].messages.length - 1]?.content || ''
      
      setAiMessages(prev => [...prev, { role: 'assistant', content: aiResponse }])
    } catch (err: any) {
      setAiMessages(prev => [...prev, { role: 'assistant', content: `[Error] ${err.message}` }])
    } finally {
      setAiLoading(false)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="w-full h-full flex text-white" style={{ background: 'transparent' }}>
      
      {/* ════ 列 1：论文列表 (左侧) ════ */}
      <aside style={{ width: '280px', flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column' }}>
        <div className="p-6 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div>
            <h2 style={{ fontSize: '0.8rem', letterSpacing: '0.15em', fontWeight: 500, color: 'rgba(255,255,255,0.9)' }}>
              KNOWLEDGE BASE
            </h2>
            <p style={{ fontSize: '0.55rem', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.4)', marginTop: '0.3rem' }}>
              {papers.length} DOCUMENTS
            </p>
          </div>
          <button
            onClick={handleImport}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: 'none',
              padding: '0.4rem 0.6rem',
              fontSize: '0.6rem',
              color: 'rgba(255, 255, 255, 0.8)',
              cursor: 'pointer',
              borderRadius: '4px',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
          >
            + ADD
          </button>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {loading ? (
            <div className="p-6 text-center text-white/30 text-xs">LOADING...</div>
          ) : papers.length === 0 ? (
            <div className="p-8 text-center text-white/30 flex flex-col items-center gap-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              <span style={{ fontSize: '0.65rem' }}>No documents imported</span>
            </div>
          ) : (
            <div className="flex flex-col">
              {papers.map((p) => {
                const isActive = p.id === selectedId
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className="group relative"
                    style={{
                      padding: '1.2rem 1.5rem',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid rgba(255,255,255,0.02)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.3s'
                    }}
                  >
                    {isActive && <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.6)]" />}
                    <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ zIndex: -1 }} />
                    {isActive && <div className="absolute inset-0 bg-white/5" style={{ zIndex: -1 }} />}
                    
                    <div style={{ fontSize: '0.85rem', color: isActive ? '#fff' : 'rgba(255,255,255,0.6)', fontWeight: isActive ? 500 : 300, lineHeight: 1.4, marginBottom: '0.4rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {p.title || p.name}
                    </div>
                    <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.05em' }}>
                      {p.type.toUpperCase()} · {formatSize(p.size)}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </aside>

      {/* ════ 列 2：PDF 阅读区 (中间) ════ */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.04)' }}>
        {selectedPaper ? (
          selectedPaper.type.toLowerCase() === 'pdf' ? (
            <iframe
              src={`file://${selectedPaper.localPath.replace(/\\/g, '/')}`}
              style={{ width: '100%', height: '100%', border: 'none', background: 'transparent' }}
              title="PDF Viewer"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-white/30 text-sm">
              该文件格式 ({selectedPaper.type}) 暂不支持内嵌预览，请外部打开。
            </div>
          )
        ) : (
          <div className="flex items-center justify-center h-full text-white/20 text-sm tracking-widest">
            SELECT A DOCUMENT
          </div>
        )}
      </div>

      {/* ════ 列 3：工作区 (右侧) ════ */}
      <aside style={{ width: '420px', flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.15)' }}>
        {selectedPaper && editingPaper ? (
          <>
            {/* 顶栏 Tab 切换 */}
            <div className="flex items-center px-6 pt-4 gap-6 relative" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <button
                onClick={() => setActiveTab('metadata')}
                style={{ background: 'none', border: 'none', color: activeTab === 'metadata' ? '#fff' : 'rgba(255,255,255,0.4)', padding: '0.8rem 0', fontSize: '0.75rem', cursor: 'pointer', transition: 'color 0.3s' }}
              >
                笔记与元数据
                {activeTab === 'metadata' && (
                  <motion.div layoutId="paper-tab-indicator" className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]" style={{ width: '80px' }} />
                )}
              </button>
              <button
                onClick={() => setActiveTab('ai')}
                style={{ background: 'none', border: 'none', color: activeTab === 'ai' ? '#fff' : 'rgba(255,255,255,0.4)', padding: '0.8rem 0', fontSize: '0.75rem', cursor: 'pointer', transition: 'color 0.3s' }}
              >
                AI 论文助手
                {activeTab === 'ai' && (
                  <motion.div layoutId="paper-tab-indicator" className="absolute bottom-0 h-[2px] bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]" style={{ width: '80px', left: '104px' }} />
                )}
              </button>
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
              
              {/* Tab 1: Metadata */}
              {activeTab === 'metadata' && (
                <div className="p-6 flex flex-col gap-6">
                  {/* Title */}
                  <div className="flex flex-col gap-2">
                    <label style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>TITLE</label>
                    <textarea
                      value={editingPaper.title || ''}
                      onChange={(e) => handleMetadataChange('title', e.target.value)}
                      style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.2rem', fontWeight: 500, outline: 'none', resize: 'none', minHeight: '60px' }}
                      placeholder="Paper Title"
                    />
                  </div>
                  {/* Authors */}
                  <div className="flex flex-col gap-2">
                    <label style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>AUTHORS</label>
                    <input
                      type="text"
                      value={(editingPaper.authors || []).join(', ')}
                      onChange={(e) => handleMetadataChange('authors', e.target.value.split(',').map(s => s.trim()))}
                      style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', outline: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}
                      placeholder="Author 1, Author 2..."
                    />
                  </div>
                  {/* Tags */}
                  <div className="flex flex-col gap-2">
                    <label style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>TAGS</label>
                    <input
                      type="text"
                      value={(editingPaper.tags || []).join(', ')}
                      onChange={(e) => handleMetadataChange('tags', e.target.value.split(',').map(s => s.trim()))}
                      style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', outline: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}
                      placeholder="tag1, tag2..."
                    />
                  </div>
                  {/* User Notes */}
                  <div className="flex flex-col gap-2 flex-1 mt-4">
                    <label style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>MY NOTES (MARKDOWN)</label>
                    <textarea
                      value={editingPaper.userNotes || ''}
                      onChange={(e) => handleMetadataChange('userNotes', e.target.value)}
                      style={{ flex: 1, minHeight: '300px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', color: 'rgba(255,255,255,0.9)', fontSize: '0.85rem', lineHeight: 1.6, padding: '1rem', outline: 'none', resize: 'none', fontFamily: "ui-monospace, monospace" }}
                      placeholder="在这里记录你的思考与灵感..."
                    />
                  </div>
                </div>
              )}

              {/* Tab 2: AI Assistant */}
              {activeTab === 'ai' && (
                <div className="flex flex-col h-full relative">
                  {/* 悬浮总结按钮 */}
                  <div className="absolute top-4 right-4 z-10">
                    <button
                      onClick={handleSummarize}
                      disabled={aiLoading}
                      style={{ background: 'rgba(96, 165, 250, 0.15)', border: '1px solid rgba(96, 165, 250, 0.3)', color: '#60a5fa', padding: '0.4rem 0.8rem', borderRadius: '4px', fontSize: '0.65rem', cursor: aiLoading ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
                    >
                      一键总结论文
                    </button>
                  </div>

                  {/* 聊天记录 */}
                  <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-6" style={{ scrollbarWidth: 'none', paddingTop: '4rem' }}>
                    {/* 显示保存的 AI Summary */}
                    {editingPaper.aiSummary && aiMessages.length === 0 && (
                      <div className="flex flex-col items-start gap-1">
                        <span style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>SAVED SUMMARY</span>
                        <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', lineHeight: 1.6 }} className="ai-chat-markdown">
                          <ReactMarkdown>{editingPaper.aiSummary}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                    
                    {aiMessages.map((msg, i) => (
                      <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <span style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', marginBottom: '4px' }}>
                          {msg.role === 'user' ? 'YOU' : 'AI'}
                        </span>
                        <div
                          style={{
                            color: msg.role === 'user' ? '#fff' : 'rgba(255,255,255,0.8)',
                            background: msg.role === 'user' ? '#059669' : 'transparent',
                            padding: msg.role === 'user' ? '0.6rem 1rem' : '0',
                            borderRadius: msg.role === 'user' ? '12px 4px 12px 12px' : '0',
                            fontSize: '0.85rem',
                            lineHeight: 1.6,
                            maxWidth: '90%'
                          }}
                          className="ai-chat-markdown"
                        >
                          {msg.role === 'assistant' ? <ReactMarkdown>{msg.content}</ReactMarkdown> : msg.content}
                        </div>
                      </div>
                    ))}
                    {aiLoading && <div className="text-white/40 text-sm animate-pulse">AI is reading...</div>}
                    <div ref={aiMessagesEndRef} />
                  </div>

                  {/* 输入框 */}
                  <div className="p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <textarea
                      value={aiInput}
                      onChange={e => setAiInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiSend(); } }}
                      placeholder="向 AI 询问关于此论文的任何问题..."
                      disabled={aiLoading}
                      style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.8rem', color: '#fff', fontSize: '0.8rem', resize: 'none', outline: 'none', minHeight: '60px' }}
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        ) : null}
      </aside>
    </div>
  )
}
