import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import ParticleCanvas from './ParticleCanvas'
import ThoughtsView from './views/ThoughtsView'
import GraphView from './views/GraphView'
import PapersView from './views/PapersView'
import AIView from './views/AIView'

type Tab = 'thoughts' | 'graph' | 'papers' | 'ai'

const TABS: { id: Tab; label: string; sub: string }[] = [
  { id: 'thoughts', label: '思想', sub: 'THOUGHTS' },
  { id: 'graph', label: '图谱', sub: 'GRAPH' },
  { id: 'papers', label: '论文', sub: 'PAPERS' },
  { id: 'ai', label: 'AI', sub: '' }
]

interface MainWorkspaceProps {
  onEscapeRequest: () => void
}

export default function MainWorkspace({ onEscapeRequest }: MainWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<Tab>('thoughts')
  const [clock, setClock] = useState(() => formatClock())

  // 实时时钟
  useEffect(() => {
    const timer = setInterval(() => setClock(formatClock()), 1000)
    return () => clearInterval(timer)
  }, [])

  // ESC 退出监听
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscapeRequest()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onEscapeRequest])

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden flex flex-col">
      {/* 粒子背景（稍微调亮，增加存在感） */}
      <ParticleCanvas opacity={0.4} particleCount={75} />

      {/* 中央径向光晕 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(30, 58, 138, 0.06) 0%, transparent 70%)'
        }}
      />

      {/* 顶栏 */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="relative z-10 flex items-center justify-between px-8"
        style={{
          height: '42px',
          borderBottom: '1px solid rgba(99, 179, 237, 0.08)',
          flexShrink: 0
        }}
      >
        {/* 左：标题 */}
        <span
          style={{
            fontSize: '0.65rem',
            letterSpacing: '0.3em',
            color: 'rgba(255,255,255,0.35)',
            fontWeight: 300
          }}
        >
          ◈ FUTURE HCI
        </span>

        {/* 中：时间 */}
        <span
          style={{
            fontSize: '0.6rem',
            letterSpacing: '0.15em',
            color: 'rgba(147, 197, 253, 0.3)',
            fontWeight: 300,
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {clock}
        </span>

        {/* 右：版本 */}
        <span
          style={{
            fontSize: '0.55rem',
            letterSpacing: '0.2em',
            color: 'rgba(255,255,255,0.15)',
            fontWeight: 300
          }}
        >
          v0.1 · PHASE 0
        </span>
      </motion.div>

      {/* 内容区 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.4 }}
        className="relative z-10 flex-1 overflow-hidden"
      >
        {activeTab === 'thoughts' && <ThoughtsView />}
        {activeTab === 'graph' && <GraphView />}
        {activeTab === 'papers' && <PapersView />}
        {activeTab === 'ai' && <AIView />}
      </motion.div>

      {/* 底部导航 */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="relative z-10 flex items-center justify-center gap-12"
        style={{
          height: '50px',
          borderTop: '1px solid rgba(99, 179, 237, 0.1)',
          flexShrink: 0
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.25rem 0.5rem',
                transition: 'opacity 0.2s ease'
              }}
            >
              <span
                style={{
                  fontSize: '0.7rem',
                  letterSpacing: '0.05em',
                  color: isActive ? 'rgba(147, 197, 253, 0.9)' : 'rgba(255,255,255,0.2)',
                  fontWeight: isActive ? 400 : 300,
                  transition: 'color 0.3s ease'
                }}
              >
                {tab.label}
              </span>
              {tab.sub && (
                <span
                  style={{
                    fontSize: '0.5rem',
                    letterSpacing: '0.15em',
                    color: isActive ? 'rgba(147, 197, 253, 0.4)' : 'rgba(255,255,255,0.1)',
                    fontWeight: 300,
                    transition: 'color 0.3s ease'
                  }}
                >
                  {tab.sub}
                </span>
              )}
              {/* 激活指示线 */}
              {isActive && (
                <motion.div
                  layoutId="tab-indicator"
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    height: '1px',
                    background: 'rgba(147, 197, 253, 0.5)'
                  }}
                />
              )}
            </button>
          )
        })}
      </motion.div>
    </div>
  )
}

function formatClock() {
  const now = new Date()
  const date = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const time = now.toLocaleTimeString('zh-CN', { hour12: false })
  return `${date}  ${time}`
}
