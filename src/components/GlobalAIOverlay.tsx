import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { PURCHASED_DATABASES } from '../config/databaseWhitelist'

interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
}

interface ChatSession {
  id: string
  title: string
  updatedAt: string
  messages: Message[]
}

interface GlobalAIOverlayProps {
  isOpen: boolean
  onClose: () => void
}

export default function GlobalAIOverlay({ isOpen, onClose }: GlobalAIOverlayProps) {
  const [isConfiguring, setIsConfiguring] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  
  // 批量管理状态
  const [isBatchMode, setIsBatchMode] = useState(false)
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set())

  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('abab6.5s-chat')
  const [injectLocalThoughts, setInjectLocalThoughts] = useState(true)
  const [dbWhitelist, setDbWhitelist] = useState(PURCHASED_DATABASES.join('\n'))

  // VPN 授权状态
  const [vpnAccount, setVpnAccount] = useState('')
  const [vpnPassword, setVpnPassword] = useState('')
  const [savedVpnAccount, setSavedVpnAccount] = useState('')
  const [vpnSaveStatus, setVpnSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')

  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevMessagesLengthRef = useRef(0) // 用于判断是新增还是删除

  // 计算当前渲染的消息列表
  const currentSession = sessions.find(s => s.id === currentSessionId)
  const messages = currentSession?.messages || []

  const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  // 1. 初始化检查配置和加载历史记录
  useEffect(() => {
    if (isOpen) {
      checkConfig()
      loadChatHistory()
    } else {
      // 关闭面板时退出批量模式
      setIsBatchMode(false)
      setSelectedMessageIds(new Set())
    }
  }, [isOpen])

  // 修复：仅在消息数量增加时滚动到底部，删除时不滚动
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevMessagesLengthRef.current = messages.length
  }, [messages])

  const loadChatHistory = async () => {
    try {
      const history = await window.electronAPI.data.read('ai_history.json')
      
      if (history && Array.isArray(history)) {
        if (history.length === 0) {
          createNewSession()
          return
        }

        // 兼容性判断：如果第一项是 Message 结构（没有 title），说明是旧版本纯数组格式
        const isLegacy = history[0] && history[0].role && !history[0].title

        if (isLegacy) {
          const sanitizedHistory = history
            .filter(msg => msg && msg.role && msg.content)
            .map(msg => ({
              id: makeId(),
              role: msg.role,
              content: msg.content
            }))
          
          const migratedSession: ChatSession = {
            id: makeId(),
            title: '历史对话',
            updatedAt: new Date().toISOString(),
            messages: sanitizedHistory
          }
          setSessions([migratedSession])
          setCurrentSessionId(migratedSession.id)
        } else {
          // 新版结构
          const loadedSessions = history as ChatSession[]
          // 按更新时间降序排序
          loadedSessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          setSessions(loadedSessions)
          setCurrentSessionId(loadedSessions[0]?.id || null)
        }
      } else {
        createNewSession()
      }
    } catch (e) {
      console.error('Failed to load chat history', e)
      createNewSession()
    }
  }

  const createNewSession = () => {
    const newSession: ChatSession = {
      id: makeId(),
      title: '新对话',
      updatedAt: new Date().toISOString(),
      messages: []
    }
    setSessions(prev => [newSession, ...prev])
    setCurrentSessionId(newSession.id)
    setShowHistory(false)
  }

  const deleteSession = async (e: React.MouseEvent, idToDelete: string) => {
    e.stopPropagation()
    const newSessions = sessions.filter(s => s.id !== idToDelete)
    setSessions(newSessions)
    
    if (currentSessionId === idToDelete) {
      if (newSessions.length > 0) {
        setCurrentSessionId(newSessions[0].id)
      } else {
        createNewSession() // 如果全删光了，自动新建一个
        return // createNewSession 会接管后续状态，但需要处理保存
      }
    }
    
    try {
      await window.electronAPI.data.write('ai_history.json', newSessions)
    } catch (err) {
      console.error('Failed to write history after deletion', err)
    }
  }

  const deleteMessage = async (msgIdToDelete: string) => {
    if (!currentSessionId) return
    const updatedSessions = sessions.map(s => {
      if (s.id === currentSessionId) {
        return {
          ...s,
          messages: s.messages.filter(m => m.id !== msgIdToDelete),
          updatedAt: new Date().toISOString()
        }
      }
      return s
    })
    
    setSessions(updatedSessions)
    try {
      await window.electronAPI.data.write('ai_history.json', updatedSessions)
    } catch (err) {
      console.error('Failed to write history after message deletion', err)
    }
  }

  const handleBatchDelete = async () => {
    if (!currentSessionId || selectedMessageIds.size === 0) return
    const updatedSessions = sessions.map(s => {
      if (s.id === currentSessionId) {
        return {
          ...s,
          messages: s.messages.filter(m => m.id && !selectedMessageIds.has(m.id)),
          updatedAt: new Date().toISOString()
        }
      }
      return s
    })
    
    setSessions(updatedSessions)
    setSelectedMessageIds(new Set())
    setIsBatchMode(false)
    try {
      await window.electronAPI.data.write('ai_history.json', updatedSessions)
    } catch (err) {
      console.error('Failed to write history after batch deletion', err)
    }
  }

  const checkConfig = async () => {
    try {
      const config = await window.electronAPI.data.read('ai_config.json')
      if (config && (config as any).apiKey) {
        setApiKey((config as any).apiKey)
        setModel((config as any).model || 'abab6.5s-chat')
        setInjectLocalThoughts((config as any).injectLocalThoughts !== false)
        if ((config as any).dbWhitelist !== undefined) {
          setDbWhitelist((config as any).dbWhitelist)
        }
        setIsConfiguring(false)
      } else {
        setModel('abab6.5s-chat') // 确保有一个默认有效的字符串
        setInjectLocalThoughts(true)
        setIsConfiguring(true)
      }
    } catch (e) {
      setModel('abab6.5s-chat')
      setInjectLocalThoughts(true)
      setIsConfiguring(true)
    }

    try {
      const vpnCreds = await window.electronAPI.vpn.getCredentials()
      if (vpnCreds && vpnCreds.account) {
        setSavedVpnAccount(vpnCreds.account)
        setVpnAccount(vpnCreds.account)
      }
    } catch (e) {
      console.error('Failed to get VPN credentials status', e)
    }
  }

  const handleSaveVpn = async () => {
    if (!vpnAccount.trim() || !vpnPassword.trim()) return
    setVpnSaveStatus('saving')
    try {
      const success = await window.electronAPI.vpn.saveCredentials(vpnAccount, vpnPassword)
      if (success) {
        setSavedVpnAccount(vpnAccount)
        setVpnSaveStatus('success')
        setTimeout(() => setVpnSaveStatus('idle'), 3000)
      } else {
        setVpnSaveStatus('error')
        setTimeout(() => setVpnSaveStatus('idle'), 3000)
      }
    } catch (e) {
      setVpnSaveStatus('error')
      setTimeout(() => setVpnSaveStatus('idle'), 3000)
    }
  }

  const handleClearVpn = async () => {
    try {
      await window.electronAPI.vpn.clearCredentials()
      setSavedVpnAccount('')
      setVpnAccount('')
      setVpnPassword('')
    } catch (e) {
      console.error('Failed to clear VPN credentials', e)
    }
  }

  const saveConfig = async () => {
    if (!apiKey.trim()) return
    await window.electronAPI.data.write('ai_config.json', { 
      provider: 'minimax', 
      apiKey, 
      model, 
      injectLocalThoughts,
      dbWhitelist
    })
    setIsConfiguring(false)
  }

  const handleSend = async () => {
    if (!input.trim() || loading || !currentSessionId) return

    const newMessage: Message = { id: makeId(), role: 'user', content: input }
    const newMessages = [...messages, newMessage]
    
    // 生成动态标题 (取第一条用户消息的前15个字)
    const newTitle = newMessages.length === 1 && newMessages[0].role === 'user'
      ? newMessages[0].content.slice(0, 15) + (newMessages[0].content.length > 15 ? '...' : '')
      : currentSession?.title || '新对话'

    const updatedSessions = sessions.map(s => {
      if (s.id === currentSessionId) {
        return { ...s, title: newTitle, messages: newMessages, updatedAt: new Date().toISOString() }
      }
      return s
    })

    setSessions(updatedSessions)
    setInput('')
    setLoading(true)
    
    try {
      await window.electronAPI.data.write('ai_history.json', updatedSessions)
    } catch (e) {
      console.error('Failed to write history', e)
    }

    try {
      const config = { provider: 'minimax', apiKey, model }
      
      // 2. 获取本地思想笔记，注入到 System Prompt
      
      // 注意：这里移除了硬编码的白名单约束，避免在工具调用（搜索）阶段发生提示词泄露（Prompt Leakage）
      // 白名单过滤逻辑已经后置到 electron/services/aiService.ts 中的第二次大模型调用中
      let systemPrompt = `你是一个名为 OASIS AI 的深度思想伙伴，致力于帮助用户探索未来人机交互的范式。你已完全接入全球互联网，并具备实时的网络搜索能力。面对任何需要寻找学术论文或实时信息的问题，请立刻主动调用工具。如果搜索不到有效信息，或者用户只是在询问你的能力，请用你自然、优雅的语气坦诚地说明情况即可，绝不能胡编乱造。你需要基于用户记录的思想，提供深刻、有启发性的见解。`
      
      if (injectLocalThoughts) {
        try {
          const thoughtsStore = await window.electronAPI.data.read('thoughts.json')
          if (thoughtsStore && (thoughtsStore as any).thoughts) {
            const recentThoughts = (thoughtsStore as any).thoughts
              .slice(0, 10) // 提取最近的10条笔记，防止超过 Token 限制
              .map((t: any) => `[${new Date(t.updatedAt).toLocaleString()}] ${t.content}`)
              .join('\n\n')
              
            if (recentThoughts) {
              systemPrompt += `\n\n【用户的最新思想笔记】:\n${recentThoughts}\n\n请在回答中结合用户的这些笔记内容进行发散和讨论。`
            }
          }
        } catch (err) {
          console.error('Failed to read thoughts for AI context', err)
        }
      }

      // 将 System Prompt 塞在最前面 (注意：发送给 API 时不需要 id 字段)
      // 如果消息本身已经包含 tool_calls 或 tool_call_id，说明它是工具调用的上下文，直接保留原始结构
      const payloadMessages = [
        { role: 'system', name: 'system', content: systemPrompt },
        ...newMessages.map(m => {
          const base: any = { role: m.role, content: m.content || '' }
          if (m.name) base.name = m.name
          if (m.tool_calls) base.tool_calls = m.tool_calls
          if (m.tool_call_id) base.tool_call_id = m.tool_call_id
          return base
        })
      ]

      const response = await window.electronAPI.ai.chat(config, payloadMessages)
      
      const appendAiMessage = async (msgContent: string, papers?: any[], isError = false) => {
        setSessions(prev => {
          const latestSessions = prev.map(s => {
            if (s.id === currentSessionId) {
              const newMsg: Message = { 
                id: makeId(), 
                role: 'assistant', 
                content: msgContent 
              }
              // 如果这轮对话后端返回了我们注入的论文数据，存进前端的 Message 里
              if (papers && papers.length > 0) {
                newMsg._papers = papers
              }
              return {
                ...s,
                messages: [...s.messages, newMsg],
                updatedAt: new Date().toISOString()
              }
            }
            return s
          })
          window.electronAPI.data.write('ai_history.json', latestSessions).catch(e => console.error('Failed to write history', e))
          return latestSessions
        })
      }

      if (response && response.choices && response.choices.length > 0) {
        const choice = response.choices[0]
        const aiMessage = choice.message || (choice.messages && choice.messages.length > 0 ? choice.messages[choice.messages.length - 1] : null)
        
        if (aiMessage) {
          // 这里读取主进程通过 _injectedPapers 传递过来的论文数据
          await appendAiMessage(aiMessage.content || '', response._injectedPapers)
        } else {
          throw new Error('API 响应中缺少 message 字段')
        }
      } else {
        await appendAiMessage('抱歉，接口返回异常或无内容。', [], true)
      }
    } catch (err: any) {
      console.error(err)
      setSessions(prev => {
        const latestSessions = prev.map(s => {
          if (s.id === currentSessionId) {
            return {
              ...s,
              messages: [...s.messages, { id: makeId(), role: 'assistant', content: `[Error] ${err.message || '请求失败'}` } as Message],
              updatedAt: new Date().toISOString()
            }
          }
          return s
        })
        window.electronAPI.data.write('ai_history.json', latestSessions).catch(e => console.error('Failed to write history', e))
        return latestSessions
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩：极致简洁，纯粹的暗色模糊 */}
          <motion.div
            className="fixed inset-0 z-40"
            style={{
              background: 'rgba(0, 0, 0, 0.2)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)'
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            translate="no"
            aria-hidden="true"
          />

          {/* AI 交互面板：去除发光边框，采用极简深灰纸张感 */}
          <motion.div
            className="fixed z-50 flex flex-col"
            style={{
              right: '8%',
              top: '12%',
              bottom: '12%',
              width: '520px',
              background: '#121620', // 带有冷蓝调的深色底板，与主程序和谐
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: '12px',
              boxShadow: '0 24px 48px -12px rgba(0,0,0,0.4)',
              overflow: 'hidden'
            }}
            initial={{ opacity: 0, x: 20, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {isConfiguring ? (
              /* 设置界面 */
              <div className="flex flex-col h-full p-8 text-white">
                <div className="mb-8">
                  <h3 style={{ fontSize: '1rem', letterSpacing: '0.15em', fontWeight: 300, color: 'rgba(255,255,255,0.9)' }}>
                    INITIALIZE AI
                  </h3>
                  <p style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em', marginTop: '0.5rem' }}>
                    配置您的神经连接凭证 (目前以 MiniMax 作为基础测试)
                  </p>
                </div>

                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-2">
                    <label style={{ fontSize: '0.55rem', letterSpacing: '0.2em', color: 'rgba(147, 197, 253, 0.7)' }}>API KEY</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                      style={{
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(147, 197, 253, 0.2)',
                        borderRadius: '6px',
                        padding: '0.75rem 1rem',
                        color: 'white',
                        fontSize: '0.8rem',
                        outline: 'none',
                        transition: 'border-color 0.3s'
                      }}
                      onFocus={(e) => e.target.style.borderColor = 'rgba(147, 197, 253, 0.6)'}
                      onBlur={(e) => e.target.style.borderColor = 'rgba(147, 197, 253, 0.2)'}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label style={{ fontSize: '0.55rem', letterSpacing: '0.2em', color: 'rgba(147, 197, 253, 0.7)' }}>MODEL</label>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      style={{
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(147, 197, 253, 0.2)',
                        borderRadius: '6px',
                        padding: '0.75rem 1rem',
                        color: 'white',
                        fontSize: '0.8rem',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="abab6.5s-chat" style={{ background: '#1a202c' }}>abab6.5s-chat</option>
                      <option value="abab6.5-chat" style={{ background: '#1a202c' }}>abab6.5-chat</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label style={{ fontSize: '0.55rem', letterSpacing: '0.2em', color: 'rgba(147, 197, 253, 0.7)' }}>CONTEXT</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)' }}>
                      <input 
                        type="checkbox" 
                        checked={injectLocalThoughts}
                        onChange={(e) => setInjectLocalThoughts(e.target.checked)}
                        style={{ accentColor: '#93c5fd', width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      融合本地思想笔记作为 AI 上下文
                    </label>
                    <p style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.25rem' }}>
                      开启后，AI 将读取您最近的思想笔记以提供个性化回答。关闭后可节省 Token 并避免干扰。
                    </p>
                  </div>

                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '1rem 0' }}></div>

                  <div className="mb-2">
                    <h3 style={{ fontSize: '0.85rem', letterSpacing: '0.15em', fontWeight: 300, color: 'rgba(255,255,255,0.9)' }}>
                      DATABASE WHITELIST
                    </h3>
                    <p style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em', marginTop: '0.5rem' }}>
                      配置机构已采购的核心学术数据库，每行一个。AI 会在推荐论文时依据此名单进行权限过滤与提示。
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <textarea
                      value={dbWhitelist}
                      onChange={(e) => setDbWhitelist(e.target.value)}
                      placeholder="ACM&#10;IEEE&#10;Springer..."
                      style={{ 
                        background: 'rgba(0,0,0,0.3)', 
                        border: '1px solid rgba(147, 197, 253, 0.2)', 
                        borderRadius: '6px', 
                        padding: '0.8rem', 
                        color: 'white', 
                        fontSize: '0.8rem', 
                        outline: 'none', 
                        transition: 'border-color 0.3s',
                        minHeight: '120px',
                        resize: 'vertical',
                        lineHeight: '1.6'
                      }}
                      onFocus={(e) => e.target.style.borderColor = 'rgba(147, 197, 253, 0.6)'}
                      onBlur={(e) => e.target.style.borderColor = 'rgba(147, 197, 253, 0.2)'}
                    />
                  </div>

                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '1rem 0' }}></div>

                  <div className="mb-2">
                    <h3 style={{ fontSize: '0.85rem', letterSpacing: '0.15em', fontWeight: 300, color: 'rgba(255,255,255,0.9)' }}>
                      ACADEMIC NETWORK (WEBVPN)
                    </h3>
                    <p style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em', marginTop: '0.5rem' }}>
                      授权后可使用系统级静默下载 Agent。凭证将在本地通过系统级硬件密钥安全加密存储。
                    </p>
                  </div>

                  {savedVpnAccount ? (
                    <div className="flex items-center justify-between p-4" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '6px' }}>
                      <div className="flex flex-col">
                        <span style={{ fontSize: '0.65rem', color: '#10b981', letterSpacing: '0.1em' }}>AUTHORIZED ACCOUNT</span>
                        <span style={{ fontSize: '0.9rem', color: 'white', marginTop: '0.2rem' }}>{savedVpnAccount}</span>
                      </div>
                      <button
                        onClick={handleClearVpn}
                        style={{ background: 'transparent', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'rgba(239, 68, 68, 0.9)', padding: '0.4rem 0.8rem', borderRadius: '4px', fontSize: '0.65rem', cursor: 'pointer', transition: 'all 0.3s' }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        CLEAR
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <div className="flex gap-4">
                        <div className="flex flex-col gap-2 flex-1">
                          <label style={{ fontSize: '0.55rem', letterSpacing: '0.2em', color: 'rgba(147, 197, 253, 0.7)' }}>STUDENT ID</label>
                          <input
                            type="text"
                            value={vpnAccount}
                            onChange={(e) => setVpnAccount(e.target.value)}
                            placeholder="微人大账号"
                            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(147, 197, 253, 0.2)', borderRadius: '6px', padding: '0.6rem 0.8rem', color: 'white', fontSize: '0.8rem', outline: 'none', transition: 'border-color 0.3s' }}
                            onFocus={(e) => e.target.style.borderColor = 'rgba(147, 197, 253, 0.6)'}
                            onBlur={(e) => e.target.style.borderColor = 'rgba(147, 197, 253, 0.2)'}
                          />
                        </div>
                        <div className="flex flex-col gap-2 flex-1">
                          <label style={{ fontSize: '0.55rem', letterSpacing: '0.2em', color: 'rgba(147, 197, 253, 0.7)' }}>PASSWORD</label>
                          <input
                            type="password"
                            value={vpnPassword}
                            onChange={(e) => setVpnPassword(e.target.value)}
                            placeholder="微人大密码"
                            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(147, 197, 253, 0.2)', borderRadius: '6px', padding: '0.6rem 0.8rem', color: 'white', fontSize: '0.8rem', outline: 'none', transition: 'border-color 0.3s' }}
                            onFocus={(e) => e.target.style.borderColor = 'rgba(147, 197, 253, 0.6)'}
                            onBlur={(e) => e.target.style.borderColor = 'rgba(147, 197, 253, 0.2)'}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={handleSaveVpn}
                          disabled={!vpnAccount || !vpnPassword || vpnSaveStatus === 'saving'}
                          style={{
                            background: vpnSaveStatus === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${vpnSaveStatus === 'success' ? 'rgba(16, 185, 129, 0.5)' : 'rgba(255,255,255,0.1)'}`,
                            color: vpnSaveStatus === 'success' ? '#10b981' : (vpnSaveStatus === 'error' ? '#ef4444' : 'rgba(255,255,255,0.8)'),
                            padding: '0.4rem 1rem',
                            borderRadius: '4px',
                            fontSize: '0.65rem',
                            cursor: (!vpnAccount || !vpnPassword || vpnSaveStatus === 'saving') ? 'not-allowed' : 'pointer',
                            transition: 'all 0.3s'
                          }}
                        >
                          {vpnSaveStatus === 'saving' ? 'SAVING...' : vpnSaveStatus === 'success' ? 'SAVED ✓' : vpnSaveStatus === 'error' ? 'ERROR ✗' : 'SAVE CREDENTIALS'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-auto flex justify-end">
                  <button
                    onClick={saveConfig}
                    style={{
                      background: 'rgba(147, 197, 253, 0.15)',
                      border: '1px solid rgba(147, 197, 253, 0.3)',
                      color: 'rgba(255,255,255,0.9)',
                      padding: '0.6rem 1.5rem',
                      borderRadius: '4px',
                      fontSize: '0.65rem',
                      letterSpacing: '0.15em',
                      cursor: 'pointer',
                      transition: 'all 0.3s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(147, 197, 253, 0.25)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'rgba(147, 197, 253, 0.15)'}
                  >
                    CONNECT
                  </button>
                </div>
              </div>
            ) : (
              /* 聊天界面 */
              <div className="flex flex-col h-full">
                <style>{`
                  .ai-chat-markdown p { margin-bottom: 0.5em; }
                  .ai-chat-markdown p:last-child { margin-bottom: 0; }
                  .ai-chat-markdown strong { color: #fff; font-weight: 500; }
                  .ai-chat-markdown ul { list-style-type: disc; padding-left: 1.5em; margin-bottom: 0.5em; }
                  .ai-chat-markdown ol { list-style-type: decimal; padding-left: 1.5em; margin-bottom: 0.5em; }
                  .ai-chat-markdown li { margin-bottom: 0.25em; }
                  .ai-chat-markdown a { color: #60a5fa; text-decoration: none; }
                  .ai-chat-markdown a:hover { text-decoration: underline; }
                  .ai-chat-markdown code { background: rgba(255,255,255,0.08); padding: 0.15em 0.3em; border-radius: 4px; font-family: monospace; font-size: 0.9em; color: #e2e8f0; }
                  .ai-chat-markdown pre { background: #1e2536; padding: 1rem; border-radius: 6px; overflow-x: auto; margin: 0.5em 0; }
                  .ai-chat-markdown pre code { background: transparent; padding: 0; color: #e2e8f0; }
                  .ai-paper-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 12px; margin: 8px 0; display: flex; flex-direction: column; gap: 8px; transition: all 0.3s; }
                  .ai-paper-card:hover { background: rgba(255,255,255,0.05); border-color: rgba(147, 197, 253, 0.3); }
                  .ai-paper-title { font-weight: 600; color: #fff; font-size: 0.95rem; }
                  .ai-paper-meta { font-size: 0.75rem; color: #9ca3af; display: flex; gap: 12px; }
                  .ai-paper-abstract { font-size: 0.8rem; color: #d1d5db; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
                  .ai-paper-btn { align-self: flex-start; background: rgba(147, 197, 253, 0.1); border: 1px solid rgba(147, 197, 253, 0.3); color: #93c5fd; padding: 4px 12px; border-radius: 4px; font-size: 0.75rem; cursor: pointer; transition: all 0.2s; }
                  .ai-paper-btn:hover { background: rgba(147, 197, 253, 0.2); }
                `}</style>
                {/* 顶栏 */}
                <div className="px-6 py-4 flex items-center justify-between" style={{ background: '#191e2b', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setShowHistory(!showHistory)}
                      style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      title="历史对话"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                    </button>
                    <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>
                      {currentSession?.title || '新对话'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    {/* 批量管理按钮 */}
                    {messages.length > 0 && (
                      <button
                        onClick={() => {
                          if (isBatchMode) {
                            setIsBatchMode(false)
                            setSelectedMessageIds(new Set())
                          } else {
                            setIsBatchMode(true)
                          }
                        }}
                        style={{ background: 'none', border: 'none', color: isBatchMode ? '#60a5fa' : 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', fontSize: '0.6rem', gap: '0.2rem' }}
                        title="批量管理对话"
                      >
                        {isBatchMode ? '完成' : '批量'}
                      </button>
                    )}
                    <button
                      onClick={createNewSession}
                      style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      title="新建对话"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </button>
                    <button
                      onClick={() => setIsConfiguring(true)}
                      style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      title="设置"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    </button>
                  </div>
                </div>

                {/* 主体区域（含历史侧边栏、消息列表、底部输入框） */}
                <div className="flex-1 relative flex flex-col overflow-hidden">
                  {/* 历史对话侧边栏 */}
                  <AnimatePresence>
                    {showHistory && (
                      <motion.div
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="absolute inset-y-0 left-0 z-10 flex flex-col"
                        style={{
                          width: '200px',
                          background: '#0d1119', // 历史侧边栏更深的冷色调
                          borderRight: '1px solid rgba(255,255,255,0.05)',
                        }}
                      >
                        <div className="p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <span style={{ fontSize: '0.55rem', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)' }}>
                            HISTORY SESSIONS
                          </span>
                        </div>
                        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                          {sessions.map(s => (
                            <div
                              key={s.id}
                              onClick={() => {
                                setCurrentSessionId(s.id)
                                setShowHistory(false)
                              }}
                              className="group relative cursor-pointer"
                              style={{
                                padding: '0.8rem 1rem',
                                borderBottom: '1px solid rgba(255,255,255,0.02)',
                                background: s.id === currentSessionId ? '#1e2536' : 'transparent',
                                transition: 'background 0.2s'
                              }}
                            >
                              <div style={{ fontSize: '0.75rem', color: s.id === currentSessionId ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {s.title}
                              </div>
                              <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.2rem' }}>
                                {new Date(s.updatedAt).toLocaleString()}
                              </div>
                              <button
                                onClick={(e) => deleteSession(e, s.id)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'rgba(255,255,255,0.4)',
                                  width: '24px',
                                  height: '24px',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(239, 68, 68, 0.8)' }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
                                title="删除会话"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* 消息列表 */}
                  <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8 w-full" style={{ scrollbarWidth: 'none', background: '#121620' }}>
                    {(!messages || messages.length === 0) && (
                      <div className="m-auto text-center opacity-30 flex flex-col items-center gap-4">
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path><path d="M12 12 2.1 7.1"></path><path d="M12 12l9.9 4.9"></path></svg>
                        </div>
                        <div>
                          <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>OASIS AI</p>
                          <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.2rem' }}>随时准备协助您的探索</p>
                        </div>
                      </div>
                    )}
                    {messages && messages.map((msg, i) => msg && (
                      <div key={msg.id || i} className="group flex items-start gap-4 relative" style={{ maxWidth: '100%', cursor: isBatchMode ? 'pointer' : 'default' }} onClick={() => {
                        if (isBatchMode && msg.id) {
                          const newSet = new Set(selectedMessageIds)
                          if (newSet.has(msg.id)) newSet.delete(msg.id)
                          else newSet.add(msg.id)
                          setSelectedMessageIds(newSet)
                        }
                      }}>
                        {/* 批量模式的 Checkbox */}
                        {isBatchMode && (
                          <div style={{ flexShrink: 0, width: '20px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: `1px solid ${selectedMessageIds.has(msg.id!) ? '#60a5fa' : 'rgba(255,255,255,0.3)'}`, background: selectedMessageIds.has(msg.id!) ? '#60a5fa' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                              {selectedMessageIds.has(msg.id!) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                            </div>
                          </div>
                        )}
                        {/* 头像 */}
                        <div style={{ flexShrink: 0, width: '32px', height: '32px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: msg.role === 'user' ? '#059669' : '#1e2536' }}>
                          {msg.role === 'user' ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                          ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path></svg>
                          )}
                        </div>

                        {/* 流式正文区 (不再使用彩色气泡框) */}
                        <div className="flex flex-col" style={{ maxWidth: 'calc(100% - 64px)', paddingRight: '2rem', paddingTop: '4px' }}>
                          <div
                            style={{
                              color: 'rgba(255,255,255,0.95)',
                              fontSize: '0.9rem',
                              lineHeight: 1.7,
                              wordWrap: 'break-word',
                              userSelect: 'text',
                              WebkitUserSelect: 'text'
                            }}
                            className="ai-chat-markdown"
                          >
                            {msg.role === 'assistant' ? (
                              <>
                                <ReactMarkdown>
                                  {(msg.content || '').replace(/【\d+†source】/g, '')}
                                </ReactMarkdown>
                                {/* 渲染注入的论文卡片 */}
                                {msg._papers && msg._papers.length > 0 && (
                                  <div className="mt-4 flex flex-col gap-2">
                                    {msg._papers.map((paper: any, idx: number) => (
                                      <div key={idx} className="ai-paper-card">
                                        <div className="ai-paper-title">{paper.title}</div>
                                        <div className="ai-paper-meta">
                                          <span>{paper.authors?.map((a:any)=>a.name).join(', ') || 'Unknown Authors'}</span>
                                          <span>•</span>
                                          <span>{paper.year || 'Unknown Year'}</span>
                                          {paper.citationCount !== undefined && (
                                            <>
                                              <span>•</span>
                                              <span>{paper.citationCount} Citations</span>
                                            </>
                                          )}
                                        </div>
                                        {paper.abstract && (
                                          <div className="ai-paper-abstract">{paper.abstract}</div>
                                        )}
                                        {paper.externalIds?.DOI && (
                                          <button 
                                            className="ai-paper-btn"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              window.electronAPI.knowledge.testDoiDownload(paper.externalIds.DOI);
                                            }}
                                          >
                                            直达出版商下载 (DOI: {paper.externalIds.DOI})
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
                            ) : (
                              <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content || ''}</div>
                            )}
                          </div>

                          {/* 底部操作栏 (悬浮浮现，仅在非批量模式下可用) */}
                          {!isBatchMode && (
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 mt-2" style={{ marginLeft: '-4px' }}>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(msg.content)
                                }}
                                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: '4px', display: 'flex', borderRadius: '4px' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                                title="复制"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                              </button>
                              {msg.id && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); deleteMessage(msg.id!); }}
                                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: '4px', display: 'flex', borderRadius: '4px' }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(239, 68, 68, 0.8)' }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
                                  title="删除此消息"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {loading && (
                      <div className="flex items-start gap-4">
                        {isBatchMode && <div style={{ width: '20px' }}></div>}
                        <div style={{ flexShrink: 0, width: '32px', height: '32px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e2536' }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path></svg>
                        </div>
                        <div style={{ paddingTop: '8px' }}>
                          <span className="animate-pulse" style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>Thinking...</span>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                {/* 输入框区域：极简底板，无多余边框 */}
                  <div className="p-4" style={{ background: '#191e2b', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    {isBatchMode ? (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.8rem 1rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)' }}>已选择 {selectedMessageIds.size} 条消息</span>
                        <div style={{ display: 'flex', gap: '0.8rem' }}>
                          <button
                            onClick={() => { setIsBatchMode(false); setSelectedMessageIds(new Set()); }}
                            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)', padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                          >
                            取消
                          </button>
                          <button
                            onClick={handleBatchDelete}
                            disabled={selectedMessageIds.size === 0}
                            style={{ background: selectedMessageIds.size > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)', color: selectedMessageIds.size > 0 ? 'rgba(239, 68, 68, 0.9)' : 'rgba(255,255,255,0.3)', border: 'none', padding: '0.4rem 1rem', borderRadius: '4px', cursor: selectedMessageIds.size > 0 ? 'pointer' : 'not-allowed', fontSize: '0.75rem', transition: 'all 0.2s' }}
                          >
                            删除所选
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        background: 'transparent',
                        borderRadius: '8px',
                        overflow: 'hidden'
                      }}>
                        <textarea
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              handleSend()
                            }
                          }}
                          placeholder="输入您的想法... (Shift+Enter 换行)"
                          disabled={loading}
                          style={{
                            width: '100%',
                            minHeight: '44px',
                            maxHeight: '200px',
                            background: 'transparent',
                            border: 'none',
                            padding: '0.5rem 0',
                            color: 'rgba(255,255,255,0.95)',
                            fontSize: '0.9rem',
                            lineHeight: '1.5',
                            outline: 'none',
                            resize: 'none',
                            fontFamily: 'inherit'
                          }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem' }}>
                          {/* 左侧工具占位区 */}
                          <div style={{ display: 'flex', gap: '1rem', color: 'rgba(255,255,255,0.4)' }}>
                            <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }} title="表情">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
                            </button>
                            <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }} title="附件">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                            </button>
                          </div>
                          {/* 右下角发送按钮 */}
                          <button
                            onClick={handleSend}
                            disabled={!input.trim() || loading}
                            style={{
                              background: input.trim() && !loading ? '#059669' : 'rgba(255,255,255,0.05)',
                              color: input.trim() && !loading ? 'white' : 'rgba(255,255,255,0.3)',
                              border: 'none',
                              padding: '0.4rem 1.2rem',
                              borderRadius: '4px',
                              fontSize: '0.8rem',
                              fontWeight: 500,
                              cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                              transition: 'all 0.2s',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            发送
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
