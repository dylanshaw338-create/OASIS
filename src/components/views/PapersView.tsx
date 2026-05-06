import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ImportedFile } from '../../../electron/preload.d'

export default function PapersView() {
  const [files, setFiles] = useState<ImportedFile[]>([])
  const [loading, setLoading] = useState(true)

  // 初始加载保存的知识库数据
  useEffect(() => {
    const loadKnowledgeBase = async () => {
      try {
        const data = await window.electronAPI.data.read('knowledge_base.json')
        if (data && Array.isArray(data)) {
          setFiles(data)
        }
      } catch (err) {
        console.error('Failed to load knowledge base:', err)
      } finally {
        setLoading(false)
      }
    }
    loadKnowledgeBase()
  }, [])

  // 处理导入文件
  const handleImport = async () => {
    try {
      const imported = await window.electronAPI.knowledge.importFile()
      if (imported && imported.length > 0) {
        const newFiles = [...imported, ...files]
        setFiles(newFiles)
        // 保存到 JSON
        await window.electronAPI.data.write('knowledge_base.json', newFiles)
      }
    } catch (err) {
      console.error('Import failed:', err)
    }
  }

  // 格式化文件大小
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="w-full h-full flex flex-col p-12 text-white">
      {/* 头部区 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 style={{ fontSize: '1.2rem', letterSpacing: '0.15em', fontWeight: 300, color: 'rgba(147, 197, 253, 0.9)' }}>
            KNOWLEDGE BASE
          </h2>
          <p style={{ fontSize: '0.6rem', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)', marginTop: '0.5rem' }}>
            本地论文与文档收藏
          </p>
        </div>
        <button
          onClick={handleImport}
          style={{
            background: 'rgba(147, 197, 253, 0.1)',
            border: '1px solid rgba(147, 197, 253, 0.2)',
            padding: '0.5rem 1.2rem',
            fontSize: '0.7rem',
            letterSpacing: '0.1em',
            color: 'rgba(147, 197, 253, 0.9)',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            borderRadius: '2px'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(147, 197, 253, 0.2)'
            e.currentTarget.style.borderColor = 'rgba(147, 197, 253, 0.4)'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(147, 197, 253, 0.1)'
            e.currentTarget.style.borderColor = 'rgba(147, 197, 253, 0.2)'
          }}
        >
          + IMPORT FILE
        </button>
      </div>

      {/* 列表区 */}
      <div className="flex-1 overflow-y-auto pr-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.2em' }}>LOADING...</span>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 opacity-40">
            <p style={{ fontSize: '0.8rem', letterSpacing: '0.2em', color: 'rgba(147, 197, 253, 0.8)', fontWeight: 300 }}>
              NO DOCUMENTS
            </p>
            <p style={{ fontSize: '0.6rem', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)' }}>
              点击右上角导入文件到本地知识库
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {files.map((file, index) => (
              <motion.div
                key={file.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                className="flex items-center justify-between p-4"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: '4px'
                }}
              >
                <div className="flex items-center gap-4">
                  {/* 类型图标占位 */}
                  <div style={{
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(147, 197, 253, 0.1)',
                    color: 'rgba(147, 197, 253, 0.8)',
                    fontSize: '0.5rem',
                    fontWeight: 600,
                    borderRadius: '2px',
                    textTransform: 'uppercase'
                  }}>
                    {file.type || 'FILE'}
                  </div>
                  
                  <div className="flex flex-col gap-1">
                    <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.9)', fontWeight: 300 }}>
                      {file.name}
                    </span>
                    <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.05em' }}>
                      {new Date(file.importedAt).toLocaleString()} · {formatSize(file.size)}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)' }}>
                  LOCAL COPY
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
