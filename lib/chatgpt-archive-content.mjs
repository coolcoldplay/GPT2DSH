// Read-only archive projection. The branch resolver is shared with the upstream converter.
import { chatgptThread, chatgptChildren } from './convert/chatgpt.mjs'

export function archiveProjectId(conv) {
  return String(conv.project_id || conv.project?.id
    || (/^g-p-/.test(conv.conversation_template_id || '') ? conv.conversation_template_id : ''))
}

export function archiveProjectName(conv) {
  const gizmo = conv.gizmo?.id === archiveProjectId(conv) ? conv.gizmo : null
  const values = [conv.project_name, conv.project_title, conv.project?.name, conv.project?.title,
    conv.conversation_template?.name, conv.conversation_template?.title, gizmo?.name, gizmo?.display?.name]
  return values.find((v) => typeof v === 'string' && v.trim())?.trim().slice(0, 120) || ''
}

export function archiveImageType(name, mime = '') {
  if (/^image\/(png|jpeg|gif|webp)$/i.test(mime)) return mime.toLowerCase()
  const extension = String(name || '').split('.').at(-1).toLowerCase()
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' })[extension] || ''
}

export function archiveMessage(msg) {
  const content = msg.content || {}
  const texts = []
  const assets = []
  const visit = (part) => {
    if (typeof part === 'string') texts.push(part)
    else if (part && typeof part === 'object') {
      if (typeof part.text === 'string') texts.push(part.text)
      if (typeof part.asset_pointer === 'string') assets.push({ id: part.asset_pointer, kind: part.content_type || '', name: '' })
      if (part.audio_asset_pointer) visit(part.audio_asset_pointer)
    }
  }
  for (const part of content.parts || []) visit(part)
  if (typeof content.content === 'string') texts.push(content.content)
  for (const a of msg.metadata?.attachments || []) {
    if (a.id) assets.push({ id: a.id, name: a.name || '', kind: a.mime_type || '', mediaType: a.mime_type || '' })
  }
  const uniqueAssets = new Map()
  for (const asset of assets) {
    const key = archiveAssetId(asset.id) || asset.id
    const previous = uniqueAssets.get(key)
    uniqueAssets.set(key, { ...previous, ...asset, id: key, name: asset.name || previous?.name || '',
      kind: previous?.kind || asset.kind, mediaType: asset.mediaType || previous?.mediaType || archiveImageType(asset.name) })
  }
  const refs = []
  for (const ref of msg.metadata?.content_references || []) {
    for (const item of [...(ref.items || []), ...(ref.sources || [])]) {
      if (/^https?:\/\//i.test(item.url || '') && !refs.some((r) => r.url === item.url)) refs.push({ title: item.title || item.url, url: item.url })
    }
  }
  return { role: msg.author?.role || 'assistant', text: texts.join('\n').trim(), assets: [...uniqueAssets.values()], refs,
    reasoning: content.content_type === 'thoughts' || content.content_type === 'reasoning_recap' || msg.channel === 'analysis',
    model: msg.metadata?.model_slug || '', time: msg.create_time || null }
}

export function archiveConversation(conv, selectedNode) {
  const mapping = conv.mapping || {}
  if (selectedNode && !Object.hasOwn(mapping, selectedNode)) throw new Error('选中的对话分支已不存在，请刷新备份。')
  const children = chatgptChildren(mapping)
  const branches = Object.entries(mapping).filter(([, n]) => n && !children(n).length)
    .map(([id, n]) => ({ id, text: archiveMessage(n.message || {}).text.slice(0, 65) || '对话分支' }))
  if (conv.current_node && mapping[conv.current_node] && !branches.some((b) => b.id === conv.current_node)) {
    branches.unshift({ id: conv.current_node, text: '导出时选中的位置' })
  }
  const thread = chatgptThread(conv, selectedNode || conv.current_node)
  const messages = thread.map((n) => ({ id: n.id, ...archiveMessage(n.message) }))
    .filter((m) => m.text || m.assets.length)
  return { id: String(conv.id || conv.conversation_id), title: conv.title || '未命名对话',
    selectedNode: selectedNode || conv.current_node || thread.at(-1)?.id, currentNode: conv.current_node,
    branches, messages, projectId: archiveProjectId(conv) }
}

export function archiveSummary(conv, file, key) {
  const nodes = Object.values(conv.mapping || {}).filter((n) => n?.message)
  const messages = nodes.map((n) => archiveMessage(n.message))
  return { key, id: String(conv.id || conv.conversation_id || key), title: conv.title || '未命名对话', file,
    projectId: archiveProjectId(conv), projectName: archiveProjectName(conv), updated: conv.update_time || conv.create_time || 0,
    created: conv.create_time || 0, archived: !!conv.is_archived, messages: nodes.length,
    search: [conv.title, ...messages.map((m) => m.text)].join('\n') }
}

export function archiveAssetId(value) {
  const s = String(value || '').replace(/^(?:file-service|sediment):\/\//, '').replace(/\.dat$/i, '')
  return /^[a-zA-Z0-9_-]+$/.test(s) ? s : null
}

export function archiveMediaType(bytes) {
  const b = Buffer.from(bytes)
  if (b.subarray(0, 4).equals(Buffer.from([137, 80, 78, 71]))) return 'image/png'
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg'
  if (b.subarray(0, 3).toString() === 'GIF') return 'image/gif'
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp'
  if (b.subarray(0, 4).toString() === '%PDF') return 'application/pdf'
  return 'application/octet-stream'
}
