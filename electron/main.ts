import { app, shell, BrowserWindow, ipcMain, dialog, protocol, net, session, safeStorage, clipboard } from 'electron'
import { join, basename, extname } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync } from 'fs'
import crypto from 'crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

import { SemanticScholarService } from './services/semanticScholarService'
import { AiService } from './services/aiService'

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

  // 必须在 app.whenReady() 之后才能安全调用 safeStorage
  // IPC：WebVPN 凭据安全存储 (Phase 1)
  ipcMain.handle('vpn:save-credentials', async (_event, account, password) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        console.warn('System encryption is not available. Saving in plaintext (NOT RECOMMENDED).')
        const dataDir = join(app.getPath('userData'), 'data')
        if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
        writeFileSync(join(dataDir, 'vpn_credentials.json'), JSON.stringify({ account, password }), 'utf-8')
        return true
      }
      
      const encryptedPassword = safeStorage.encryptString(password).toString('base64')
      const data = { account, password: encryptedPassword }
      
      const dataDir = join(app.getPath('userData'), 'data')
      if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
      writeFileSync(join(dataDir, 'vpn_credentials.json'), JSON.stringify(data), 'utf-8')
      return true
    } catch (e) {
      console.error('[vpn:save-credentials]', e)
      return false
    }
  })

  ipcMain.handle('vpn:get-credentials', async () => {
    try {
      const filePath = join(app.getPath('userData'), 'data', 'vpn_credentials.json')
      if (!existsSync(filePath)) return null
      
      const data = JSON.parse(readFileSync(filePath, 'utf-8'))
      if (data && data.account) {
        return { account: data.account }
      }
      return null
    } catch (e) {
      return null
    }
  })

  ipcMain.handle('vpn:clear-credentials', async () => {
    try {
      const filePath = join(app.getPath('userData'), 'data', 'vpn_credentials.json')
      if (existsSync(filePath)) {
        writeFileSync(filePath, JSON.stringify({}), 'utf-8')
      }
      return true
    } catch (e) {
      return false
    }
  })

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
    const filename = item.getFilename();
    const mimeType = item.getMimeType();
    console.log(`\n[WebVPN DOWNLOAD] New download detected!`);
    console.log(`[WebVPN DOWNLOAD] Filename: ${filename}`);
    console.log(`[WebVPN DOWNLOAD] MIME Type: ${mimeType}`);
    console.log(`[WebVPN DOWNLOAD] Source URL: ${item.getURL()}`);

    const isPdf = mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')
    
    if (isPdf) {
      console.log('[WebVPN DOWNLOAD] Identified as PDF, intercepting to knowledge base...')
      
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
          console.log('[WebVPN DOWNLOAD] Completed:', destPath)
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
            console.error('[WebVPN DOWNLOAD] Failed to extract metadata', e)
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
          console.log('[WebVPN DOWNLOAD] Paper successfully imported to knowledge base!')
        } else {
          console.error(`[WebVPN DOWNLOAD] Failed, final state: ${state}`)
        }
      })
    } else {
      console.log(`[WebVPN DOWNLOAD] Not a PDF file (${mimeType}), bypassing interception...`);
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

  // IPC：在系统文件管理器中显示文件
  ipcMain.handle('knowledge:show-in-folder', async (_event, localPath: string) => {
    try {
      if (existsSync(localPath)) {
        shell.showItemInFolder(localPath)
        return true
      }
      return false
    } catch (err) {
      console.error('[knowledge:show-in-folder]', err)
      return false
    }
  })

  // IPC：物理删除论文文件
  ipcMain.handle('knowledge:delete-paper', async (_event, localPath: string) => {
    try {
      if (existsSync(localPath)) {
        const fs = require('fs');
        fs.unlinkSync(localPath);
        return true;
      }
      return true; // 如果文件本来就不存在，也算删除成功
    } catch (err) {
      console.error('[knowledge:delete-paper]', err)
      return false;
    }
  })

  // 全局保存隐藏的 VPN 窗口引用，以便后续提交验证码
  let hiddenVpnWindow: BrowserWindow | null = null

  // IPC：连接人大 WebVPN (自动化登录 - Phase 2)
  ipcMain.handle('knowledge:connect-webvpn', async () => {
    return new Promise(async (resolve) => {
      try {
        const filePath = join(app.getPath('userData'), 'data', 'vpn_credentials.json')
        if (!existsSync(filePath)) {
          console.log('No VPN credentials found, please configure first.')
          return resolve(false)
        }

        const data = JSON.parse(readFileSync(filePath, 'utf-8'))
        if (!data.account || !data.password) return resolve(false)

        let password = data.password
        if (safeStorage.isEncryptionAvailable()) {
          try {
            password = safeStorage.decryptString(Buffer.from(data.password, 'base64'))
          } catch (e) {
            console.error('Failed to decrypt password', e)
            return resolve(false)
          }
        }

        const parentWindow = BrowserWindow.getAllWindows()[0]
        
        if (hiddenVpnWindow) {
          hiddenVpnWindow.destroy()
          hiddenVpnWindow = null
        }

        hiddenVpnWindow = new BrowserWindow({
          parent: parentWindow,
          show: false, // 恢复隐藏，作为幕后的数字特工
          width: 1000,
          height: 700,
          webPreferences: {
            partition: 'persist:ruc-webvpn',
            nodeIntegration: false,
            contextIsolation: true
          }
        })

        // 监听加载完成，注入自动填表脚本
        hiddenVpnWindow.webContents.on('did-finish-load', async () => {
          if (!hiddenVpnWindow) return
          
          const currentUrl = hiddenVpnWindow.webContents.getURL()
          
          try {
            // 不再单纯依赖 URL，而是直接注入脚本判断页面 DOM
            // 看看有没有账号密码输入框
            const domCheckResult = await hiddenVpnWindow.webContents.executeJavaScript(`
              new Promise((resolve) => {
                if (window.__vpn_inject_started) {
                  resolve('ALREADY_INJECTED');
                  return;
                }
                window.__vpn_inject_started = true;
                
                const accountInput = document.querySelector('input[type="text"]') || document.querySelector('#username');
                const passwordInput = document.querySelector('input[type="password"]') || document.querySelector('#password');
                
                if (accountInput && passwordInput) {
                  resolve('NEED_LOGIN');
                } else {
                  resolve('ALREADY_LOGGED_IN');
                }
              })
            `)

            if (domCheckResult === 'ALREADY_INJECTED') {
              return;
            } else if (domCheckResult === 'NEED_LOGIN') {
              console.log('[WebVPN] 发现登录框，开始自动代填...')
              const result = await hiddenVpnWindow.webContents.executeJavaScript(`
                new Promise((resolve) => {
                  try {
                    const accountInput = document.querySelector('input[type="text"]') || document.querySelector('#username');
                    const passwordInput = document.querySelector('input[type="password"]') || document.querySelector('#password');
                    
                    if (accountInput && passwordInput) {
                      accountInput.value = '${data.account}';
                      passwordInput.value = '${password}';
                      
                      accountInput.dispatchEvent(new Event('input', { bubbles: true }));
                      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));

                      // 勾选自动登录
                      const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
                      const autoLoginBox = checkboxes.find(cb => {
                        const parentText = cb.parentElement ? cb.parentElement.innerText : '';
                        return parentText.includes('自动') || parentText.includes('记住') || cb.id.includes('remember');
                      });
                      if (autoLoginBox && !autoLoginBox.checked) {
                        autoLoginBox.click();
                      }

                      const loginBtn = document.querySelector('button[type="submit"]') ||
                                       Array.from(document.querySelectorAll('button, input[type="button"], a')).find(b => {
                                         const t = b.textContent || b.value || '';
                                         return t.includes('登录') || t.includes('Login');
                                       });
                      
                      if (loginBtn) {
                        loginBtn.click();
                        
                        // 【关键修正】由于短信验证是一个页内弹窗，而不是跳转新页面
                        // 我们必须在当前页面的同一个上下文中，持续轮询等待这个弹窗出现
                        let waitModalAttempts = 0;
                        const modalInterval = setInterval(() => {
                          waitModalAttempts++;
                          
                          // 寻找弹窗里的“获取验证码”按钮
                          const findModalSmsBtn = () => {
                            const buttons = Array.from(document.querySelectorAll('button, input[type="button"], a'));
                            let target = buttons.find(el => {
                              const text = (el.innerText || el.value || '').trim();
                              return text.includes('验证码') || text.includes('动态码');
                            });
                            
                            if (!target) {
                              const others = Array.from(document.querySelectorAll('span, div'));
                              target = others.find(el => {
                                const text = (el.innerText || '').trim();
                                return text === '获取验证码' || text === '发送验证码';
                              });
                            }
                            return target;
                          };
                          
                          const sendSmsBtn = findModalSmsBtn();
                          
                          if (sendSmsBtn) {
                            // 找到了弹窗里的按钮！
                            clearInterval(modalInterval);
                            
                            // 等待手机号文本渲染完毕
                            let checkPhoneAttempts = 0;
                            const phoneInterval = setInterval(() => {
                              checkPhoneAttempts++;
                              const allText = document.body.innerText;
                              // 匹配类似 198****3882 的脱敏手机号
                              if (allText.match(/1[3-9]\\d{1,2}\\*+\\d{2,4}/)) {
                                clearInterval(phoneInterval);
                                executePhysicalClick(sendSmsBtn);
                              } else if (checkPhoneAttempts > 20) { // 等2秒
                                clearInterval(phoneInterval);
                                executePhysicalClick(sendSmsBtn); // 强行点
                              }
                            }, 100);

                            function executePhysicalClick(btn) {
                              try {
                                const rect = btn.getBoundingClientRect();
                                // 如果弹窗还在做弹出动画，坐标可能是错的，所以我们在发现后稍微等 500ms
                                setTimeout(() => {
                                  const finalRect = btn.getBoundingClientRect();
                                  const x = Math.round(finalRect.left + finalRect.width / 2);
                                  const y = Math.round(finalRect.top + finalRect.height / 2);
                                  const originalText = btn.innerText || btn.value || '';
                                  resolve({ type: 'NEED_PHYSICAL_CLICK', x, y, originalText });
                                }, 500);
                              } catch (e) {
                                resolve({ type: 'ERROR', message: 'Failed to get rect of modal button' });
                              }
                            }
                          } else if (waitModalAttempts > 100) { // 等 10 秒弹窗
                            clearInterval(modalInterval);
                            resolve({ type: 'LOGIN_CLICKED_WAITING' });
                          }
                        }, 100);
                        
                      } else {
                        resolve({ type: 'ERROR', message: 'Login button not found' });
                      }
                    } else {
                      resolve({ type: 'ERROR', message: 'Inputs not found in execution' });
                    }
                  } catch (err) {
                    resolve({ type: 'ERROR', message: err.toString() });
                  }
                })
              `)

            if (result && result.type === 'NEED_PHYSICAL_CLICK') {
              try {
                hiddenVpnWindow.webContents.debugger.attach('1.3')
                // 模拟鼠标移动
                await hiddenVpnWindow.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
                  type: 'mouseMoved',
                  x: result.x,
                  y: result.y
                })
                // 模拟鼠标按下
                await hiddenVpnWindow.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
                  type: 'mousePressed',
                  x: result.x,
                  y: result.y,
                  button: 'left',
                  clickCount: 1
                })
                // 模拟鼠标抬起
                await hiddenVpnWindow.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
                  type: 'mouseReleased',
                  x: result.x,
                  y: result.y,
                  button: 'left',
                  clickCount: 1
                })
                hiddenVpnWindow.webContents.debugger.detach()
                
                // 再次注入脚本去监听按钮是否变成数字
                const checkResult = await hiddenVpnWindow.webContents.executeJavaScript(`
                  new Promise((resolve) => {
                    const originalText = '${result.originalText}';
                    const findSmsBtn = () => {
                      // 1. 优先找 button, input, a
                      const buttons = Array.from(document.querySelectorAll('button, input[type="button"], a'));
                      let target = buttons.find(el => {
                        const text = (el.innerText || el.value || '').trim();
                        return text.includes('验证码') || text.includes('动态码') || text.includes('获取') || text.includes('发送') || /\\d/.test(text);
                      });
                      
                      // 2. 如果没找到，再找精确匹配的 span 或 div
                      if (!target) {
                        const others = Array.from(document.querySelectorAll('span, div'));
                        target = others.find(el => {
                          const text = (el.innerText || '').trim();
                          return text === '获取验证码' || text === '发送验证码' || /\\d/.test(text);
                        });
                      }
                      return target;
                    };

                    let attempts = 0;
                      const interval = setInterval(() => {
                        attempts++;
                        const btn = findSmsBtn();
                        const currentText = btn ? (btn.innerText || btn.value || '') : '';
                        
                        if (currentText !== originalText && /\\d/.test(currentText)) {
                          clearInterval(interval);
                          resolve(true); // 成功发送
                        } else if (attempts > 80) { // 等待 8 秒钟
                          clearInterval(interval);
                          resolve(false); // 明确宣告失败，不弹窗
                        }
                      }, 100);
                    })
                  `)
                  
                  if (checkResult) {
                    parentWindow.webContents.send('vpn:require-sms', null)
                  } else {
                    console.error('[WebVPN] 点击获取验证码失败。')
                    resolve(false)
                  }
              } catch (err) {
                parentWindow.webContents.send('vpn:require-sms', null) // 降级弹窗
              }
            } else if (result && result.type === 'ALREADY_LOGGED_IN') {
              console.log('[WebVPN] 账号已在线。')
              resolve(true)
            } else if (result && result.type === 'LOGIN_CLICKED_WAITING') {
              // 检查 Cookie
              const ses = session.fromPartition('persist:ruc-webvpn')
              const cookies = await ses.cookies.get({ domain: 'webvpn.ruc.edu.cn' })
              if (cookies.length > 0) resolve(true)
            } else {
              console.error('[WebVPN] 登录脚本异常:', result)
              resolve(false)
            }
            } else if (domCheckResult === 'ALREADY_LOGGED_IN') {
              console.log('[WebVPN] 账号已在线。')
              // 绝对不能 destroy，因为我们要复用它作为代理窗口
              resolve(true)
            }
          } catch (err: any) {
            // 如果点击“登录”触发了页面跳转（Multi-page app），executeJavaScript 会抛出 disposed 异常
            if (err.message && (err.message.includes('disposed') || err.message.includes('destroyed'))) {
              // 这里什么都不做，不要 resolve，让下一个页面的 did-finish-load 接管
            } else {
              resolve(false)
            }
          }
        })

        hiddenVpnWindow.loadURL('https://webvpn.ruc.edu.cn')

      } catch (e) {
        console.error('Failed to init VPN connection', e)
        resolve(false)
      }
    })
  })

  // IPC：提交短信验证码并完成最终登录 (基于焦点确认与值验证的步步为营策略)
  ipcMain.handle('vpn:submit-sms', async (_event, smsCode: string) => {
    return new Promise(async (resolve) => {
      if (!hiddenVpnWindow) return resolve(false)

      try {
        // 第一阶段：寻找真实可见的输入框和按钮坐标
        const result = await hiddenVpnWindow.webContents.executeJavaScript(`
          new Promise((resolve) => {
            try {
              // 策略：基于锚点的空间拓扑定位
              // 1. 寻找那个正在倒计时的发送按钮，或者写着"发送"的按钮，它肯定在当前激活的弹窗里
              const allButtons = Array.from(document.querySelectorAll('button, input[type="button"], a, span, div'));
              let smsSendBtn = allButtons.find(el => {
                const text = (el.innerText || el.value || '').trim();
                // 此时它应该是一个纯数字（倒计时），或者是"点击发送"/"发送验证码"
                return (/^\\d{1,2}s?$/.test(text) || text.includes('发送') || text.includes('获取')) && el.getBoundingClientRect().width > 0;
              });

              if (!smsSendBtn) {
                return resolve({ type: 'ERROR', message: 'SMS Send button (anchor) not found' });
              }

              // 2. 顺藤摸瓜：它的父级容器里，肯定有一个真正的 input
              let parent = smsSendBtn.parentElement;
              let realInput = null;
              
              // 往上找 3 层，看看有没有 input
              for (let i = 0; i < 3; i++) {
                if (!parent) break;
                const inputsInParent = Array.from(parent.querySelectorAll('input[type="text"], input[type="tel"], input[type="number"]'));
                const visibleInputs = inputsInParent.filter(el => el.getBoundingClientRect().width > 0);
                
                if (visibleInputs.length > 0) {
                  // 取离它最近的一个（通常也就是唯一的一个）
                  realInput = visibleInputs[0];
                  break;
                }
                parent = parent.parentElement;
              }

              // 如果基于拓扑找不到，兜底使用全局查找
              if (!realInput) {
                const candidates = Array.from(document.querySelectorAll('input[placeholder*="验证码"], input[placeholder*="动态码"], #phone-code-input, input[name="sms_code"]'));
                realInput = candidates.find(el => el.getBoundingClientRect().width > 0);
              }
              
              if (!realInput) {
                return resolve({ type: 'ERROR', message: 'Real SMS input not found near anchor' });
              }

              // 确保它在视图中间
              realInput.scrollIntoView({block: "center", inline: "center"});
              
              const inputRect = realInput.getBoundingClientRect();
              const inputX = Math.round(inputRect.left + inputRect.width / 2);
              const inputY = Math.round(inputRect.top + inputRect.height / 2);

              // 3. 寻找同处于这个弹窗内的"继续登录"按钮
              // 弹窗一般都在 DOM 树最后，所以 reverse() 找
              const submitBtns = Array.from(document.querySelectorAll('button, input[type="button"], a, #submit_second_login'));
              const loginBtn = submitBtns.reverse().find(b => {
                const t = (b.textContent || b.value || '').trim();
                return (b.id === 'submit_second_login' || t === '确定' || t === '提交' || t === '登录' || t === '继续' || t.includes('继续登录')) && b.getBoundingClientRect().width > 0;
              });

              if (!loginBtn) {
                return resolve({ type: 'ERROR', message: 'Login submit button not found' });
              }

              const btnRect = loginBtn.getBoundingClientRect();
              const btnX = Math.round(btnRect.left + btnRect.width / 2);
              const btnY = Math.round(btnRect.top + btnRect.height / 2);

              // 为输入框打上一个特殊的标记，方便后续步骤精确查找
              realInput.setAttribute('data-vpn-target', 'true');

              resolve({ 
                type: 'COORDS_FOUND', 
                inputX, inputY, btnX, btnY
              });
            } catch (err) {
              resolve({ type: 'ERROR', message: err.toString() });
            }
          })
        `)

        if (!result || result.type !== 'COORDS_FOUND') {
          console.error('[WebVPN] Coordinate anchoring failed:', result);
          return resolve(false);
        }

        // 挂载调试器
        try {
          hiddenVpnWindow.webContents.debugger.attach('1.3')
        } catch (e) {
          // 如果已经 attach，忽略报错
        }

        // 第二阶段：强制获取焦点并验证
        let focusSuccess = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          // 物理点击
          await hiddenVpnWindow.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: result.inputX, y: result.inputY })
          await hiddenVpnWindow.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', x: result.inputX, y: result.inputY, button: 'left', clickCount: 1 })
          await hiddenVpnWindow.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: result.inputX, y: result.inputY, button: 'left', clickCount: 1 })
          
          await new Promise(r => setTimeout(r, 200));

          // 验证焦点
          const isFocused = await hiddenVpnWindow.webContents.executeJavaScript(`
            (function() {
              const target = document.querySelector('[data-vpn-target="true"]');
              return document.activeElement === target;
            })()
          `);

          if (isFocused) {
            focusSuccess = true;
            break;
          } else {
            await new Promise(r => setTimeout(r, 500));
          }
        }

        if (!focusSuccess) {
          console.error('[WebVPN] Failed to acquire physical focus on input field.');
          hiddenVpnWindow.webContents.debugger.detach();
          return resolve(false);
        }

        // 第三阶段：多策略写入并验证
        let writeSuccess = false;

        // 策略 A: insertText
        await hiddenVpnWindow.webContents.insertText(smsCode);
        await new Promise(r => setTimeout(r, 300));
        
        let currentValue = await hiddenVpnWindow.webContents.executeJavaScript(`document.querySelector('[data-vpn-target="true"]').value`);
        if (currentValue && currentValue.length >= 4) {
          writeSuccess = true;
        } else {
          // 策略 B: 剪贴板粘贴
          clipboard.writeText(smsCode);
          const isMac = process.platform === 'darwin';
          const modifier = isMac ? 8 : 2;
          
          await hiddenVpnWindow.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86, macCharCode: 118, modifiers: modifier });
          await hiddenVpnWindow.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86, macCharCode: 118, modifiers: modifier });
          await new Promise(r => setTimeout(r, 300));

          currentValue = await hiddenVpnWindow.webContents.executeJavaScript(`document.querySelector('[data-vpn-target="true"]').value`);
          if (currentValue && currentValue.length >= 4) {
            writeSuccess = true;
          } else {
            // 策略 C: 原生 Setter + Event
            await hiddenVpnWindow.webContents.executeJavaScript(`
              (function() {
                const el = document.querySelector('[data-vpn-target="true"]');
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                if (nativeSetter) {
                  nativeSetter.call(el, '${smsCode}');
                } else {
                  el.value = '${smsCode}';
                }
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              })()
            `);
            await new Promise(r => setTimeout(r, 300));
            currentValue = await hiddenVpnWindow.webContents.executeJavaScript(`document.querySelector('[data-vpn-target="true"]').value`);
            if (currentValue && currentValue.length >= 4) {
              writeSuccess = true;
            }
          }
        }

        if (!writeSuccess) {
          console.error('[WebVPN] Failed to write SMS code into input field.');
          hiddenVpnWindow.webContents.debugger.detach();
          return resolve(false);
        }

        // 第四阶段：物理点击提交按钮
        await hiddenVpnWindow.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: result.btnX, y: result.btnY })
        await hiddenVpnWindow.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', x: result.btnX, y: result.btnY, button: 'left', clickCount: 1 })
        await hiddenVpnWindow.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: result.btnX, y: result.btnY, button: 'left', clickCount: 1 })
        
        hiddenVpnWindow.webContents.debugger.detach();

        // 监听最终跳转
        let checkNavAttempts = 0;
        const checkNavInterval = setInterval(async () => {
          checkNavAttempts++;
          if (!hiddenVpnWindow || hiddenVpnWindow.isDestroyed()) {
            clearInterval(checkNavInterval);
            resolve(false);
            return;
          }
          
          try {
            const currentUrl = hiddenVpnWindow.webContents.getURL();
            if (!currentUrl.includes('login') && currentUrl !== 'https://webvpn.ruc.edu.cn/login') {
              clearInterval(checkNavInterval);
              console.log('[WebVPN] Navigation successful:', currentUrl);
              resolve(true);
            } else if (checkNavAttempts > 100) {
              clearInterval(checkNavInterval);
              console.error('[WebVPN] Wait for navigation timeout after submit.');
              
              const hasError = await hiddenVpnWindow.webContents.executeJavaScript(`
                Array.from(document.querySelectorAll('div, span, p')).some(el => {
                  const text = el.innerText || '';
                  return text.includes('不正确') || text.includes('错误') || text.includes('失效');
                })
              `);
              if (hasError) console.error('[WebVPN] Error prompt detected on page.');
              
              resolve(false); 
            }
          } catch (e) {
            clearInterval(checkNavInterval);
            console.error('[WebVPN] Polling navigation error:', e);
            resolve(false);
          }
        }, 100);

      } catch (err) {
        console.error('[WebVPN] submit-sms exception:', err)
        if (hiddenVpnWindow) {
          try { hiddenVpnWindow.webContents.debugger.detach(); } catch(e){}
        }
        resolve(false)
      }
    })
  })

  // IPC：基于 DOI 的测试下载 (阶段一：直达页面测试)
  ipcMain.handle('knowledge:test-doi-download', async (_event, doi: string) => {
    return new Promise((resolve) => {
      if (!hiddenVpnWindow) {
        console.error('[WebVPN] Hidden WebVPN window not found! Please connect first.')
        resolve(false)
        return
      }

      const parentWindow = BrowserWindow.getAllWindows()[0]

      // 阶段一测试：为了让你肉眼看到结果，我们创建一个可见的大窗口
      const doiWindow = new BrowserWindow({
        parent: parentWindow,
        width: 1400,
        height: 900,
        title: `DOI Resolver (Testing: ${doi})`,
        autoHideMenuBar: true,
        backgroundColor: '#f3f4f6',
        webPreferences: {
          partition: 'persist:ruc-webvpn', // 共享 WebVPN 会话，享受免密权限
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: false
        }
      })
      
      // 全局放行这个测试窗口里的任何重定向和弹窗
      const setupDownloadHandler = (win: BrowserWindow) => {
        win.webContents.setWindowOpenHandler((details) => {
          console.log(`[WebVPN DOI-TEST] Allowed native popup for: ${details.url}`);
          return { 
            action: 'allow',
            overrideBrowserWindowOptions: {
              show: true,
              width: 1400,
              height: 900,
              autoHideMenuBar: true,
              backgroundColor: '#f3f4f6',
              webPreferences: {
                partition: 'persist:ruc-webvpn',
                nodeIntegration: false,
                contextIsolation: true,
                webSecurity: false
              }
            }
          }
        });
      };
      
      setupDownloadHandler(doiWindow);
      
      // 核心动作：直接访问 doi.org，依靠 WebVPN 会话里的身份证明（Cookie）穿透目标网站
      doiWindow.loadURL(`https://doi.org/${doi}`);

      resolve(true)
    })
  })

  let currentWosWindow: BrowserWindow | null = null;
let webvpnWindowCreatedHookInstalled = false;

const setupWebvpnBrowseWindow = (win: BrowserWindow) => {
  win.webContents.setWindowOpenHandler((details) => {
    console.log(`[WebVPN WINDOW] Allowed native popup for: ${details.url}`);
    return { 
      action: 'allow',
      overrideBrowserWindowOptions: {
        show: true,
        width: 1400,
        height: 900,
        autoHideMenuBar: true,
        title: 'Academic Resource (via WebVPN)',
        backgroundColor: '#f3f4f6',
        webPreferences: {
          partition: 'persist:ruc-webvpn',
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: false
        }
      }
    }
  });
};

// IPC：打开 Web of Science 进行检索 (复用已登录的隐藏窗口)
ipcMain.handle('knowledge:open-wos', async () => {
  return new Promise((resolve) => {
    if (!hiddenVpnWindow) {
      console.error('[WebVPN] Hidden WebVPN window not found! Please connect first.')
      resolve(false)
      return
    }
    
    const parentWindow = BrowserWindow.getAllWindows()[0]

    // 创建一个独立的可见窗口作为 Web of Science 的主入口，并挂载 WebVPN session
    const wosWindow = new BrowserWindow({
      parent: parentWindow,
      width: 1400,
      height: 900,
      title: 'Academic Resource (via WebVPN)',
      autoHideMenuBar: true,
      backgroundColor: '#f3f4f6',
      webPreferences: {
        partition: 'persist:ruc-webvpn', // 共享相同的 Session，自动免登录
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false
      }
    })
    
    currentWosWindow = wosWindow;
    setupWebvpnBrowseWindow(wosWindow);
    wosWindow.loadURL('https://webvpn.ruc.edu.cn');

    // 监听新创建的子窗口 (全局只注册一次)
    if (!webvpnWindowCreatedHookInstalled) {
      webvpnWindowCreatedHookInstalled = true;
      app.on('browser-window-created', (_, newWin) => {
        if (newWin.webContents.session === session.fromPartition('persist:ruc-webvpn') && 
            newWin !== hiddenVpnWindow && 
            newWin !== currentWosWindow) {
          
          newWin.on('close', (e) => {
            e.preventDefault();
            newWin.hide();
          });
          
          setupWebvpnBrowseWindow(newWin);
        }
      })
    }

    resolve(true)
  })
})

  // IPC：基于 Semantic Scholar 的学术文献检索
  ipcMain.handle('knowledge:search-papers', async (_event, query: string) => {
    try {
      // TODO: When we add UI for settings, we can read the API key here
      // For now, it will use the fallback caching & retry logic
      const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY || ''; 
      return await SemanticScholarService.searchPapers(query, apiKey);
    } catch (e: any) {
      console.error('[Semantic Scholar] Search failed:', e);
      return [];
    }
  });

  // IPC：AI 聊天通信 (MiniMax 代理)
  ipcMain.handle('ai:chat', async (_event, config, messages) => {
    return await AiService.chat(config, messages);
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
