// Local ChatGPT archive service: index source files without copying the backup. Session writes
// reuse importTranscript's conversion, deduplication, persistence and workspace pipeline.
import { mkdir, readFile } from 'node:fs/promises'
import { join, relative, isAbsolute, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { setImmediate } from 'node:timers'
import { writeAtomic } from './atomic-write.mjs'
import { importTranscript } from './import-core.mjs'
import { convertChatgptJson } from './convert/chatgpt.mjs'
import { archiveSummary, archiveConversation, archiveAssetId, archiveMediaType, archiveImageType } from './chatgpt-archive-content.mjs'
import { searchArchiveRecords } from './chatgpt-archive-search.mjs'
import { createArchiveCatalog } from './chatgpt-archive-catalog.mjs'
import { archiveCitationText } from './chatgpt-archive-documents.mjs'
import { archiveRichParts } from './chatgpt-rich.mjs'

const digest = (text) => createHash('sha256').update(String(text)).digest('hex').slice(0, 24)
const conversationFile = (name) => /^conversations(?:-\d+)?\.json$/i.test(name)
const MAX_ASSET = 64 * 1024 * 1024
const MAX_JSON = 256 * 1024 * 1024

export function createChatgptArchive(ctx, registryDir) {
  const statePath = join(registryDir, 'chatgpt-archives.json')
  let state
  let loaded
  let shardCache
  let queue = Promise.resolve()
  const serial = (fn) => {
    const next = queue.then(fn, fn)
    queue = next.catch(() => {}) // Each caller receives its own failure; later operations still run.
    return next
  }
  async function settings() {
    if (!state) {
      try { state = JSON.parse(await readFile(statePath, 'utf8')) } catch (err) {
        if (err.code !== 'ENOENT') throw new Error('备份索引设置无法读取：' + err.message)
        state = { version: 1, archives: [], names: {}, continuations: {} }
      }
    }
    return state
  }
  async function save() {
    await mkdir(registryDir, { recursive: true })
    await writeAtomic(statePath, JSON.stringify(state, null, 2))
  }
  async function target(path) { return ctx.fs.resolve(path) }
  async function json(path, optional = false) {
    const t = await target(path)
    const st = await ctx.fs.stat(t)
    if (!st && optional) return undefined
    if (!st || st.type !== 'file') throw new Error('找不到数据文件：' + basename(path))
    if (st.size > MAX_JSON) throw new Error('单个 JSON 文件超过 256 MB：' + basename(path))
    return JSON.parse(await ctx.fs.readText(t))
  }
  async function inside(root, path) {
    const t = await target(path)
    const rel = relative(root.targetKey, t.targetKey)
    if (rel === '..' || rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) || isAbsolute(rel)) {
      throw new Error('附件路径超出已选择的备份目录。')
    }
    return t
  }
  async function entries(path) { return ctx.fs.listDir(await target(path)) }
  async function locate(path) {
    const t = await target(path)
    const st = await ctx.fs.stat(t)
    if (!st || st.type !== 'directory') throw new Error('请选择已解压的备份文件夹，而不是 ZIP 或 JSON 文件。')
    let list = await entries(t.displayPath)
    if (list.some((e) => e.type === 'file' && conversationFile(e.name))) return { root: t, list }
    const candidates = []
    for (const e of list.filter((e) => e.type === 'directory').slice(0, 40)) {
      const sub = await entries(join(t.displayPath, e.name))
      if (sub.some((f) => f.type === 'file' && conversationFile(f.name))) candidates.push({ root: await target(join(t.displayPath, e.name)), list: sub })
    }
    if (candidates.length !== 1) throw new Error(candidates.length ? '目录里有多份备份，请选择其中一个解压文件夹。' : '未找到 conversations.json 或 conversations-000.json 等对话文件。')
    return candidates[0]
  }
  async function load(path) {
    const { root, list } = await locate(path)
    const id = digest(root.targetKey)
    const records = []
    const assets = new Map()
    const warnings = []
    const seen = new Set()
    const files = list.filter((e) => e.type === 'file' && conversationFile(e.name)).map((e) => e.name).sort()
    for (const file of files) {
      await inside(root, join(root.displayPath, file))
      const conversations = await json(join(root.displayPath, file))
      if (!Array.isArray(conversations)) throw new Error(file + ' 的顶层必须是对话数组。')
      for (let i = 0; i < conversations.length; i++) {
        const c = conversations[i]
        if (!c?.mapping || typeof c.mapping !== 'object') { warnings.push(file + '：跳过一个缺少 mapping 的条目。'); continue }
        const sourceId = c.id || c.conversation_id || file + ':' + i
        if (seen.has(sourceId)) { warnings.push('重复对话 ID 已跳过：' + sourceId); continue }
        seen.add(sourceId)
        records.push({ ...archiveSummary(c, file, digest(sourceId)), id: String(sourceId), position: i })
      }
      // Yield between shards; do not retain 165 MB of raw JSON in the host.
      await new Promise((resolve) => setImmediate(resolve))
    }
    const names = await json(join(root.displayPath, 'conversation_asset_file_names.json'), true) || {}
    const library = await json(join(root.displayPath, 'library_files.json'), true) || []
    const libraryMap = new Map((Array.isArray(library) ? library : []).map((r) => [r.file_id, r]))
    for (const e of list.filter((e) => e.type === 'file' && !conversationFile(e.name) && e.name !== 'chat.html')) {
      const key = archiveAssetId(e.name)
      if (!key || !/^(file[-_])/.test(key)) continue
      const meta = libraryMap.get(key)
      const name = names[e.name] || meta?.file_name || e.name
      assets.set(key, { id: key, file: e.name, name, size: e.size || meta?.file_size_bytes || 0,
        mediaType: archiveImageType(name, meta?.mime_type) || meta?.mime_type || '', artifactType: meta?.library_artifact_type,
        originThreadId: meta?.origination_thread_id, originMessageId: meta?.origination_message_id,
        updated: Date.parse(meta?.modified_at || meta?.created_at || '') / 1000 || 0 })
    }
    const projects = new Map()
    for (const r of records) if (r.projectId) {
      const p = projects.get(r.projectId) || { id: r.projectId, name: r.title || '历史项目', count: 0,
        recoveredName: false, nameSource: 'conversation-title' }
      if (r.projectName && !p.recoveredName) { p.name = r.projectName; p.recoveredName = true; p.nameSource = 'export' }
      p.count++
      projects.set(p.id, p)
    }
    const projectMeta = await json(join(root.displayPath, 'projects.json'), true)
    const projectEntries = Array.isArray(projectMeta) ? projectMeta : Array.isArray(projectMeta?.projects) ? projectMeta.projects
      : Object.entries(projectMeta || {}).map(([id, p]) => typeof p === 'string' ? { id, name: p } : { ...p, id })
    for (const p of projectEntries) {
      const entry = projects.get(String(p.id || p.project_id))
      const name = p.name || p.title
      if (entry && typeof name === 'string' && name.trim()) { entry.name = name.trim().slice(0, 120); entry.recoveredName = true; entry.nameSource = 'export' }
    }
    records.sort((a, b) => b.updated - a.updated)
    const a = { id, path: root.displayPath, root, files, records, assets, projects: [...projects.values()], warnings, documents: [] }
    await loadDocuments(a, list)
    a.catalog = await createArchiveCatalog(a, id => getAsset(a, id), () => loaded === a)
    loaded = a
    a.catalog.start().catch(err => a.warnings.push('文档索引未完成：' + err.message))
    shardCache = undefined
    return a
  }
  async function loadDocuments(a, list) {
    for (const kind of ['pages', 'sites']) {
      if (!list.some((e) => e.name === kind && e.type === 'directory')) continue
      const base = join(a.path, kind === 'sites' ? 'sites/projects' : 'pages')
      for (const entry of await entries(base)) {
        if (entry.type !== 'directory') continue
        const file = join(base, entry.name, kind === 'sites' ? 'project.json' : 'content/current.json')
        try {
          await inside(a.root, file)
          const d = await json(file)
          const p = kind === 'sites' ? d.metadata : d.projection
          a.documents.push({ id: kind + '/' + entry.name, kind, title: p?.title || entry.name,
            text: p?.materialized_search_text || p?.description || '', url: p?.current_live_url || null,
            note: kind === 'sites' ? '此处展示网站导出元数据；源码仓库保留在原备份的 sites 目录中。' : '' })
        } catch (err) { a.warnings.push('无法读取 ' + kind + '/' + entry.name + '：' + err.message) }
      }
    }
  }
  async function archive(id) {
    if (loaded?.id === id) return loaded
    const s = await settings()
    const ref = s.archives.find((a) => a.id === id)
    if (!ref) throw new Error('这份备份尚未导入。')
    return load(ref.path)
  }
  function summary(a) {
    return { id: a.id, path: a.path, conversations: a.records.length, files: a.files.length, assets: a.assets.size,
      warnings: a.warnings, projects: a.projects.map((p) => ({ ...p, name: state.names[a.id + ':' + p.id] || p.name,
        nameSource: state.names[a.id + ':' + p.id] ? 'local' : p.nameSource })), documents: a.documents,
      reports: a.catalog?.reportCount || 0, indexing: a.catalog?.progress() }
  }
  async function conversation(a, key) {
    const record = a.records.find((r) => r.key === key)
    if (!record) throw new Error('找不到这条对话，请刷新备份。')
    const file = join(a.path, record.file)
    const t = await inside(a.root, file)
    const st = await ctx.fs.stat(t)
    const signature = String(st?.version) + ':' + st?.size
    if (shardCache?.file !== file || shardCache?.signature !== signature) shardCache = { file, signature, data: await json(file) }
    const conv = shardCache.data[record.position]
    if (!conv || String(conv.id || conv.conversation_id || record.file + ':' + record.position) !== record.id) throw new Error('备份内容已变化，请重新读取目录。')
    return { record, conv }
  }
  async function getAsset(a, id) {
    const key = archiveAssetId(id)
    const info = key && a.assets.get(key)
    if (!info) throw new Error('该附件未包含在这份导出备份中。')
    const t = await inside(a.root, join(a.path, info.file))
    const st = await ctx.fs.stat(t)
    if (st?.size > MAX_ASSET) throw new Error('附件大于 64 MB，请从原备份目录打开：' + info.file)
    const bytes = await ctx.fs.readBytes(t, undefined, MAX_ASSET)
    const detected = archiveMediaType(bytes)
    return { ...info, bytes: Buffer.from(bytes), mediaType: detected === 'application/octet-stream' ? info.mediaType || detected : detected }
  }
  async function continueConversation(input) {
    const a = await archive(input.archiveId)
    const { conv, record } = await conversation(a, input.key)
    const detail = a.catalog.attachReports(archiveConversation(conv, input.nodeId))
    const mapping = { ...conv.mapping }
    const restored = []
    for (const message of detail.messages) {
      if (!message.reports?.length) continue
      const texts = []
      for (const report of message.reports) {
        const document = await a.catalog.document(report.id)
        texts.push('\n\n## 历史深度研究报告：' + document.title + '\n\n' + document.text)
        restored.push(report.id + ':' + digest(document.text))
      }
      const original = mapping[message.id]
      mapping[message.id] = { ...original, message: { ...original.message,
        content: { ...original.message.content, parts: [...(original.message.content.parts || []), ...texts] } } }
    }
    // Enriched report contexts get a new identity; existing native continuations remain intact.
    const identity = [a.id, record.key, detail.selectedNode, ...(restored.length ? ['reports-' + digest(restored.join('|'))] : [])].join(':')
    const workspaceKey = record.projectId || 'general'
    const workdir = join(registryDir, 'chatgpt-workspaces', digest(a.id + ':' + workspaceKey))
    await mkdir(workdir, { recursive: true })
    const selection = { ...conv, mapping, current_node: detail.selectedNode, id: 'archive-' + digest(identity) }
    const args = { budget: Number.MAX_SAFE_INTEGER, workspaceMode: 'dedicated', workspaceDir: workdir,
      importSystemPrompt: false, fullHistory: true, storeImages: true, force: false }
    const convert = () => {
      const result = convertChatgptJson(JSON.stringify([selection]), args).conversations[0]
      if (!result) throw new Error('这段分支没有可继续的用户消息。')
      return result
    }
    // importTranscript supplies the established dedup/reimport state machine. The branch gets
    // a stable identity without writing a second copy of the source conversation to disk.
    const realTarget = await target(join(a.path, record.file))
    const selectedTarget = { ...realTarget, displayPath: join(a.path, '.chatgpt-branch-' + digest(identity)) }
    const out = await importTranscript(ctx, selectedTarget, args, convert, { registryDir,
      sourceLabel: 'ChatGPT', importFormat: 'chatgpt', readText: async () => '', fingerprintKeys: ['workspaceDir'] })
    if (!out.sessionId || out.sessionId === 'none') throw new Error(out.reason || out.skipReason || '这段分支未能导入为会话。')
    const s = await settings()
    s.continuations[identity] = out.sessionId
    const workspace = await ctx.get('workspaceRegistry')?.resolveByPath(workdir)
    const name = record.projectId ? summary(a).projects.find((p) => p.id === record.projectId)?.name : 'ChatGPT 历史对话'
    if (workspace?.setTitle && name) await workspace.setTitle(name)
    await save()
    return { ...out, title: record.title, workspace: name,
      note: '已保留所选分支的文字上下文' + (restored.length ? '及 ' + restored.length + ' 份研究报告正文' : '') + '。其他图片和文件需要模型读取时，请在续聊中重新附加。' }
  }
  async function dispatch(input) {
    const s = await settings()
    switch (input.op) {
      case 'status': return { archives: s.archives, last: s.last || null }
      case 'open': {
        if (typeof input.path !== 'string' || !input.path.trim()) throw new Error('请填写备份文件夹路径。')
        const a = await load(input.path.trim())
        s.archives = [...s.archives.filter((r) => r.id !== a.id), { id: a.id, path: a.path, label: basename(a.path) }]
        s.last = a.id
        await save()
        return summary(a)
      }
      case 'summary': return summary(await archive(input.archiveId))
      case 'list': {
        const a = await archive(input.archiveId)
        return searchArchiveRecords(a.records, input)
      }
      case 'search': {
        const a = await archive(input.archiveId)
        return a.catalog.search(input, summary(a).projects)
      }
      case 'index': {
        const a = await archive(input.archiveId)
        if (input.wait) await a.catalog.start()
        return a.catalog.progress()
      }
      case 'document': return (await archive(input.archiveId)).catalog.document(input.id)
      case 'widget': {
        const a = await archive(input.archiveId)
        const { conv } = await conversation(a, input.key)
        const message = conv.mapping[input.messageId]?.message
        if (message?.author?.role !== 'assistant') throw new Error('找不到可交互的助手消息。')
        const raw = archiveConversation({ ...conv, current_node: input.messageId }).messages.find(m => m.id === input.messageId)
        const text = archiveCitationText(raw?.text, message.metadata?.content_references).text
        const part = archiveRichParts(text, { part: input.part, state: input.state, action: input.action })[input.part]
        if (part?.kind !== 'widget') throw new Error(part?.error || '此组件暂时无法还原。')
        return part
      }
      case 'conversation': {
        const a = await archive(input.archiveId)
        const { conv } = await conversation(a, input.key)
        const detail = archiveConversation(conv, input.nodeId)
        for (const m of detail.messages) {
          const cited = archiveCitationText(m.text, conv.mapping[m.id]?.message?.metadata?.content_references)
          m.text = cited.text
          if (cited.refs.length) m.refs = cited.refs
          if (m.role === 'assistant' && /<(?:box|grid|row|table|form)\b|\{@body/.test(m.text)) m.parts = archiveRichParts(m.text)
          m.assets = m.assets.map((asset) => {
          const info = a.assets.get(archiveAssetId(asset.id))
          const name = info?.name || asset.name || asset.id
          const mediaType = info?.mediaType || asset.mediaType || archiveImageType(name)
          return { ...asset, id: archiveAssetId(asset.id) || asset.id, name, mediaType, available: !!info,
            previewable: !!info && (!!archiveImageType(name, mediaType) || asset.kind === 'image_asset_pointer') }
          })
        }
        return a.catalog.attachReports(detail)
      }
      case 'asset': {
        const info = await getAsset(await archive(input.archiveId), input.assetId)
        return { name: info.name, mediaType: info.mediaType, base64: info.bytes.toString('base64') }
      }
      case 'rename': {
        const a = await archive(input.archiveId)
        if (!a.projects.some((p) => p.id === input.projectId)) throw new Error('找不到项目。')
        const name = String(input.name || '').trim().slice(0, 120)
        if (!name) throw new Error('项目名称不能为空。')
        const wr = ctx.get('workspaceRegistry')
        let workspace
        try { workspace = await wr?.resolveByPath(join(registryDir, 'chatgpt-workspaces', digest(a.id + ':' + input.projectId))) }
        catch (err) {
          // A project has no native workspace until its first continuation.
          if (err.code !== 'ENOENT') throw err
        }
        if (workspace?.setTitle) await workspace.setTitle(name)
        s.names[a.id + ':' + input.projectId] = name
        await save()
        return summary(a)
      }
      case 'continue': return continueConversation(input)
      default: throw new Error('未知的档案操作。')
    }
  }
  return { request: (input) => serial(() => dispatch(input)) }
}
