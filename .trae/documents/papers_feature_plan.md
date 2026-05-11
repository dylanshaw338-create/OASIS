# 论文收集与分析功能 (Papers) 完善计划

## 1. 摘要
本项目计划将当前的“论文 (Papers)”视图从简单的文件列表，升级为一个具备**内嵌 PDF 阅读**、**元数据管理**以及**独立 AI 论文助手**的沉浸式学术阅读空间。核心技术方案采用 Electron 原生协议预览 PDF，结合 `pdf-parse` 在本地提取文本供 AI 分析，从而实现“边读、边记、边问”的一体化体验。

## 2. 当前状态分析
- **数据层**：`knowledge_base.json` 目前只存储了最基础的文件信息（`ImportedFile`），缺乏对作者、摘要、笔记、标签等学术元数据的支持。
- **UI 层**：`PapersView.tsx` 仅为一个文件列表，无法预览文件内容。
- **功能层**：缺乏对 PDF 文本的提取能力，AI 无法直接感知被导入的论文内容。

## 3. 具体修改方案

### 3.1 依赖与主进程扩展 (`electron/main.ts`)
- **新增依赖**：安装 `pdf-parse` 用于在主进程中本地解析 PDF 文本。
- **自定义协议**：在 `app.whenReady()` 后注册自定义协议 `local-file://`。这允许渲染进程的 `<iframe>` 直接通过绝对路径加载本地的 PDF 文件，利用 Chromium 强大的内置 PDF 阅读器实现丝滑滚动与缩放，避开严格的 `file://` 安全限制。
- **新增 IPC 接口**：增加 `ipcMain.handle('knowledge:parse-pdf', ...)`，接收 PDF 本地路径，返回提取的纯文本内容。

### 3.2 数据结构扩展 (`src/types/data.ts`)
- 扩展 `ImportedFile` 或启用新的 `Paper` 接口，包含以下字段：
  - 基础：`id`, `name`, `originalPath`, `localPath`, `size`, `type`, `importedAt`
  - 学术元数据：`title`, `authors` (string[]), `abstract`, `tags` (string[])
  - 用户数据：`userNotes` (string, 支持 Markdown), `aiSummary` (string)

### 3.3 视图层重构 (`src/components/views/PapersView.tsx`)
- **沉浸式三列布局**：
  - **左侧 (列表区)**：显示论文列表。支持点击选中。
  - **中间 (阅读区)**：核心区域。当选中 PDF 时，渲染 `<iframe src={\`local-file://${paper.localPath}\`} className="w-full h-full" />`，提供原生的阅读体验。
  - **右侧 (工作区 - 双 Tab 切换)**：
    - **Tab 1 - 笔记与元数据**：显示并允许编辑论文的 Title, Authors, Tags，下方提供一个 Markdown 编辑器用于记录 `userNotes`。
    - **Tab 2 - AI 助手**：针对当前论文的独立对话框。提供【一键总结论文】功能（后台调用 `parse-pdf` 提取文本，并组合 Prompt 发送给 MiniMax），用户也可以就论文的具体段落向 AI 提问。

### 3.4 视觉与交互规范
- 延续“空灵巨石 (Ethereal Monolith)”的极简设计。
- 移除厚重的面板背景，让组件半透明，使得底层的流体体积光可以透射上来。
- Tab 切换使用无边框的下划线动画（Framer Motion）。

## 4. 关键决策与假设
- **文本提取长度限制**：由于 PDF 文本可能极大，传递给 AI 时可能会触发 Token 限制。计划在发送前对提取的文本进行长度截断（例如最多保留前 N 个字符，或提取关键段落），并在 UI 上给予用户提示。
- **协议安全性**：`local-file://` 协议仅用于读取本地缓存的论文，不会造成安全漏洞。

## 5. 验证步骤
1. **导入与解析**：导入一篇 PDF，验证能否成功生成包含元数据的记录。
2. **原生预览**：点击论文后，中间区域能否正常渲染出 PDF 且支持滚动。
3. **AI 总结**：在右侧 AI 助手面板点击“总结论文”，验证 `pdf-parse` 是否成功提取文本，并收到 AI 的返回结果。
4. **状态持久化**：修改笔记或作者后，重启应用验证数据是否正确保存到 `knowledge_base.json`。