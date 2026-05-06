import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import SplashScreen from './components/SplashScreen'
import ExitDialog from './components/ExitDialog'
import MainWorkspace from './components/MainWorkspace'

type AppState = 'splash' | 'transitioning' | 'main'

export default function App() {
  const [appState, setAppState] = useState<AppState>('splash')
  const [showExitDialog, setShowExitDialog] = useState(false)

  const handleEnter = () => {
    setAppState('transitioning')
    setTimeout(() => setAppState('main'), 800)
  }

  const handleEscapeRequest = () => {
    setShowExitDialog(true)
  }

  const handleExitConfirm = () => {
    window.electronAPI.quit()
  }

  const handleExitCancel = () => {
    setShowExitDialog(false)
  }

  return (
    <>
      {/* 启动屏 */}
      <AnimatePresence>
        {appState === 'splash' && (
          <motion.div
            key="splash"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            style={{ position: 'fixed', inset: 0, zIndex: 20 }}
          >
            <SplashScreen onEnter={handleEnter} onEscapeRequest={handleEscapeRequest} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 黑屏过渡仪式 */}
      <AnimatePresence>
        {appState === 'transitioning' && (
          <motion.div
            key="blackout"
            className="fixed inset-0 bg-black"
            style={{ zIndex: 30 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          />
        )}
      </AnimatePresence>

      {/* 主界面 */}
      <AnimatePresence>
        {appState === 'main' && (
          <motion.div
            key="main"
            style={{ position: 'fixed', inset: 0, zIndex: 10 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            <MainWorkspace onEscapeRequest={handleEscapeRequest} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 退出弹窗（全局浮层） */}
      <ExitDialog
        visible={showExitDialog}
        onConfirm={handleExitConfirm}
        onCancel={handleExitCancel}
      />
    </>
  )
}
