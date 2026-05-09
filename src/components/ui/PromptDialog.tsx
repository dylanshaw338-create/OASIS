import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface PromptDialogProps {
  isOpen: boolean
  title: string
  defaultValue?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

export default function PromptDialog({
  isOpen,
  title,
  defaultValue = '',
  onConfirm,
  onCancel
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  // 只在打开时初始化一次 value，移除 defaultValue 依赖，防止输入时被意外重置
  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue)
      // 延迟聚焦并全选文本，确保弹窗动画完成后获得焦点
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          inputRef.current.select()
        }
      }, 100)
    }
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return
      e.stopPropagation() // 阻止快捷键穿透
      if (e.key === 'Escape') {
        onCancel()
      } else if (e.key === 'Enter') {
        onConfirm(value)
      }
    }
    // 使用捕获阶段，确保弹窗优先处理键盘事件
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, value, onConfirm, onCancel])

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            WebkitAppRegion: 'no-drag' // 解决 Electron 拖拽区域无法点击的 Bug
          }}
          onMouseDown={(e) => e.stopPropagation()} // 防止父级元素的 preventDefault 导致无法聚焦
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: '320px',
              background: 'rgba(15, 20, 35, 0.85)',
              border: '1px solid rgba(147, 197, 253, 0.2)',
              borderRadius: '12px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.05)',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              WebkitAppRegion: 'no-drag',
              pointerEvents: 'auto'
            }}
          >
            <h3 style={{ margin: 0, color: 'rgba(255,255,255,0.9)', fontSize: '0.9rem', fontWeight: 400, letterSpacing: '0.05em' }}>
              {title}
            </h3>
            
            <input
              ref={inputRef}
              type="text"
              value={value}
              autoFocus
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()} // 防止按键穿透
              onMouseDown={(e) => e.stopPropagation()} // 防止父级抢夺焦点
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid rgba(147, 197, 253, 0.15)',
                borderRadius: '6px',
                padding: '0.6rem 0.8rem',
                color: 'rgba(255,255,255,0.95)',
                fontSize: '0.85rem',
                outline: 'none',
                transition: 'border-color 0.2s',
                userSelect: 'text',
                WebkitUserSelect: 'text', // 解决 Electron 中无法选中和无光标的 Bug
                WebkitAppRegion: 'no-drag',
                pointerEvents: 'auto'
              }}
              onFocus={(e) => e.target.style.borderColor = 'rgba(147, 197, 253, 0.5)'}
              onBlur={(e) => e.target.style.borderColor = 'rgba(147, 197, 253, 0.15)'}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                onClick={onCancel}
                style={{
                  padding: '0.4rem 1rem',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  color: 'rgba(255,255,255,0.6)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.9)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
              >
                取消
              </button>
              <button
                onClick={() => onConfirm(value)}
                style={{
                  padding: '0.4rem 1rem',
                  background: 'rgba(147, 197, 253, 0.15)',
                  border: '1px solid rgba(147, 197, 253, 0.3)',
                  borderRadius: '6px',
                  color: 'rgba(147, 197, 253, 0.9)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(147, 197, 253, 0.25)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(147, 197, 253, 0.15)' }}
              >
                确认
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
