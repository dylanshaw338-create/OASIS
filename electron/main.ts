import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, basename, extname } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync } from 'fs'
import crypto from 'crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true,
    frame: false,
    backgroundColor: '#000000',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // 窗口准备好后再显示，避免白屏闪烁
  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.futurehci.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC：退出应用
  ipcMain.on('quit-app', () => {
    app.quit()
  })

  // IPC：读取数据文件
  ipcMain.handle('data:read', (_event, filename: string) => {
    try {
      const dataDir = join(app.getPath('userData'), 'data')
      const filePath = join(dataDir, filename)
      if (!existsSync(filePath)) return null
      return JSON.parse(readFileSync(filePath, 'utf-8'))
    } catch (e) {
      console.error('[data:read]', e)
      return null
    }
  })

  // IPC：写入数据文件
  ipcMain.handle('data:write', (_event, filename: string, data: unknown) => {
    try {
      const dataDir = join(app.getPath('userData'), 'data')
      if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
      writeFileSync(join(dataDir, filename), JSON.stringify(data, null, 2), 'utf-8')
    } catch (e) {
      console.error('[data:write]', e)
    }
  })

  // IPC：导入知识库文件
  ipcMain.handle('knowledge:import', async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '导入知识库文件',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: '文档', extensions: ['pdf', 'md', 'txt', 'doc', 'docx', 'csv'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })

      if (canceled || filePaths.length === 0) return null

      const kbDir = join(app.getPath('userData'), 'knowledge_base')
      if (!existsSync(kbDir)) mkdirSync(kbDir, { recursive: true })

      const importedFiles = filePaths.map(filePath => {
        const name = basename(filePath)
        const destPath = join(kbDir, name)
        
        // 避免覆盖同名文件，如果存在则添加时间戳
        let finalDestPath = destPath
        let finalName = name
        if (existsSync(destPath)) {
          const ext = extname(name)
          const base = basename(name, ext)
          finalName = `${base}_${Date.now()}${ext}`
          finalDestPath = join(kbDir, finalName)
        }

        copyFileSync(filePath, finalDestPath)
        const stats = statSync(finalDestPath)

        return {
          id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
          name: finalName,
          originalPath: filePath,
          localPath: finalDestPath,
          size: stats.size,
          type: extname(finalName).substring(1) || 'unknown',
          importedAt: Date.now()
        }
      })

      return importedFiles
    } catch (e) {
      console.error('[knowledge:import]', e)
      return null
    }
  })

  // IPC：AI 聊天通信 (MiniMax 代理)
  ipcMain.handle('ai:chat', async (_event, config, messages) => {
    const { apiKey, model } = config
    try {
      // 增加超时控制
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000) // 60s 超时

      // https://api.minimax.chat/v1/text/chatcompletion_v2
      const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model || 'abab6.5s-chat',
          messages: messages,
          max_tokens: 4096, // 4. 解除字数截断限制
          tools: [
            {
              type: 'web_search'
            }
          ]
        }),
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      let data
      try {
        data = await response.json()
      } catch (jsonErr) {
        throw new Error('API 返回了非法的 JSON 格式。可能是网络代理问题或服务端错误。')
      }

      if (!response.ok || (data?.base_resp && data.base_resp.status_code !== 0)) {
        throw new Error(data?.base_resp?.status_msg || `HTTP Error: ${response.status}`)
      }
      return data
    } catch (e: any) {
      console.error('[ai:chat]', e)
      throw e
    }
  })

  createWindow()
  createDesktopShortcut()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 桌面快捷方式（仅 Windows）
function createDesktopShortcut(): void {
  if (process.platform !== 'win32') return

  const desktopPath = app.getPath('desktop')
  const shortcutPath = join(desktopPath, 'Future HCI.lnk')

  if (existsSync(shortcutPath)) return

  if (is.dev) {
    // 开发模式：快捷方式指向 start-dev.bat
    const projectRoot = process.cwd()
    const batPath = join(projectRoot, 'start-dev.bat')
    shell.writeShortcutLink(shortcutPath, {
      target: batPath,
      workingDirectory: projectRoot,
      description: 'Future HCI Research System (Dev)'
    })
  } else {
    // 生产模式：快捷方式指向 exe
    shell.writeShortcutLink(shortcutPath, {
      target: process.execPath,
      description: 'Future HCI Research System'
    })
  }
}
