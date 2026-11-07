# GPT2DSH：ChatGPT 备份档案

此版本基于 [Nwflower/dsh-chat-import](https://github.com/Nwflower/dsh-chat-import) 的 MIT 授权代码，复用原插件的转换、去重、会话持久化及工作区能力。GPT2DSH 是独立维护的开源衍生项目，不是上游发布版本。保留原插件内部标识以兼容已有安装，因此不要同时加载两个副本。完整来源见 [第三方声明](../THIRD_PARTY_NOTICES.md)。

## 安装与打开

在 DeepSeek Harness 的「插件」页，使用安装入口选择或填写本地 `dsh-chat-import-0.26.4-chatgpt.5.tgz` 的完整路径。也可以通过与桌面端版本一致的 CLI 安装：

```powershell
dsh plugin --profile desktop add "完整路径/dsh-chat-import-0.26.4-chatgpt.5.tgz"
```

Web 版本把 `desktop` 改为 `web`。安装完成后刷新或重启 Harness，侧栏底部会出现 **ChatGPT 备份**。本增强界面面向 Harness 0.2 桌面端 / Web；终端模式仍保留原插件的导入功能，但不显示档案浏览器。

## 使用流程

1. 把官方下载的 ChatGPT ZIP 解压。打开 **ChatGPT 备份**，选择或粘贴该文件夹路径，然后点击 **读取备份**。
2. 点击左侧项目名，在原位置展开其中最近 5 个会话；再次点击收起。多个项目可独立展开，「显示更多」继续加载较早会话。点击会话在右侧阅读；收起项目会保留正文与阅读位置。点击 **搜索聊天与文件** 或顶部搜索按钮，打开分类搜索。支持 `conversations.json` 和 `conversations-000.json` 等分片文件；聊天搜索涵盖历史分支。
3. 点击对话阅读 Markdown、代码、公式、引用和附件。多分支对话可在标题旁选择分支；默认遵循导出中的 `current_node`，不是简单选择最后一条消息。搜索命中其他分支时，可在分支菜单查看。
4. 点击 **继续这段对话**，所选分支会导入为 Harness 原生会话。输入框旁的模型菜单可切换已经配置的模型，再发送新消息。
5. 新提供方的 API 地址、凭据和模型 ID 在 Harness 的 **设置 → 模型** 中配置。插件复用 Harness 的提供方适配器，不单独保存 API Key。能使用哪些模型取决于宿主版本和提供方配置。

## 用记忆中的关键词查找

搜索框按空白分词。例如 `旅行 咖啡馆 摄影` 会拆成三个词：任意命中一个词即可进入结果，命中三个词的排在两个词之前，两个词排在一个词之前。同等命中数下，标题命中词更多的优先，最后按更新时间由新到旧排列。

关键词可以分散在标题、不同消息或不同分支里，不必相邻，也不受输入顺序影响。重复词只计一次，英文不区分大小写；空格、全角空格、Tab 和换行都可分词。每个词本身按字面包含匹配，不自动扩展同义词或纠正错字。一次支持最多 32 个不同关键词，超出会明确提示。

结果显示命中比例、命中词和最多三个上下文片段，并高亮标题与片段中的词。排序在完整结果上完成，再分页；清空搜索恢复按时间浏览。整个过程在本机执行，不调用模型 API，也不额外保存一份聊天全文索引。

## 限定搜索范围

搜索弹窗包含 **全部、聊天、附件、图片、文档、页面、项目** 标签，旁边的数字表示当前关键词在各类型中的结果数。同一文件在「全部」中只显示一次；「附件」包含文档和图片。匹配位置可以选择 **标题和正文、仅标题 / 文件名、仅正文**。例如选择「文档 + 仅正文」后输入关键词，可以排除仅文件名命中的附件。

| 范围 | 可检索内容 |
| --- | --- |
| 聊天 | 对话标题与各分支的消息文字 |
| 附件 / 图片 | 导出文件的原始名称；附件中支持的文档还包含正文。图片不做 OCR |
| 文档 | Deep Research 报告、PDF 文字层、DOCX、XLSX、PPTX / PPSX、TXT、Markdown、HTML、CSV、JSON 及常见代码文件的文本 |
| 页面 | 导出的 Pages 文字，以及 Sites 标题和描述 |
| 项目 | 已恢复的项目名称，包括本地重命名 |

文档在打开备份后于后台索引，搜索结果随进度更新，点击文件也会等待其正文读取完成。正文索引限制为单文件 32 MB、100 万字符；PDF 最多 300 页，Office 解压文本有大小限制。超限、部分索引、读取失败和仅文件名检索分别显示状态。扫描版 PDF 没有文字层时只搜文件名；本版不提供 OCR。文档阅读器展示提取的文字，精确分页和复杂文档排版可下载原文件查看。

## Deep Research 与特殊卡片

研究报告可能不在对话的消息正文里，而是位于 `library_files.json` 中标记为 `deep_research_report` 的附件。其 `.dat` 文件实际包含 JSON，正文来自 `widget_state.report_message.content.parts`。插件按 `origination_thread_id` 和 `origination_message_id` 关联原会话，恢复为可滚动预览、展开阅读、下载 Markdown 的报告卡片；引用整理为可点击来源。报告正文属于「文档」检索范围，也出现在「全部」中。

报告定位优先使用消息 ID；原消息不在导出分支时，根据研究启动消息与报告时间关联。无法确认位置时显示为该会话的相关报告；无法确认原会话时仍可从文档搜索独立打开。续聊会包含明确关联到所选分支的报告正文；为保护以前已经续聊的记录，首次带报告续聊会创建新的上下文版本。

导出的 `<box>`、`<grid>`、循环表格等声明式组件会转换为卡片和表格。支持勾选矩阵、恢复默认选择、复制、单选表单及滑块。操作只影响当前显示状态，重新打开会话回到备份中的默认状态。表单的续聊操作生成可复制的未发送提示词。未识别组件显示说明和可展开源码；不会静默丢弃。备份没有保存的远程图片显示占位说明。

## 项目与持久化

- 按导出中的 `project_id`、`project.id` 或 `g-p-` 开头的 `conversation_template_id` 恢复分组。优先读取对话里的项目名称或 `projects.json`；原名未导出时，用组内对话标题作为「暂名」，不把推测当作原名。项目行悬停时点击右侧 **⋯ → 重命名项目** 可修改名称，本地保存的名称优先，重新读取备份不会覆盖它。
- 续聊时，每个备份中的项目对应一个独立 Harness 工作区。未分组对话进入「ChatGPT 历史对话」工作区。名称修改会同步到已创建的工作区。
- 档案浏览仅记住目录路径和本地项目名称，不复制整份备份；每次启动后首次打开时重建内存索引。移动备份后请重新选择新目录。
- 点击续聊才把这一条分支的文字内容保存到 Harness。再次点击同一条未变化的分支会打开已有会话；已新增的聊天内容不会被覆盖。源文件变化时沿用上游去重与分叉机制。
- 删除插件不会删除原始备份。新增会话由 Harness 自己管理；本插件的索引与项目名称位于其导入登记目录中的 `chatgpt-archives.json`。

## 数据边界

- 查看、全文搜索和本地附件读取无需模型 API。档案中的远程图片不自动加载；点击外部引用或网站链接才访问对应网站。发送续聊消息会把所需的上下文发给你选定的 API 提供方。
- 原始备份只读。项目分组和对话可恢复多少，取决于官方下载的内容；未导出的项目说明、名称、记忆和文件无法凭空恢复。
- 本地 PNG、JPEG、GIF、WebP 图片滚动到附近时自动预览，支持查看大图与保存；同一消息中的重复附件会合并。长文件名在固定区域内省略，悬停可查看全名。缺失附件显示「导出中缺失」。支持的文档可直接阅读提取文字，其他格式可下载后交给系统对应应用打开。附件下载上限 64 MB，单 JSON 分片上限 256 MB；超限有明确提示。
- 续聊保留所选分支的文字上下文、已关联的研究报告正文与附件名称，不自动把图片或其他文件二进制发送给模型。需要模型读取时，在 Harness 会话中重新附加。超长历史仍受所选模型上下文容量和 Harness 压缩策略限制。
- Pages 展示导出的文字投影；Sites 展示标题、描述和原网站链接。此版不执行备份内的网站代码，也不完整还原在线 Pages / Sites 编辑器。
- 不包含 ChatGPT 账户登录、在线同步、群聊及 Codex 任务的专用浏览界面。

## English

This local fork adds a **ChatGPT Backup** sidebar action to the upstream import plugin. Choose an extracted official export, search conversations across shards and branches, browse recovered project groups, and open a selected branch as a native Harness session. Switch providers/models through Harness settings and its normal composer. No separate API credential store is introduced.

Archive browsing reads files in place and persists only directory references, local project names and continuation references. Native continuation stores the selected text transcript in Harness. Original backup files stay unchanged. Missing project names can be supplied locally; unavailable attachments are marked. Images/files need to be attached again when the chosen model should consume their binary contents. Pages expose exported text; Sites expose metadata and links. The archive UI is intended for Harness 0.2 Desktop/Web. GPT2DSH is an independently maintained MIT-licensed derivative, not an official upstream release. See the [attribution record](../THIRD_PARTY_NOTICES.md).

The archive has a two-column sidebar/reader layout, reserves the desktop title bar and adapts to narrow windows. Backup controls live under **备份管理**. Local raster images preview automatically near the viewport, and duplicate references within a message are merged. Project names are recovered from explicit metadata when present; otherwise a conversation title is marked as a provisional label. Locally supplied names take precedence and survive reopening the backup.

The project sidebar uses independent expand/collapse sections with indented, single-line chat rows, selected-chat highlighting, and five-at-a-time disclosure. Older chats remain accessible across server pages. Collapsing keeps the reader open; project names can be changed through the hover menu. Search spans all projects. Arrow keys and reduced-motion preferences are supported. Visual reference: [OpenAI’s public project interface](https://help.openai.com/en/articles/10169521-projects-in-chatgpt); the offline archive does not reproduce online project administration.

Search splits whitespace-separated, case-insensitive literal terms and returns conversations matching any term. Rank by distinct terms matched, then title hits, then last update. Terms can appear in different messages or branches. Duplicates do not boost ranking. Results show matched-term coverage, highlighted titles and up to three context excerpts; ranking precedes pagination. Empty search restores chronological browsing. Up to 32 distinct terms are supported. No model or external search service is used.

The search dialog now separates chats, attachments, images, documents, pages and projects, with title/filename-only and body-only filters. Documents are indexed in the background: PDF text layers, DOCX/XLSX/PPTX/PPSX and common text formats. The in-memory index is limited to 32 MB per file, one million text characters and 300 PDF pages. Partial, failed and filename-only results are labeled. Images and scanned PDFs do not undergo OCR; extracted document text does not preserve precise pagination.

Deep Research JSON attachments are associated by exported origin thread/message metadata, shown as expandable report cards, and searchable under Documents or All. Reports retain source links and can be saved as Markdown. Reports securely associated with the selected branch are included when continuing in Harness, using a separate context identity to preserve older continuations. Supported declarative cards, tables, checkbox matrices, forms and sliders are interpreted as bounded data and native controls. No exported JavaScript is evaluated; form submissions prepare unsent drafts. Unsupported components retain their source and an explicit explanation.
