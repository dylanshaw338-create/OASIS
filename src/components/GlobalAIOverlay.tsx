import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface GlobalAIOverlayProps {
  isOpen: boolean
  onClose: () => void
}

export default function GlobalAIOverlay({ isOpen, onClose }: GlobalAIOverlayProps) {
  const [isConfiguring, setIsConfiguring] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('abab6.5s-chat')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      checkConfig()
    }
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const checkConfig = async () => {
    try {
      const config = await window.electronAPI.data.read('ai_config.json')
      if (config && (config as any).apiKey) {
        setApiKey((config as any).apiKey)
        setModel((config as any).model || 'abab6.5s-chat')
        setIsConfiguring(false)
      } else {
        setIsConfiguring(true)
      }
    } catch (e) {
      setIsConfiguring(true)
    }
  }

  const saveConfig = async () => {
    if (!apiKey.trim()) return
    await window.electronAPI.data.write('ai_config.json', { provider: 'minimax', apiKey, model })
    setIsConfiguring(false)
  }

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const newMessages = [...messages, { role: 'user', content: input } as Message]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const config = { provider: 'minimax', apiKey, model }
      const response = await window.electronAPI.ai.chat(config, newMessages)
      
      if (response && response.choices && response.choices.length > 0) {
        setMessages([...newMessages, response.choices[0].message])
      } else {
        setMessages([...newMessages, { role: 'assistant', content: '抱歉，接口返回异常或无内容。' }])
      }
    } catch (err: any) {
      console.error(err)
      setMessages([...newMessages, { role: 'assistant', content: `[Error] ${err.message || '请求失败'}` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩：不全黑，使用带有玻璃态的高级模糊 */}
          <motion.div
            className="fixed inset-0 z-40"
            style={{
              background: 'rgba(10, 15, 30, 0.4)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)'
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* AI 交互面板 */}
          <motion.div
            className="fixed z-50 flex flex-col"
            style={{
              right: '8%',
              top: '15%',
              bottom: '15%',
              width: '480px',
              background: 'rgba(20, 30, 50, 0.65)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(147, 197, 253, 0.15)',
              borderRadius: '16px',
              boxShadow: '0 20px 40px -10px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.05)'
            }}
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
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
                {/* 顶栏 */}
                <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: '0.65rem', letterSpacing: '0.2em', color: 'rgba(147, 197, 253, 0.8)', fontWeight: 300 }}>
                    NEURAL LINK · {model.toUpperCase()}
                  </span>
                  <button
                    onClick={() => setIsConfiguring(true)}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '0.6rem' }}
                  >
                    CONFIG
                  </button>
                </div>

                {/* 消息列表 */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6" style={{ scrollbarWidth: 'none' }}>
                  {messages.length === 0 && (
                    <div className="m-auto text-center opacity-30">
                      <p style={{ fontSize: '0.8rem', letterSpacing: '0.2em', color: 'rgba(147, 197, 253, 0.8)', fontWeight: 300 }}>OASIS AI</p>
                      <p style={{ fontSize: '0.6rem', letterSpacing: '0.05em', color: 'white', marginTop: '0.5rem' }}>随时准备协助您的探索</p>
                    </div>
                  )}
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <span style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', marginBottom: '4px' }}>
                        {msg.role === 'user' ? 'YOU' : 'AI'}
                      </span>
                      <div
                        style={{
                          background: msg.role === 'user' ? 'rgba(147, 197, 253, 0.15)' : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${msg.role === 'user' ? 'rgba(147, 197, 253, 0.2)' : 'rgba(255,255,255,0.05)'}`,
                          padding: '0.8rem 1rem',
                          borderRadius: '8px',
                          color: 'rgba(255,255,255,0.9)',
                          fontSize: '0.85rem',
                          lineHeight: 1.6,
                          maxWidth: '85%',
                          wordWrap: 'break-word',
                          whiteSpace: 'pre-wrap'
                        }}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex flex-col items-start">
                      <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.8rem', borderRadius: '8px' }}>
                        <span className="animate-pulse" style={{ color: 'rgba(147, 197, 253, 0.6)', fontSize: '0.8rem' }}>Thinking...</span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* 输入框 */}
                <div className="p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="输入您的想法..."
                    disabled={loading}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      padding: '0.8rem 1rem',
                      color: 'white',
                      fontSize: '0.85rem',
                      outline: 'none',
                      transition: 'all 0.3s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'rgba(147, 197, 253, 0.4)'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
