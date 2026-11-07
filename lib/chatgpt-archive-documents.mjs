// Read-only document projections. No archive HTML/JS is executed and no remote resources are loaded.
import { extname } from 'node:path'
import { Worker } from 'node:worker_threads'
import { clearTimeout } from 'node:timers'
import { unzipSync } from 'fflate'
import { archiveMessage } from './chatgpt-archive-content.mjs'

export const ARCHIVE_TEXT_LIMIT = 1_000_000
const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.csv', '.tsv', '.json', '.html', '.htm', '.xml', '.yaml', '.yml', '.py', '.js', '.mjs', '.ts', '.tsx', '.jsx', '.css', '.tex', '.patch', '.log', '.cmd', '.sh', '.svg'])
const OFFICE_EXTENSIONS = new Set(['.docx', '.xlsx', '.pptx', '.ppsx'])

export function archiveFileCategory(asset) {
  if (asset.artifactType === 'deep_research_report') return 'document'
  if (/^image\//.test(asset.mediaType) || /\.(png|jpe?g|gif|webp|svg)$/i.test(asset.name)) return 'image'
  const ext = extname(asset.name).toLowerCase()
  return TEXT_EXTENSIONS.has(ext) || OFFICE_EXTENSIONS.has(ext) || ext === '.pdf'
    || /^(text\/|application\/(json|pdf))/.test(asset.mediaType) ? 'document' : 'attachment'
}

export function archiveCitationText(text, references = []) {
  const urls = new Map()
  const replacements = new Map()
  const refs = []
  for (const ref of references) {
    const numbers = []
    for (const item of [...(ref.items || []), ...(ref.sources || [])]) {
      const group = []
      for (const source of [item, ...(item.supporting_websites || [])]) {
        if (!/^https?:\/\//i.test(source.url || '')) continue
        if (!urls.has(source.url)) {
          urls.set(source.url, refs.length + 1)
          refs.push({ title: source.title || source.url, url: source.url })
        }
        const n = urls.get(source.url)
        group.push(`[${n}](${source.url.replace(/[()\s]/g, c => encodeURIComponent(c))})`)
      }
      numbers.push(...group)
      for (const id of item.refs || []) replacements.set(`turn${id.turn_index}${id.ref_type}${id.ref_index}`, group.join(' '))
    }
    if (ref.matched_text && numbers.length) replacements.set(ref.matched_text, [...new Set(numbers)].join(' '))
  }
  const render = (raw, ids) => replacements.get(raw)
    || [...new Set(ids.split('').map(id => replacements.get(id)).filter(Boolean))].join(' ') || '〔引用〕'
  const rendered = String(text || '').replace(/cite([^]+)/g, render)
    .replace(/<Cite\s+refs=\{(\[[^\]]*\])\}\s*\/>/g, (raw, ids) => {
      try { return render(raw, JSON.parse(ids).join('')) } catch { return '〔引用〕' }
    }).replace(/<Entity\b[^>]*\bvalue="([^"]*)"[^>]*\/>/g, '$1')
    .replace(/<AsyncImage\b[^>]*\/>/g, '[图片：此远程图片未包含在备份中]')
    .replace(/\[\$app\]\(app:\/\/connector_openai_deep_research\)/g, '**深度研究**')
  return { text: rendered, refs }
}

export function archiveResearchReport(data) {
  const message = data?.widget_state?.report_message
  if (!message?.content) throw new Error('研究报告未包含正文，可能尚未完成。')
  const plain = archiveMessage(message)
  if (!plain.text) throw new Error('研究报告正文为空。')
  const cited = archiveCitationText(plain.text, message.metadata?.content_references)
  return { ...cited, title: data.title, time: message.create_time || 0,
    reportMessageId: message.id, research: true, status: data.widget_state.status || 'completed',
    activityCount: data.activity_messages?.length || 0, sourceCount: data.source_searches?.length || 0,
    format: 'markdown', indexStatus: 'indexed', indexNote: '' }
}

function entities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (s, x) => {
    if (x[0] !== '#') return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[x.toLowerCase()] || s
    const n = x[1].toLowerCase() === 'x' ? parseInt(x.slice(2), 16) : Number(x.slice(1))
    return n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : s
  })
}

function plainXml(xml) {
  return entities(xml.replace(/<\/(?:w:p|a:p|p|div|tr|row|h[1-6])>/gi, '\n')
    .replace(/<\/(?:w:tc|td|th|c)>/gi, '\t').replace(/<[^>]*>/g, ''))
}

function officeText(bytes, ext) {
  let expanded = 0
  const files = unzipSync(bytes, { filter: (f) => {
    const wanted = ext === '.docx' ? /^word\/(document|footnotes|endnotes|header\d+|footer\d+)\.xml$/.test(f.name)
      : ext === '.xlsx' ? /^xl\/(sharedStrings|workbook|worksheets\/sheet\d+)\.xml$/.test(f.name)
        : /^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/.test(f.name)
    if (!wanted) return false
    expanded += f.originalSize
    if (f.originalSize > 16 * 1024 * 1024 || expanded > 32 * 1024 * 1024) throw new Error('文档解压后的文本超过读取上限。')
    return true
  } })
  if (!Object.keys(files).length) throw new Error('未找到可读取的 Office 文档内容。')
  const decode = b => Buffer.from(b).toString('utf8')
  if (ext !== '.xlsx') return Object.keys(files).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(k => plainXml(decode(files[k]))).join('\n\n')
  const strings = [...decode(files['xl/sharedStrings.xml'] || []).matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(m => plainXml(m[1]))
  return Object.keys(files).filter(k => /^xl\/worksheets\//.test(k)).sort().map(k => {
    const rows = [...decode(files[k]).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)]
    return rows.map(r => [...r[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map(c => {
      const value = /<v>([\s\S]*?)<\/v>/.exec(c[2])?.[1]
      return /\bt="s"/.test(c[1]) ? strings[Number(value)] || '' : value !== undefined ? entities(value) : plainXml(c[2])
    }).join('\t')).join('\n')
  }).join('\n\n')
}

function pdfText(bytes) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./chatgpt-archive-pdf-worker.mjs', import.meta.url), { workerData: { bytes: new Uint8Array(bytes), limit: ARCHIVE_TEXT_LIMIT },
      resourceLimits: { maxOldGenerationSizeMb: 192 } })
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('PDF 解析超过 20 秒，暂仅检索文件名。')) }, 20000)
    worker.once('message', result => { clearTimeout(timer); worker.terminate(); result.error ? reject(new Error(result.error)) : resolve(result) })
    worker.once('error', err => { clearTimeout(timer); reject(err) })
    worker.once('exit', code => { clearTimeout(timer); if (code) reject(new Error('PDF 解析进程未能完成。')) })
  })
}

export async function extractArchiveDocument(bytes, asset) {
  if (asset.artifactType === 'deep_research_report') return archiveResearchReport(JSON.parse(Buffer.from(bytes).toString('utf8')))
  const ext = extname(asset.name).toLowerCase()
  let text = '', format = 'plain', partial = false
  if (ext === '.pdf' || asset.mediaType === 'application/pdf') {
    const result = await pdfText(bytes)
    text = result.text; partial = result.partial
    if (!text.trim()) return { text: '', format, indexStatus: 'name-only', indexNote: 'PDF 未提取到文字层；尚未进行 OCR。' }
  } else if (OFFICE_EXTENSIONS.has(ext)) text = officeText(bytes, ext)
  else if (TEXT_EXTENSIONS.has(ext) || /^(text\/|application\/json)/.test(asset.mediaType)) {
    const data = Buffer.from(bytes)
    text = data[0] === 255 && data[1] === 254 ? data.subarray(2).toString('utf16le') : data.toString('utf8').replace(/^\uFEFF/, '')
    if (ext === '.html' || ext === '.htm' || asset.mediaType === 'text/html') {
      text = plainXml(text.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ''))
    }
    if (ext === '.md' || asset.mediaType === 'text/markdown') format = 'markdown'
  } else return { text: '', format, indexStatus: 'name-only', indexNote: '此格式仅支持文件名检索。' }
  partial ||= text.length > ARCHIVE_TEXT_LIMIT
  return { text: text.slice(0, ARCHIVE_TEXT_LIMIT).trim(), format, indexStatus: partial ? 'partial' : 'indexed',
    indexNote: partial ? '已索引前 100 万字符或前 300 页，余下内容请保存原文件查看。' : '' }
}
