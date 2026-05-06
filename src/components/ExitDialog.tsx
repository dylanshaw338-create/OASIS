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
          {/* 蒙层：点击外部取消 */}
          <motion.div
            key="overlay"
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(12px)' }}
            onClick={onCancel}
          >
            {/* 弹窗：阻止点击穿透 */}
            <motion.div
              key="dialog"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              style={{
                width: '26rem',
                background: 'rgba(4, 8, 20, 0.97)',
                border: '1px solid rgba(200, 228, 252, 0.12)',
                boxShadow: '0 0 60px rgba(180, 215, 245, 0.06), 0 0 0 1px rgba(200, 228, 252, 0.04)',
                padding: '2.5rem 2.5rem 2rem'
              }}
            >
              {/* 顶部标识线 */}
              <div
                style={{
                  width: '2rem',
                  height: '1px',
                  background: 'rgba(210, 235, 255, 0.35)',
                  marginBottom: '1.75rem'
                }}
              />

              {/* 标题 */}
              <p
                style={{
                  fontSize: '0.55rem',
                  letterSpacing: '0.35em',
                  color: 'rgba(200, 228, 252, 0.35)',
                  fontWeight: 300,
                  marginBottom: '1rem'
                }}
              >
                CONFIRM EXIT
              </p>

              {/* 主文本 */}
              <p
                style={{
                  fontSize: '1.05rem',
                  color: 'rgba(255, 255, 255, 0.82)',
                  fontWeight: 300,
                  lineHeight: 1.5,
                  letterSpacing: '0.01em',
                  marginBottom: '2.25rem'
                }}
              >
                离开这个宇宙？
              </p>

              {/* 按钮区 */}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <DialogButton onClick={onCancel} variant="ghost">
                  CANCEL
                </DialogButton>
                <DialogButton onClick={onConfirm} variant="danger">
                  EXIT
                </DialogButton>
              </div>

              {/* 键盘提示 */}
              <p
                style={{
                  marginTop: '1.75rem',
                  fontSize: '0.5rem',
                  letterSpacing: '0.25em',
                  color: 'rgba(255, 255, 255, 0.12)',
                  textAlign: 'right'
                }}
              >
                ESC · CANCEL &nbsp;&nbsp; ENTER · CONFIRM
              </p>
            </motion.div>
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
    padding: '0.5rem 1.4rem',
    fontSize: '0.62rem',
    letterSpacing: '0.2em',
    fontWeight: 300,
    border: '1px solid',
    cursor: 'pointer',
    transition: 'all 0.18s ease',
    background: 'transparent'
  }

  const styles: Record<string, React.CSSProperties> = {
    ghost: {
      ...base,
      color: 'rgba(255, 255, 255, 0.35)',
      borderColor: 'rgba(255, 255, 255, 0.1)'
    },
    danger: {
      ...base,
      color: 'rgba(210, 235, 255, 0.7)',
      borderColor: 'rgba(200, 228, 252, 0.18)'
    }
  }

  const hover: Record<string, Partial<React.CSSProperties>> = {
    ghost: { color: 'rgba(255,255,255,0.65)', borderColor: 'rgba(255,255,255,0.22)' },
    danger: {
      color: 'rgba(220, 240, 255, 0.92)',
      borderColor: 'rgba(200, 228, 252, 0.35)',
      background: 'rgba(180, 215, 245, 0.06)',
      boxShadow: '0 0 12px rgba(200, 228, 252, 0.06)'
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
