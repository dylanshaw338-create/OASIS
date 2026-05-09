import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ExitDialogProps {
  visible: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ExitDialog({ visible, onConfirm, onCancel }: ExitDialogProps) {
  useEffect(() => {
    if (!visible) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [visible, onConfirm, onCancel])

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* 背景遮罩：极致简洁，纯粹的暗色模糊 */}
          <motion.div
            key="overlay"
            className="fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
            onClick={onCancel}
            translate="no"
            aria-hidden="true"
          />

          {/* 弹窗：深邃黑曜石悬浮质感 */}
            <motion.div
              key="dialog"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.96, x: '-50%', y: 'calc(-50% + 20px)' }}
              animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
              exit={{ opacity: 0, scale: 0.96, x: '-50%', y: 'calc(-50% + 20px)' }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              style={{
                width: '340px',
                background: '#121620', // 与 AI 面板同源的冷调深空色
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '20px',
                boxShadow: '0 30px 60px -15px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)',
                padding: '2rem 2.5rem',
                position: 'fixed',
                top: '50%',
                left: '50%',
                zIndex: 51,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center'
              }}
            >
              {/* 顶部图标：休眠/断开隐喻 */}
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.03)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1.5rem',
                color: 'rgba(255,255,255,0.6)'
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                  <line x1="12" y1="2" x2="12" y2="12"></line>
                </svg>
              </div>

              {/* 标题 */}
              <h2
                style={{
                  fontSize: '1.15rem',
                  color: 'rgba(255, 255, 255, 0.95)',
                  fontWeight: 400,
                  letterSpacing: '0.02em',
                  margin: '0 0 0.5rem 0'
                }}
              >
                离开这个宇宙？
              </h2>

              {/* 副标题 */}
              <p
                style={{
                  fontSize: '0.75rem',
                  color: 'rgba(255, 255, 255, 0.4)',
                  fontWeight: 300,
                  lineHeight: 1.6,
                  margin: '0 0 2rem 0'
                }}
              >
                神经连接即将断开<br/>所有思绪已锚定在本地锚点
              </p>

              {/* 按钮区 */}
              <div style={{ display: 'flex', gap: '1rem', width: '100%', justifyContent: 'center' }}>
                <DialogButton onClick={onCancel} variant="ghost">
                  CANCEL
                </DialogButton>
                <DialogButton onClick={onConfirm} variant="danger">
                  DISCONNECT
                </DialogButton>
              </div>

              {/* 键盘提示 */}
              <p
                style={{
                  marginTop: '1.5rem',
                  fontSize: '0.5rem',
                  letterSpacing: '0.15em',
                  color: 'rgba(255, 255, 255, 0.2)',
                }}
              >
                ESC 取消 &nbsp;·&nbsp; ENTER 确认
              </p>
            </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ——— 按钮子组件 ———
function DialogButton({
  onClick,
  variant,
  children
}: {
  onClick: () => void
  variant: 'ghost' | 'danger'
  children: React.ReactNode
}) {
  const base: React.CSSProperties = {
    padding: '0.6rem 1.8rem',
    fontSize: '0.75rem',
    letterSpacing: '0.1em',
    fontWeight: 500,
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    border: 'none',
    outline: 'none'
  }

  const styles: Record<string, React.CSSProperties> = {
    ghost: {
      ...base,
      background: 'transparent',
      color: 'rgba(255, 255, 255, 0.6)',
    },
    danger: {
      ...base,
      background: 'rgba(239, 68, 68, 0.15)',
      color: 'rgba(239, 68, 68, 0.9)',
      border: '1px solid rgba(239, 68, 68, 0.2)',
    }
  }

  const hover: Record<string, Partial<React.CSSProperties>> = {
    ghost: { 
      background: 'rgba(255, 255, 255, 0.05)',
      color: 'rgba(255, 255, 255, 0.95)' 
    },
    danger: {
      background: 'rgba(239, 68, 68, 0.25)',
      color: 'rgba(239, 68, 68, 1)',
      border: '1px solid rgba(239, 68, 68, 0.4)',
      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)'
    }
  }

  return (
    <button
      onClick={onClick}
      style={styles[variant]}
      onMouseEnter={(e) => Object.assign(e.currentTarget.style, hover[variant])}
      onMouseLeave={(e) => Object.assign(e.currentTarget.style, styles[variant])}
    >
      {children}
    </button>
  )
}
