import { motion } from 'framer-motion'

interface AISummonStarProps {
  onClick: () => void
}

export default function AISummonStar({ onClick }: AISummonStarProps) {
  return (
    <motion.div
      className="fixed right-16 top-1/2 -translate-y-1/2 z-40 cursor-pointer"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1.5, ease: 'easeOut' }}
      onClick={onClick}
      whileHover="hover"
      style={{
        width: '80px',
        height: '80px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {/* 外层引力波纹 (Hover 放大) */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(147, 197, 253, 0.1) 0%, transparent 70%)',
          border: '1px solid rgba(147, 197, 253, 0.05)'
        }}
        variants={{
          hover: { scale: 1.5, opacity: 0.8, rotate: 90, transition: { duration: 0.8, ease: 'easeOut' } }
        }}
      />

      {/* 呼吸光晕 */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '40px',
          height: '40px',
          background: 'radial-gradient(circle, rgba(219, 234, 254, 0.4) 0%, rgba(147, 197, 253, 0.1) 50%, transparent 80%)',
          filter: 'blur(4px)'
        }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* 核心高亮恒星 */}
      <motion.div
        className="relative rounded-full bg-white"
        style={{
          width: '6px',
          height: '6px',
          boxShadow: '0 0 15px 4px rgba(255, 255, 255, 0.8), 0 0 30px 8px rgba(147, 197, 253, 0.6)'
        }}
        variants={{
          hover: { scale: 1.8, boxShadow: '0 0 25px 8px rgba(255, 255, 255, 1), 0 0 45px 12px rgba(147, 197, 253, 0.9)' }
        }}
      />
    </motion.div>
  )
}
