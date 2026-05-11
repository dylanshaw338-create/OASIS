import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import ParticleCanvas from './ParticleCanvas'
import ThoughtsView from './views/ThoughtsView'
import GraphView from './views/GraphView'
import PapersView from './views/PapersView'
import AIView from './views/AIView'
import AISummonStar from './AISummonStar'
import GlobalAIOverlay from './GlobalAIOverlay'

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
  const [isAIOverlayOpen, setIsAIOverlayOpen] = useState(false)

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
    <div className="relative w-full h-screen overflow-hidden flex flex-col bg-[#030508]">
      {/* 宏大且显性的星云漂移背景 */}
      <motion.div
        className="absolute inset-0 pointer-events-none opacity-100"
        animate={{
          backgroundPosition: ['0% 0%', '100% 100%', '0% 100%', '100% 0%', '0% 0%']
        }}
        transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
        style={{
          background: `
            radial-gradient(circle at 20% 30%, rgba(125, 211, 252, 0.15) 0%, transparent 40%),
            radial-gradient(circle at 80% 70%, rgba(88, 28, 135, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 50% 50%, rgba(30, 58, 138, 0.2) 0%, transparent 60%)
          `,
          backgroundSize: '200% 200%'
        }}
      />

      {/* 粒子背景（大幅增加粒子数量，增强透明度） */}
      <ParticleCanvas opacity={0.7} />

      {/* 中央径向光晕 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(30, 58, 138, 0.12) 0%, transparent 70%)'
        }}
      />
      
      {/* 边缘暗角（沉浸封闭感，强化暗度） */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.4) 85%, rgba(0,0,0,0.8) 100%)'
      }} />

      {/* AI 召唤主星 (固定在右侧) */}
      <AISummonStar onClick={() => setIsAIOverlayOpen(true)} />

      {/* AI 悬浮面板 */}
      <GlobalAIOverlay isOpen={isAIOverlayOpen} onClose={() => setIsAIOverlayOpen(false)} />

      {/* 顶栏：极简沉浸态 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-20 flex items-center justify-between px-8 mx-8 mt-6"
        style={{
          height: '48px',
          flexShrink: 0
        }}
      >
        {/* 左：标题 */}
        <span
          style={{
            fontSize: '0.65rem',
            letterSpacing: '0.4em',
            color: 'rgba(255,255,255,0.45)',
            fontWeight: 400
          }}
        >
          ◈ FUTURE HCI
        </span>

        {/* 中：时间 */}
        <span
          style={{
            fontSize: '0.65rem',
            letterSpacing: '0.2em',
            color: 'rgba(147, 197, 253, 0.4)',
            fontWeight: 300,
            fontVariantNumeric: 'tabular-nums',
            textShadow: '0 0 8px rgba(147, 197, 253, 0.2)'
          }}
        >
          {clock}
        </span>

        {/* 右：版本 */}
        <span
          style={{
            fontSize: '0.55rem',
            letterSpacing: '0.3em',
            color: 'rgba(255,255,255,0.25)',
            fontWeight: 400
          }}
        >
          v0.3 · PHASE 2
        </span>
      </motion.div>

      {/* 核心内容区包裹：去除边框，极致留白 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.2, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex-1 overflow-hidden mx-8 my-6"
      >
        {activeTab === 'thoughts' && <ThoughtsView />}
        {activeTab === 'graph' && <GraphView />}
        {activeTab === 'papers' && <PapersView />}
        {activeTab === 'ai' && <AIView />}
      </motion.div>

      {/* 底部导航：悬浮胶囊 Dock */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-20 flex items-center justify-center gap-12 mx-auto mb-10 rounded-full"
        style={{
          height: '52px',
          padding: '0 3rem',
          flexShrink: 0,
          background: 'rgba(255, 255, 255, 0.015)',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.04)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="group relative"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.5rem',
                transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <span
                style={{
                  fontSize: '0.75rem',
                  letterSpacing: '0.15em',
                  color: isActive ? 'rgba(147, 197, 253, 0.95)' : 'rgba(255,255,255,0.25)',
                  fontWeight: isActive ? 400 : 300,
                  transition: 'color 0.4s ease, text-shadow 0.4s ease',
                  textShadow: isActive ? '0 0 12px rgba(147, 197, 253, 0.4)' : 'none'
                }}
                className="group-hover:text-blue-200/60"
              >
                {tab.label}
              </span>
              {tab.sub && (
                <span
                  style={{
                    fontSize: '0.5rem',
                    letterSpacing: '0.2em',
                    color: isActive ? 'rgba(147, 197, 253, 0.5)' : 'rgba(255,255,255,0.15)',
                    fontWeight: 300,
                    transition: 'color 0.4s ease'
                  }}
                >
                  {tab.sub}
                </span>
              )}
              {/* 激活指示光斑 */}
              {isActive && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2"
                  style={{
                    width: '30%',
                    height: '2px',
                    background: 'rgba(147, 197, 253, 0.8)',
                    borderRadius: '2px',
                    boxShadow: '0 0 10px 2px rgba(147, 197, 253, 0.5)'
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
