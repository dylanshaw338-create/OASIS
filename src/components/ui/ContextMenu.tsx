import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export interface MenuItem {
  label: string
  onClick: () => void
  danger?: boolean
}

export interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Use setTimeout to avoid immediately closing if triggered by a click
    setTimeout(() => {
      window.addEventListener('click', handleClickOutside)
      window.addEventListener('contextmenu', handleClickOutside)
    }, 10)

    return () => {
      window.removeEventListener('click', handleClickOutside)
      window.removeEventListener('contextmenu', handleClickOutside)
    }
  }, [onClose])

  // Adjust position if it goes off screen
  const menuWidth = 160
  const menuHeight = items.length * 36 + 16 // approx
  
  let adjustedX = x
  let adjustedY = y
  
  if (typeof window !== 'undefined') {
    if (x + menuWidth > window.innerWidth) {
      adjustedX = window.innerWidth - menuWidth - 8
    }
    if (y + menuHeight > window.innerHeight) {
      adjustedY = window.innerHeight - menuHeight - 8
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        style={{
          position: 'fixed',
          left: adjustedX,
          top: adjustedY,
          width: `${menuWidth}px`,
          background: 'rgba(20, 30, 50, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(147, 197, 253, 0.15)',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.05)',
          padding: '8px 0',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column'
        }}
        onContextMenu={(e) => e.preventDefault()} // Prevent default menu over this menu
      >
        {items.map((item, idx) => (
          <button
            key={idx}
            onClick={(e) => {
              e.stopPropagation()
              item.onClick()
              onClose()
            }}
            style={{
              width: '100%',
              padding: '8px 16px',
              background: 'transparent',
              border: 'none',
              textAlign: 'left',
              color: item.danger ? 'rgba(239, 68, 68, 0.8)' : 'rgba(255,255,255,0.85)',
              fontSize: '0.65rem',
              letterSpacing: '0.1em',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = item.danger ? 'rgba(239, 68, 68, 0.1)' : 'rgba(147, 197, 253, 0.15)'
              e.currentTarget.style.color = item.danger ? 'rgba(239, 68, 68, 1)' : 'rgba(255,255,255,1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = item.danger ? 'rgba(239, 68, 68, 0.8)' : 'rgba(255,255,255,0.85)'
            }}
          >
            {item.label}
          </button>
        ))}
      </motion.div>
    </AnimatePresence>
  )
}
