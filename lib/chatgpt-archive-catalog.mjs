// One in-memory catalog for typed search and document reading. Files remain in the source directory.
import { archiveFileCategory, extractArchiveDocument } from './chatgpt-archive-documents.mjs'
import { searchArchiveRecords } from './chatgpt-archive-search.mjs'
import { setImmediate } from 'node:timers'

const SCOPES = ['all', 'chats', 'attachments', 'images', 'documents', 'pages', 'projects']
const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024
const publicEntry = ({ search, text, file, pending, ...entry }) => entry

export async function createArchiveCatalog(archive, readAsset, isActive) {
  const chats = new Map(archive.records.map(r => [r.id, r]))
  const entries = new Map()
  for (const asset of archive.assets.values()) {
    const origin = chats.get(asset.originThreadId)
    const kind = archiveFileCategory(asset)
    const id = 'asset:' + asset.id
    const pending = kind === 'document' && asset.size <= MAX_DOCUMENT_BYTES
    entries.set(id, { id, key: id, title: asset.name, assetId: asset.id, mediaType: asset.mediaType, size: asset.size,
      kind, research: asset.artifactType === 'deep_research_report', scopes: ['attachments', kind === 'image' ? 'images' : kind === 'document' ? 'documents' : 'attachments'],
      conversationKey: origin?.key, conversationTitle: origin?.title, projectId: origin?.projectId,
      originMessageId: asset.originMessageId, updated: asset.updated || origin?.updated || 0,
      search: asset.name, indexStatus: pending ? 'pending' : 'name-only',
      indexNote: pending ? '' : asset.size > MAX_DOCUMENT_BYTES ? '文件超过 32 MB，暂仅检索文件名。'
        : kind === 'image' ? '按文件名检索；未进行图片 OCR。' : '此格式仅支持文件名检索。' })
  }
  for (const d of archive.documents) entries.set(d.id, { ...d, key: d.id, kind: 'page', scopes: ['pages'], format: 'markdown',
    search: d.title + '\n' + d.text, indexStatus: 'indexed', indexNote: d.note || '', updated: 0 })

  const jobs = new Map()
  async function index(entry) {
    if (entry.indexStatus !== 'pending') return
    if (jobs.has(entry.id)) return jobs.get(entry.id)
    const job = (async () => {
      try {
        const asset = archive.assets.get(entry.assetId)
        const read = await readAsset(entry.assetId)
        if (read.bytes.length > MAX_DOCUMENT_BYTES) throw new Error('文件超过 32 MB，暂仅检索文件名。')
        Object.assign(entry, await extractArchiveDocument(read.bytes, asset))
        entry.search = entry.title + '\n' + (entry.text || '')
      } catch (err) {
        entry.indexStatus = 'failed'
        entry.indexNote = err.message
      }
    })()
    jobs.set(entry.id, job)
    await job
    jobs.delete(entry.id)
  }
  // Reports are small and must be available when the first conversation opens.
  for (const entry of entries.values()) if (entry.research) await index(entry)
  let task
  const start = () => {
    if (!task) task = (async () => {
      for (const entry of entries.values()) {
        if (!isActive()) break
        await index(entry)
        await new Promise(resolve => setImmediate(resolve))
      }
    })()
    return task
  }
  const progress = () => {
    const counts = { total: 0, indexed: 0, partial: 0, pending: 0, failed: 0, nameOnly: 0 }
    for (const e of entries.values()) {
      if (!e.assetId) continue
      counts.total++
      counts[e.indexStatus === 'name-only' ? 'nameOnly' : e.indexStatus]++
    }
    return counts
  }
  async function document(id) {
    const entry = entries.get(id)
    if (!entry) throw new Error('找不到这份文档，请重新读取备份。')
    await index(entry)
    return { ...publicEntry(entry), text: entry.text || '', refs: entry.refs || [], asset: entry.assetId ? {
      id: entry.assetId, name: entry.title, mediaType: entry.mediaType, available: true, previewable: entry.kind === 'image',
    } : undefined }
  }
  function search(input, projects) {
    const scope = input.scope || 'all'
    if (!SCOPES.includes(scope)) throw new Error('未知的搜索范围。')
    const records = [...archive.records.map(r => ({ ...r, kind: 'chat', scopes: ['chats'] })), ...entries.values(),
      ...projects.map(p => ({ key: 'project:' + p.id, id: p.id, projectId: p.id, title: p.name, search: p.name,
        kind: 'project', scopes: ['projects'], count: p.count, updated: 0 }))]
    const result = searchArchiveRecords(records, { ...input, scope })
    const counts = Object.fromEntries(SCOPES.map(type => [type, result.counts[type] || 0]))
    result.rows = result.rows.map(publicEntry)
    return { ...result, counts, scope, indexing: progress() }
  }
  function attachReports(detail) {
    const reports = [...entries.values()].filter(e => e.research && e.indexStatus === 'indexed'
      && e.conversationKey === archive.records.find(r => r.id === detail.id)?.key)
    detail.reports = []
    for (const report of reports) {
      const exact = detail.messages.find(m => m.id === report.originMessageId)
      // Some exports omit the report node but retain its origin thread. Place the card after
      // the preceding research launch on this branch; ambiguous positions remain separate.
      const before = detail.messages.filter(m => m.role === 'assistant' && !m.reasoning && m.time && m.time <= report.time)
        .sort((a, b) => b.time - a.time)[0]
      const target = exact || (before && /deep\s*research|深度研究|深度.*调研/i.test(before.text) ? before : null)
      if (target) (target.reports ||= []).push(publicEntry(report))
      else if (!detail.messages.at(-1)?.time || detail.messages.at(-1).time >= report.time) detail.reports.push(publicEntry(report))
    }
    return detail
  }
  return { start, progress, search, document, attachReports, reportCount: [...entries.values()].filter(e => e.research).length }
}
