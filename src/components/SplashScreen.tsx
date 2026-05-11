import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ParticleCanvas from './ParticleCanvas'

interface SplashScreenProps {
  onEnter: () => void
  onEscapeRequest: () => void
}

const TITLE = 'FUTURE HCI'
const SUBTITLE = 'Human-Computer Interaction Research System'

export default function SplashScreen({ onEnter, onEscapeRequest }: SplashScreenProps) {
  const [phase, setPhase] = useState<'intro' | 'ready'>('intro')
  const [charIndex, setCharIndex] = useState(0)

  // 字符逐个显现
  useEffect(() => {
    if (charIndex < TITLE.length) {
      const t = setTimeout(
        () => setCharIndex((i) => i + 1),
        TITLE[charIndex] === ' ' ? 60 : 120
      )
      return () => clearTimeout(t)
    } else {
      const t = setTimeout(() => setPhase('ready'), 600)
      return () => clearTimeout(t)
    }
  }, [charIndex])

  // 键盘监听：任意键进入，ESC 退出
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (phase !== 'ready') return
      if (e.key === 'Escape') {
        onEscapeRequest()
      } else {
        onEnter()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [phase, onEnter, onEscapeRequest])

  // 粒子网格动画由 ParticleCanvas 组件负责

  return (
    <div className="relative w-full h-screen bg-[#030508] overflow-hidden">
      {/* 背景深邃缩放动画 */}
      <motion.div 
        className="absolute inset-0"
        initial={{ scale: 1.05 }}
        animate={{ scale: 1 }}
        transition={{ duration: 10, ease: 'easeOut' }}
      >
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
        
        {/* 全局胶片噪点 */}
        <div className="film-grain" />

        {/* 宏大的流体体积光背景 */}
        <ParticleCanvas opacity={1} />

        {/* 极微弱的赛博扫描线网格 */}
        <div 
          className="absolute inset-0 pointer-events-none" 
          style={{
            background: 'linear-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px)',
            backgroundSize: '100% 4px'
          }} 
        />
      </motion.div>

      {/* 极具压迫感的四周暗角 */}
      <div 
        className="absolute inset-0 pointer-events-none z-10" 
        style={{
          background: 'radial-gradient(circle at center, transparent 20%, rgba(2,3,5,0.8) 70%, #020305 100%)'
        }} 
      />

      {/* 主内容区 */}
      <div className="relative z-20 flex flex-col items-center justify-center w-full h-full">

        {/* 标题区 */}
        <div className="flex flex-col items-center gap-6 mt-[-10vh]">
          {/* 主标题：电影级排版 */}
          <div
            className="overflow-hidden flex"
            style={{
              fontSize: 'clamp(4rem, 10vw, 8rem)',
              fontWeight: 200, 
              letterSpacing: '0.3em',
              color: 'rgba(255, 255, 255, 0.95)',
              fontFamily: '"Georgia", "Times New Roman", serif', // 衬线字体带来强烈的史诗感
              textShadow: '0 0 60px rgba(125, 211, 252, 0.4), 0 0 100px rgba(217, 119, 6, 0.15)' // 淡冰蓝 & Amber 光晕
            }}
          >
            {TITLE.split('').map((char, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 15, filter: 'blur(16px)', scale: 1.05 }}
                animate={i < charIndex ? { opacity: 1, y: 0, filter: 'blur(0px)', scale: 1 } : { opacity: 0, y: 15, filter: 'blur(16px)', scale: 1.05 }}
                transition={{ duration: 2.2, ease: [0.16, 1, 0.3, 1] }}
                style={{ display: 'inline-block', marginRight: char === ' ' ? '2rem' : '0' }}
              >
                {char === ' ' ? '' : char}
              </motion.span>
            ))}
          </div>

          {/* 副标题：极小无衬线体对比 */}
          <AnimatePresence>
            {charIndex === TITLE.length && (
              <motion.p
                initial={{ opacity: 0, y: 5, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 1.6, delay: 0.8, ease: 'easeOut' }}
                style={{
                  fontSize: '0.65rem',
                  letterSpacing: '0.5em',
                  color: 'rgba(255, 255, 255, 0.3)',
                  fontWeight: 300,
                  fontFamily: "'SF Pro Display', Inter, sans-serif",
                  textTransform: 'uppercase'
                }}
              >
                {SUBTITLE}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

      {/* 底部提示：呼吸灯 */}
      <AnimatePresence>
        {phase === 'ready' && (
          <motion.div
            className="absolute bottom-16 flex flex-col items-center gap-4 z-20 w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5 }}
          >
            <motion.p
              animate={{ opacity: [0.15, 0.5, 0.15] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                fontSize: '0.65rem',
                letterSpacing: '0.4em',
                color: 'rgba(255, 255, 255, 0.5)',
                fontWeight: 300,
                fontFamily: "'SF Pro Display', Inter, sans-serif"
              }}
            >
              PRESS ANY KEY TO ENTER
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  )
}
