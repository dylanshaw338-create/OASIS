import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Paper } from '../../types/data'
import ReactMarkdown from 'react-markdown'

type RightPanelTab = 'metadata' | 'ai'

import ContextMenu from '../ui/ContextMenu'

import { PURCHASED_DATABASES } from '../../config/databaseWhitelist'

export default function PapersView() {
  const [papers, setPapers] = useState<Paper[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  
  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, paper: Paper } | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAcademicAgent, setShowAcademicAgent] = useState(false)
  
  // 学术检索 Agent 状态
  const [agentChatInput, setAgentChatInput] = useState('')
  const [agentChatLoading, setAgentChatLoading] = useState(false)
  const [agentMessages, setAgentMessages] = useState<any[]>([])
  const agentMessagesEndRef = useRef<HTMLDivElement>(null)

  const [activeTab, setActiveTab] = useState<RightPanelTab>('metadata')
  const [editingPaper, setEditingPaper] = useState<Paper | null>(null)
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)

  // AI 对话状态
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiMessages, setAiMessages] = useState<{role: string, content: string}[]>([])
  const aiMessagesEndRef = useRef<HTMLDivElement>(null)

  // VPN 状态
  const [vpnConnected, setVpnConnected] = useState(false)
  const [isConnectingVpn, setIsConnectingVpn] = useState(false)
  const [smsRequired, setSmsRequired] = useState<{ tailNumber: string | null } | null>(null)
  const [smsCode, setSmsCode] = useState('')
  const [isSubmittingSms, setIsSubmittingSms] = useState(false)

  const selectedPaper = papers.find(p => p.id === selectedId)

  // 1. 初始加载与事件监听
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

    // 监听 WebVPN 自动下载完成事件
    window.electronAPI.knowledge.onDownloadComplete(async (newPaper: Paper) => {
      console.log('Received new paper from agent:', newPaper)
      setPapers(prev => {
        const updated = [newPaper, ...prev]
        window.electronAPI.data.write('knowledge_base.json', updated)
        return updated
      })
      setSelectedId(newPaper.id)
    })

    // 监听 WebVPN 自动化流程中的短信验证码请求
    window.electronAPI.vpn.onRequireSms((tailNumber) => {
      setSmsRequired({ tailNumber })
      setIsConnectingVpn(false) // 暂停 loading 动画，等待用户输入
    })
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

  useEffect(() => {
    agentMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agentMessages])

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

  // 5. AI 自由对话 (伴读)
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

  // 5.5 学术检索 Agent 自由对话
  const handleAgentSend = async () => {
    if (!agentChatInput.trim() || agentChatLoading) return;
    
    const userMsg = agentChatInput;
    setAgentChatInput('');
    
    const newMessages = [...agentMessages, { role: 'user', content: userMsg }];
    setAgentMessages(newMessages);
    setAgentChatLoading(true);

    try {
      const config = await window.electronAPI.data.read('ai_config.json') as any;
      if (!config || !config.apiKey) throw new Error('请先在全局 AI 面板中配置 API Key');

      const dynamicWhitelist = config.dbWhitelist ? config.dbWhitelist.split('\n').map((s:string) => s.trim()).filter(Boolean) : PURCHASED_DATABASES;

      // 注意：这里移除了硬编码的白名单约束，避免在工具调用（搜索）阶段发生提示词泄露（Prompt Leakage）
      // 白名单过滤逻辑已经后置到 electron/services/aiService.ts 中的第二次大模型调用中
      const systemPrompt = `你是一个名为 OASIS AI 的深度学术检索助手。面对任何需要寻找论文的问题，请立刻主动调用 search_academic_papers 工具。如果搜索不到有效信息，请用自然、优雅的语气坦诚地说明情况即可，绝不能胡编乱造。`;

      const payload = [
        { role: 'system', name: 'system', content: systemPrompt },
        ...newMessages.map(m => {
          const base: any = { role: m.role, content: m.content || '' }
          if (m.name) base.name = m.name
          if (m.tool_calls) base.tool_calls = m.tool_calls
          if (m.tool_call_id) base.tool_call_id = m.tool_call_id
          return base
        })
      ];

      const res = await window.electronAPI.ai.chat(config, payload);
      
      const choice = res.choices?.[0];
      const aiMessage = choice?.message || (choice?.messages && choice.messages.length > 0 ? choice.messages[choice.messages.length - 1] : null);
      
      if (aiMessage) {
        const newMsg: any = { role: 'assistant', content: aiMessage.content || '' };
        if (res._injectedPapers && res._injectedPapers.length > 0) {
          newMsg._papers = res._injectedPapers;
        }
        setAgentMessages(prev => [...prev, newMsg]);
      } else {
        setAgentMessages(prev => [...prev, { role: 'assistant', content: '模型返回了空的消息结构，可能是由于流控限制。' }]);
      }
    } catch (err: any) {
      setAgentMessages(prev => [...prev, { role: 'assistant', content: `[Error] ${err.message}` }]);
    } finally {
      setAgentChatLoading(false);
    }
  }

  // 6. 连接 WebVPN (自动化流程)
  const handleConnectWebVPN = async () => {
    setIsConnectingVpn(true)
    setSmsRequired(null)
    setSmsCode('')
    try {
      // 第一步：触发自动登录（这可能会抛出 vpn:require-sms 事件，也可能直接返回 true）
      const success = await window.electronAPI.knowledge.connectWebVPN()
      
      // 如果直接返回 true，说明 cookie 未过期或者不需要短信
      if (success) {
        setVpnConnected(true)
        setIsConnectingVpn(false)
      } else {
        // 如果返回 false，可能是没填账号，也可能是代码正在等待短信事件回调（此时不改状态）
        // 或者是登录彻底失败。这里简单处理，如果没弹窗，就停止 loading
        setTimeout(() => {
          if (!smsRequired) {
            setIsConnectingVpn(false)
          }
        }, 1000)
      }
    } catch (err) {
      console.error('Failed to connect WebVPN', err)
      setIsConnectingVpn(false)
    }
  }

  // 7. 提交短信验证码
  const handleSubmitSms = async () => {
    if (smsCode.length < 4 || isSubmittingSms) return
    setIsSubmittingSms(true)
    try {
      const success = await window.electronAPI.vpn.submitSms(smsCode)
      if (success) {
        setVpnConnected(true)
        setSmsRequired(null)
        setSmsCode('')
      } else {
        alert('验证码错误或登录失败，请重试')
        setSmsCode('')
      }
    } catch (err) {
      console.error('Failed to submit SMS', err)
      alert('提交失败')
    } finally {
      setIsSubmittingSms(false)
    }
  }

  // 自动提交逻辑
  useEffect(() => {
    if (smsCode.length === 6 && !isSubmittingSms) {
      handleSubmitSms()
    }
  }, [smsCode])

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

        {/* WebVPN 探路区域 */}
        <div className="px-6 py-4 flex flex-col gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <button
            onClick={handleConnectWebVPN}
            disabled={isConnectingVpn || vpnConnected || !!smsRequired}
            className="w-full flex items-center justify-center gap-2 relative overflow-hidden group"
            style={{
              background: vpnConnected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.03)',
              border: `1px solid ${vpnConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
              padding: '0.6rem',
              fontSize: '0.65rem',
              color: vpnConnected ? '#10b981' : 'rgba(255, 255, 255, 0.6)',
              cursor: (isConnectingVpn || vpnConnected || !!smsRequired) ? 'default' : 'pointer',
              borderRadius: '6px',
              transition: 'all 0.3s ease',
              letterSpacing: '0.05em'
            }}
          >
            {!vpnConnected && !isConnectingVpn && !smsRequired && <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            {isConnectingVpn ? 'CONNECTING...' : vpnConnected ? 'VPN CONNECTED' : 'RUC WEBVPN'}
          </button>

          {/* 极简短信验证码弹窗 (内嵌显示) */}
          <AnimatePresence>
            {smsRequired && !vpnConnected && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-3 mt-2 p-4" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px' }}>
                  <div className="flex flex-col">
                    <span style={{ fontSize: '0.6rem', color: '#60a5fa', letterSpacing: '0.05em', fontWeight: 500 }}>
                      VERIFICATION REQUIRED
                    </span>
                    <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.2rem', lineHeight: 1.4 }}>
                      验证码已发送至您的绑定手机
                    </span>
                  </div>
                  
                  <div className="relative">
                    <input
                      type="text"
                      maxLength={6}
                      value={smsCode}
                      onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ''))}
                      disabled={isSubmittingSms}
                      placeholder="输入 6 位验证码"
                      style={{
                        width: '100%',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '6px',
                        padding: '0.6rem 0.8rem',
                        color: 'white',
                        fontSize: '0.8rem',
                        letterSpacing: '0.2em',
                        textAlign: 'center',
                        outline: 'none',
                        transition: 'border-color 0.3s'
                      }}
                      onFocus={(e) => e.target.style.borderColor = 'rgba(59, 130, 246, 0.5)'}
                      onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                      autoFocus
                    />
                    {isSubmittingSms && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="4.93" x2="19.07" y2="7.76"></line>
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {vpnConnected && (
            <>
              <button
                onClick={() => {
                  setShowAcademicAgent(true);
                  setSelectedId(null); // Deselect paper to focus on agent
                }}
                className="w-full flex items-center justify-center gap-2 relative overflow-hidden group mb-2 mt-4"
                style={{
                  background: showAcademicAgent ? 'rgba(168, 85, 247, 0.25)' : 'rgba(168, 85, 247, 0.15)',
                  border: '1px solid rgba(168, 85, 247, 0.3)',
                  padding: '0.8rem',
                  fontSize: '0.7rem',
                  color: '#c084fc',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  transition: 'all 0.3s ease',
                  letterSpacing: '0.05em',
                  fontWeight: 500
                }}
              >
                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                ✦ ACADEMIC SEARCH AGENT
              </button>
              <button
                onClick={() => {
                  window.electronAPI.knowledge.openWoS();
                  console.log('WebVPN portal prepared.');
                }}
                className="w-full flex items-center justify-center gap-2 relative overflow-hidden group mb-2"
                style={{
                  background: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  padding: '0.6rem',
                  fontSize: '0.65rem',
                  color: '#60a5fa',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  transition: 'all 0.3s ease',
                  letterSpacing: '0.05em'
                }}
              >
                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                ENTER THE INTERFACE
              </button>
            </>
          )}
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
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, paper: p });
                    }}
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

      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: '打开并查看详情',
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>,
              onClick: () => {
                setSelectedId(contextMenu.paper.id);
                setShowAcademicAgent(false);
              }
            },
            {
              label: '在文件夹中显示',
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>,
              onClick: () => {
                window.electronAPI.knowledge.showInFolder(contextMenu.paper.localPath);
              }
            },
            {
              label: '彻底删除',
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>,
              danger: true,
              onClick: async () => {
                if (confirm(`确定要彻底删除论文 "${contextMenu.paper.title || contextMenu.paper.name}" 吗？物理文件也将被删除。`)) {
                  await window.electronAPI.knowledge.deletePaper(contextMenu.paper.localPath);
                  const updatedPapers = papers.filter(p => p.id !== contextMenu.paper.id);
                  await window.electronAPI.data.write('knowledge_base.json', updatedPapers);
                  setPapers(updatedPapers);
                  if (selectedId === contextMenu.paper.id) {
                    setSelectedId(null);
                  }
                }
              }
            }
          ]}
        />
      )}

      {showAcademicAgent ? (
        <div className="flex-1 flex flex-col h-full relative" style={{ background: 'rgba(0,0,0,0.2)' }}>
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
            .ai-paper-card:hover { background: rgba(255,255,255,0.05); border-color: rgba(168, 85, 247, 0.4); }
            .ai-paper-title { font-weight: 600; color: #fff; font-size: 0.95rem; }
            .ai-paper-meta { font-size: 0.75rem; color: #9ca3af; display: flex; gap: 12px; }
            .ai-paper-abstract { font-size: 0.8rem; color: #d1d5db; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
            .ai-paper-btn { align-self: flex-start; background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.3); color: #c084fc; padding: 6px 16px; border-radius: 4px; font-size: 0.75rem; cursor: pointer; transition: all 0.2s; font-weight: 500; letter-spacing: 0.05em; }
            .ai-paper-btn:hover { background: rgba(168, 85, 247, 0.25); }
          `}</style>
          
          <div className="px-8 py-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#fff', letterSpacing: '0.05em' }}>
              ✦ ACADEMIC SEARCH AGENT
            </h1>
            <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.4rem' }}>
              Search globally for papers. Click the download button on results to open them via WebVPN.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6" style={{ scrollbarWidth: 'none' }}>
            {agentMessages.length === 0 && (
              <div className="m-auto text-center opacity-30 flex flex-col items-center gap-4">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <span style={{ fontSize: '0.8rem', letterSpacing: '0.1em' }}>READY TO SEARCH</span>
              </div>
            )}
            
            {agentMessages.map((msg, i) => (
              <div key={i} className={`flex items-start gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div style={{ flexShrink: 0, width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: msg.role === 'user' ? '#059669' : '#1e2536' }}>
                  {msg.role === 'user' ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path></svg>
                  )}
                </div>
                
                <div className="flex flex-col" style={{ maxWidth: '80%' }}>
                  <div
                    style={{
                      color: 'rgba(255,255,255,0.95)',
                      fontSize: '0.9rem',
                      lineHeight: 1.7,
                      wordWrap: 'break-word',
                      userSelect: 'text',
                      WebkitUserSelect: 'text',
                      background: msg.role === 'user' ? 'rgba(5, 150, 105, 0.2)' : 'transparent',
                      padding: msg.role === 'user' ? '0.8rem 1.2rem' : '0.4rem 0',
                      borderRadius: '8px'
                    }}
                    className="ai-chat-markdown"
                  >
                    {msg.role === 'assistant' ? (
                      <>
                        <ReactMarkdown>
                          {(msg.content || '').replace(/【\d+†source】/g, '')}
                        </ReactMarkdown>
                        {msg._papers && msg._papers.length > 0 && (
                          <div className="mt-4 flex flex-col gap-3">
                            {msg._papers.map((paper: any, idx: number) => (
                              <div key={idx} className="ai-paper-card">
                                <div className="ai-paper-title">{paper.title}</div>
                                <div className="ai-paper-meta">
                                  <span style={{ color: '#c084fc' }}>{paper.publisher || 'Unknown Publisher'}</span>
                                  <span>•</span>
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
                </div>
              </div>
            ))}
            {agentChatLoading && (
              <div className="flex items-start gap-4">
                <div style={{ flexShrink: 0, width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e2536' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path></svg>
                </div>
                <div className="text-white/40 text-sm flex items-center h-[36px] animate-pulse">
                  Agent is searching across the globe...
                </div>
              </div>
            )}
            <div ref={agentMessagesEndRef} />
          </div>

          <div className="p-6" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)' }}>
            <div className="relative max-w-4xl mx-auto">
              <textarea
                value={agentChatInput}
                onChange={e => setAgentChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAgentSend(); } }}
                placeholder="例如：找几篇关于 Human Computer Interaction 的高质量论文..."
                disabled={agentChatLoading}
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1rem 3rem 1rem 1rem', color: '#fff', fontSize: '0.9rem', resize: 'none', outline: 'none', minHeight: '60px' }}
                onFocus={(e) => e.target.style.borderColor = 'rgba(168, 85, 247, 0.5)'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
              <button
                onClick={handleAgentSend}
                disabled={!agentChatInput.trim() || agentChatLoading}
                className="absolute right-3 bottom-3"
                style={{
                  background: (!agentChatInput.trim() || agentChatLoading) ? 'transparent' : '#a855f7',
                  border: 'none',
                  color: (!agentChatInput.trim() || agentChatLoading) ? 'rgba(255,255,255,0.2)' : '#fff',
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: (!agentChatInput.trim() || agentChatLoading) ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
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
                SELECT A DOCUMENT OR OPEN SEARCH AGENT
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
                  <div className="ml-auto flex gap-4 items-center">
                    <button
                      onClick={async () => {
                        await window.electronAPI.knowledge.showInFolder(editingPaper.localPath);
                      }}
                      title="在文件夹中显示"
                      style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm(`确定要彻底删除论文 "${editingPaper.title || editingPaper.name}" 吗？物理文件也将被删除。`)) {
                          await window.electronAPI.knowledge.deletePaper(editingPaper.localPath);
                          const updatedPapers = papers.filter(p => p.id !== editingPaper.id);
                          await window.electronAPI.data.write('knowledge_base.json', updatedPapers);
                          setPapers(updatedPapers);
                          setSelectedId(null);
                        }
                      }}
                      title="彻底删除论文"
                      style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                  </div>
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
                        <div className="relative">
                          <textarea
                            value={aiInput}
                            onChange={e => setAiInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiSend(); } }}
                            placeholder="向 AI 询问关于此论文的任何问题..."
                            disabled={aiLoading}
                            style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.8rem 2.5rem 0.8rem 0.8rem', color: '#fff', fontSize: '0.8rem', resize: 'none', outline: 'none', minHeight: '60px' }}
                          />
                          <button
                            onClick={handleAiSend}
                            disabled={!aiInput.trim() || aiLoading}
                            className="absolute right-2 bottom-2"
                            style={{
                              background: (!aiInput.trim() || aiLoading) ? 'transparent' : '#059669',
                              border: 'none',
                              color: (!aiInput.trim() || aiLoading) ? 'rgba(255,255,255,0.2)' : '#fff',
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: (!aiInput.trim() || aiLoading) ? 'not-allowed' : 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </aside>
        </>
      )}
    </div>
  )
}
