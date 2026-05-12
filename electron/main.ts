import { app, shell, BrowserWindow, ipcMain, dialog, protocol, net, session } from 'electron'
import { join, basename, extname } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync } from 'fs'
import crypto from 'crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

// 修复：由于 pdf-parse 2.4.x 的 API 变更，我们需要引入 PDFParse 类
const { PDFParse } = require('pdf-parse')

// 在 app.whenReady() 之前注册自定义协议特权
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true } }
])

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
      sandbox: false,
      webSecurity: false // 允许 iframe 读取本地 file:// 协议文件
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

  // 注册 local-file:// 协议以支持渲染进程加载本地 PDF 等文件
  protocol.handle('local-file', (request) => {
    // 处理带参数或哈希的 URL，只取真正的路径部分
    const url = request.url.replace('local-file://', '').split('?')[0].split('#')[0]
    const decodedPath = decodeURIComponent(url)
    if (process.platform === 'win32') {
      // 移除前导斜杠 (e.g. /C:/path -> C:/path)
      return net.fetch('file://' + decodedPath.replace(/^\//, ''))
    }
    return net.fetch('file://' + decodedPath)
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 核心特性：针对 WebVPN 独立会话配置“下载拦截与自动入库”
  const vpnSession = session.fromPartition('persist:ruc-webvpn')
  vpnSession.on('will-download', async (event, item, webContents) => {
    const isPdf = item.getMimeType() === 'application/pdf' || item.getFilename().toLowerCase().endsWith('.pdf')
    
    if (isPdf) {
      console.log('Intercepted PDF download from WebVPN:', item.getFilename())
      
      const kbDir = join(app.getPath('userData'), 'knowledge_base')
      if (!existsSync(kbDir)) mkdirSync(kbDir, { recursive: true })

      const originalFilename = item.getFilename()
      let finalName = originalFilename
      let destPath = join(kbDir, finalName)

      if (existsSync(destPath)) {
        const ext = extname(finalName)
        const base = basename(finalName, ext)
        finalName = `${base}_${Date.now()}${ext}`
        destPath = join(kbDir, finalName)
      }

      // 覆盖系统默认下载行为，静默保存到我们的知识库目录
      item.setSavePath(destPath)

      item.once('done', async (event, state) => {
        if (state === 'completed') {
          console.log('Download completed:', destPath)
          const stats = statSync(destPath)
          let extractedTitle = basename(finalName, extname(finalName))
          let extractedAuthors: string[] = []

          // 自动提取元数据
          try {
            const dataBuffer = readFileSync(destPath)
            const { PDFParse } = require('pdf-parse')
            const parser = new PDFParse({ data: dataBuffer })
            const parsed = await parser.getInfo()
            if (parsed.info) {
              if (parsed.info.Title && parsed.info.Title.trim() !== '') {
                extractedTitle = parsed.info.Title.trim()
              }
              if (parsed.info.Author && parsed.info.Author.trim() !== '') {
                extractedAuthors = parsed.info.Author.split(/[,;]/).map((a: string) => a.trim()).filter((a: string) => a)
              }
            }
            await parser.destroy()
          } catch (e) {
            console.error('Failed to extract metadata from downloaded PDF', e)
          }

          const newPaper = {
            id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
            name: finalName,
            originalPath: item.getURL(),
            localPath: destPath,
            size: stats.size,
            type: 'pdf',
            importedAt: Date.now(),
            title: extractedTitle,
            authors: extractedAuthors,
            tags: ['WebVPN', 'Auto-Downloaded'],
            abstract: '',
            userNotes: '',
            aiSummary: ''
          }

          // 将新论文广播给所有渲染进程窗口
          BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('knowledge:download-complete', newPaper)
          })
        } else {
          console.log(`Download failed: ${state}`)
        }
      })
    }
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

      // 由于需要异步解析 PDF 提取元信息，这里使用 Promise.all
      const importedFiles = await Promise.all(filePaths.map(async (filePath) => {
        const name = basename(filePath)
        const destPath = join(kbDir, name)
        
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

        // 尝试自动提取元信息
        let extractedTitle = basename(finalName, extname(finalName))
        let extractedAuthors: string[] = []

        if (extname(finalName).toLowerCase() === '.pdf') {
          try {
            const dataBuffer = readFileSync(finalDestPath)
            const parser = new PDFParse({ data: dataBuffer })
            const parsed = await parser.getInfo()
            // 尝试从 PDF metadata 中提取
            if (parsed.info) {
              if (parsed.info.Title && parsed.info.Title.trim() !== '') {
                extractedTitle = parsed.info.Title.trim()
              }
              if (parsed.info.Author && parsed.info.Author.trim() !== '') {
                // 有些作者是用逗号或分号隔开的
                extractedAuthors = parsed.info.Author.split(/[,;]/).map((a: string) => a.trim()).filter((a: string) => a)
              }
            }
            await parser.destroy()
          } catch (e) {
            console.error('Failed to extract metadata from PDF', e)
          }
        }

        return {
          id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
          name: finalName,
          originalPath: filePath,
          localPath: finalDestPath, // ⚠️ Chromium 内置 PDF 阅读器需要绝对路径
          size: stats.size,
          type: extname(finalName).substring(1) || 'unknown',
          importedAt: Date.now(),
          title: extractedTitle,
          authors: extractedAuthors,
          tags: [],
          abstract: '',
          userNotes: '',
          aiSummary: ''
        }
      }))

      return importedFiles
    } catch (e) {
      console.error('[knowledge:import]', e)
      return null
    }
  })

  // IPC：解析 PDF 文本
  ipcMain.handle('knowledge:parse-pdf', async (_event, localPath: string) => {
    try {
      if (!existsSync(localPath)) throw new Error('File not found')
      const dataBuffer = readFileSync(localPath)
      const parser = new PDFParse({ data: dataBuffer })
      const textData = await parser.getText()
      await parser.destroy()
      return textData.text || ''
    } catch (err: any) {
      console.error('[knowledge:parse-pdf]', err)
      throw new Error(`PDF 解析失败: ${err.message}`)
    }
  })

  // IPC：连接人大 WebVPN (第一阶段探路)
  ipcMain.handle('knowledge:connect-webvpn', async () => {
    return new Promise((resolve) => {
      // 找到主窗口作为父窗口
      const parentWindow = BrowserWindow.getAllWindows()[0]
      
      const vpnWindow = new BrowserWindow({
        parent: parentWindow,
        modal: true, // 模态窗口
        width: 1000,
        height: 700,
        title: 'RUC WebVPN 登录授权',
        autoHideMenuBar: true,
        backgroundColor: '#f3f4f6',
        webPreferences: {
          partition: 'persist:ruc-webvpn', // 关键：使用持久化的独立分区来保存 Cookie
          nodeIntegration: false,
          contextIsolation: true
        }
      })

      vpnWindow.loadURL('https://webvpn.ruc.edu.cn')

      // 当用户关闭窗口时，我们检查该分区下是否成功获取到了 WebVPN 的 Cookie
      vpnWindow.on('closed', async () => {
        try {
          const ses = session.fromPartition('persist:ruc-webvpn')
          const cookies = await ses.cookies.get({ domain: 'webvpn.ruc.edu.cn' })
          
          // 如果存在 cookie，说明可能已经登录过（后续我们可以根据特定的 session cookie 名称做更精确的校验）
          const hasCookie = cookies.length > 0
          resolve(hasCookie)
        } catch (e) {
          console.error('Failed to get WebVPN cookies:', e)
          resolve(false)
        }
      })
    })
  })

  // IPC：打开 Web of Science 进行检索 (第二阶段)
  ipcMain.handle('knowledge:open-wos', async () => {
    return new Promise((resolve) => {
      const parentWindow = BrowserWindow.getAllWindows()[0]
      const wosWindow = new BrowserWindow({
        parent: parentWindow,
        width: 1400,
        height: 900,
        title: 'Web of Science (via RUC WebVPN)',
        autoHideMenuBar: true,
        backgroundColor: '#f3f4f6',
        webPreferences: {
          partition: 'persist:ruc-webvpn', // 共享相同的 WebVPN 会话
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: false // 关键：关闭 Web 安全校验，防止复杂的 WebVPN 重定向触发 CORS 拦截导致 JSON 解析失败
        }
      })

      // 定义一个递归创建防逃逸窗口的辅助函数
      const createSecureVpnWindow = (targetUrl: string) => {
        const popup = new BrowserWindow({
          parent: parentWindow,
          width: 1200,
          height: 800,
          title: 'Academic Resource (via WebVPN)',
          autoHideMenuBar: true,
          backgroundColor: '#f3f4f6',
          webPreferences: {
            partition: 'persist:ruc-webvpn', // 强制继承 VPN Session
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false // 关键：关闭 Web 安全校验，防止复杂的 WebVPN 重定向触发 CORS 拦截导致 JSON 解析失败
          }
        })
        
        // 递归拦截更深层的弹窗，坚决不让链接逃逸到系统外部浏览器
        popup.webContents.setWindowOpenHandler((innerDetails) => {
          createSecureVpnWindow(innerDetails.url)
          return { action: 'deny' }
        })

        popup.loadURL(targetUrl)
      }

      // 彻底拦截弹窗，改为手动创建新窗口加载目标 URL，解决跨域重定向白屏问题
      wosWindow.webContents.setWindowOpenHandler((details) => {
        createSecureVpnWindow(details.url)
        return { action: 'deny' } // 阻止系统默认弹窗
      })

      // 由于我们无法直接得知 Web of Science 在人大 WebVPN 内部重写后的精确 URL，
      // 我们仍然导航至门户，并在标题上给予用户清晰的指引，让用户点击对应的资源。
      wosWindow.loadURL('https://webvpn.ruc.edu.cn')

      wosWindow.on('closed', () => resolve(true))
    })
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
          ],
          tool_choice: 'auto'
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
