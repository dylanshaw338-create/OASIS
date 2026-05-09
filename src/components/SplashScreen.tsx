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
        {/* 宏大的极缓星云漂移背景 */}
        <motion.div
          className="absolute inset-0 pointer-events-none opacity-50"
          animate={{
            backgroundPosition: ['0% 0%', '100% 100%', '0% 0%']
          }}
          transition={{ duration: 120, repeat: Infinity, ease: 'linear' }}
          style={{
            background: `
              radial-gradient(circle at 20% 30%, rgba(30, 58, 138, 0.2) 0%, transparent 50%),
              radial-gradient(circle at 80% 70%, rgba(139, 92, 246, 0.15) 0%, transparent 50%)
            `,
            backgroundSize: '200% 200%'
          }}
        />

        {/* 粒子背景 (与主程序对齐的深空静谧星空) */}
        <ParticleCanvas opacity={0.7} particleCount={180} />

        {/* 极微弱的赛博扫描线网格 */}
        <div 
          className="absolute inset-0 pointer-events-none" 
          style={{
            background: 'linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px)',
            backgroundSize: '100% 4px'
          }} 
        />

        {/* 多层深渊聚光灯光晕 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse 40% 30% at 50% 50%, rgba(96, 165, 250, 0.08) 0%, transparent 100%),
              radial-gradient(circle 80% at 50% 50%, rgba(30, 58, 138, 0.15) 0%, transparent 100%)
            `
          }}
        />
      </motion.div>

      {/* 极具压迫感的四周暗角 */}
      <div 
        className="absolute inset-0 pointer-events-none z-10" 
        style={{
          background: 'radial-gradient(circle at center, transparent 30%, rgba(3,5,8,0.7) 70%, rgba(0,0,0,0.95) 100%)'
        }} 
      />

      {/* 主内容区 */}
      <div className="relative z-20 flex flex-col items-center justify-center w-full h-full">
        {/* 顶部细线 */}
        <motion.div
          className="absolute top-0 left-0 h-px bg-blue-500/10"
          initial={{ width: 0 }}
          animate={{ width: '100%' }}
          transition={{ duration: 2.5, ease: 'easeInOut', delay: 0.5 }}
        />

        {/* 标题区 */}
        <div className="flex flex-col items-center gap-6 mt-[-10vh]">
          {/* 主标题：逐字高斯模糊显现 */}
          <div
            className="overflow-hidden flex"
            style={{
              fontSize: 'clamp(3rem, 7vw, 6rem)',
              fontWeight: 100, // 极细字体，增加高级感
              letterSpacing: '0.45em',
              color: '#ffffff',
              fontFamily: "'SF Pro Display', 'Inter', system-ui",
              textShadow: '0 0 40px rgba(96, 165, 250, 0.4), 0 0 80px rgba(139, 92, 246, 0.2)' // 蓝紫双重光晕
            }}
          >
            {TITLE.split('').map((char, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 10, filter: 'blur(12px)', scale: 1.1 }}
                animate={i < charIndex ? { opacity: 1, y: 0, filter: 'blur(0px)', scale: 1 } : { opacity: 0, y: 10, filter: 'blur(12px)', scale: 1.1 }}
                transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
                style={{ display: 'inline-block', marginRight: char === ' ' ? '1rem' : '0' }}
              >
                {char === ' ' ? '' : char}
              </motion.span>
            ))}
          </div>

          {/* 分隔线：带中心节点的展开动画 */}
          <AnimatePresence>
            {charIndex === TITLE.length && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8 }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '24rem', maxWidth: '80%' }}
              >
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 1.2, ease: 'easeInOut' }}
                  style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(147, 197, 253, 0.4))', transformOrigin: 'right' }}
                />
                <motion.div
                  initial={{ scale: 0, rotate: 45 }}
                  animate={{ scale: 1, rotate: 45 }}
                  transition={{ duration: 0.5, delay: 0.6 }}
                  style={{ width: '4px', height: '4px', background: 'rgba(255,255,255,0.8)', boxShadow: '0 0 10px rgba(147, 197, 253, 0.8)' }}
                />
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 1.2, ease: 'easeInOut' }}
                  style={{ flex: 1, height: '1px', background: 'linear-gradient(270deg, transparent, rgba(147, 197, 253, 0.4))', transformOrigin: 'left' }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* 副标题 */}
          <AnimatePresence>
            {charIndex === TITLE.length && (
              <motion.p
                initial={{ opacity: 0, y: 5, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 1.2, delay: 0.5, ease: 'easeOut' }}
                style={{
                  fontSize: '0.65rem',
                  letterSpacing: '0.4em',
                  color: 'rgba(255, 255, 255, 0.3)',
                  fontWeight: 300,
                  textShadow: '0 0 10px rgba(255,255,255,0.1)'
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
