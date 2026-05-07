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
        {/* 粒子背景 */}
        <ParticleCanvas opacity={0.6} particleCount={100} />

        {/* 中央径向光晕 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(30, 58, 138, 0.2) 0%, transparent 80%)'
          }}
        />
      </motion.div>

      {/* 边缘暗角 */}
      <div className="vignette" />

      {/* 主内容区 */}
      <div className="relative z-10 flex flex-col items-center justify-center w-full h-full">
        {/* 顶部细线 */}
        <motion.div
          className="absolute top-0 left-0 h-px bg-blue-500/20"
          initial={{ width: 0 }}
          animate={{ width: '100%' }}
          transition={{ duration: 2.5, ease: 'easeInOut', delay: 0.5 }}
        />

        {/* 标题区 */}
        <div className="flex flex-col items-center gap-6">
          {/* 主标题：逐字显现 */}
          <div
            className="overflow-hidden"
            style={{
              fontSize: 'clamp(3rem, 8vw, 7rem)',
              fontWeight: 200,
              letterSpacing: '0.4em',
              color: '#ffffff',
              fontFamily: "'SF Pro Display', 'Inter', system-ui",
              textShadow: '0 0 40px rgba(147, 197, 253, 0.6), 0 0 10px rgba(255, 255, 255, 0.4)'
            }}
          >
            {TITLE.split('').map((char, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
                animate={i < charIndex ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: 20, filter: 'blur(8px)' }}
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                style={{ display: 'inline-block' }}
              >
                {char === ' ' ? '\u00A0' : char}
              </motion.span>
            ))}
          </div>

          {/* 分隔线：标题显示完后出现 */}
          <AnimatePresence>
            {charIndex === TITLE.length && (
              <motion.div
                className="h-px bg-blue-400/30"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: '100%', opacity: 1 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                style={{ maxWidth: '20rem' }}
              />
            )}
          </AnimatePresence>

          {/* 副标题 */}
          <AnimatePresence>
            {charIndex === TITLE.length && (
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.3 }}
                style={{
                  fontSize: '0.75rem',
                  letterSpacing: '0.25em',
                  color: 'rgba(147, 197, 253, 0.5)',
                  fontWeight: 300
                }}
              >
                {SUBTITLE.toUpperCase()}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* 底部提示：呼吸灯 */}
        <AnimatePresence>
          {phase === 'ready' && (
            <motion.div
              className="absolute bottom-16 flex flex-col items-center gap-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1 }}
            >
              <motion.p
                animate={{ opacity: [0.2, 0.6, 0.2] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  fontSize: '0.65rem',
                  letterSpacing: '0.3em',
                  color: 'rgba(255,255,255,0.4)',
                  fontWeight: 300
                }}
              >
                PRESS ANY KEY TO ENTER
              </motion.p>
              <motion.p
                animate={{ opacity: [0.1, 0.3, 0.1] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                style={{
                  fontSize: '0.55rem',
                  letterSpacing: '0.2em',
                  color: 'rgba(255,255,255,0.2)',
                  fontWeight: 300
                }}
              >
                ESC TO EXIT
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 底部细线 */}
      <motion.div
        className="absolute bottom-0 left-0 h-px bg-blue-500/20"
        initial={{ width: 0 }}
        animate={{ width: '100%' }}
        transition={{ duration: 2.5, ease: 'easeInOut', delay: 0.5 }}
      />
    </div>
  )
}
