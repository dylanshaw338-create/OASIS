import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
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
