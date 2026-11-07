import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createChatgptArchive } from '../lib/chatgpt-archive.mjs'
import { makeCtx } from './_support/fake-host.mjs'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'archive-documents-'))
  const backup = join(root, 'backup')
  await mkdir(backup)
  const message = (id, parent, role, text, time) => ({ id, parent, message: { id, author: { role },
    content: { content_type: 'text', parts: [text] }, create_time: time } })
  const chat = { id: 'origin-chat', title: 'Synthetic research request', current_node: 'later',
    conversation_template_id: 'g-p-research', update_time: 200, mapping: {
      user: message('user', null, 'user', 'Research the synthetic topic', 100),
      launch: message('launch', 'user', 'assistant', 'Deep Research has started', 101),
      later: message('later', 'launch', 'user', 'A follow-up question', 200),
    } }
  await writeFile(join(backup, 'conversations.json'), JSON.stringify([chat]))
  const report = { title: 'Synthetic independent report', widget_state: { status: 'completed', report_message: {
    id: 'report-message', author: { role: 'assistant' }, create_time: 150,
    content: { parts: ['# Synthetic report\n\n独立报告正文 星河 检索测试。citeturn1search0'] },
    metadata: { content_references: [{ matched_text: 'citeturn1search0', items: [{ title: 'Source', url: 'https://example.org/paper' }] }] },
  } }, activity_messages: [], source_searches: [] }
  const library = [
    { file_id: 'file-report', file_name: report.title, mime_type: 'application/json', library_artifact_type: 'deep_research_report', origination_thread_id: chat.id, origination_message_id: 'report-message' },
    { file_id: 'file-notes', file_name: 'Notes.md', mime_type: 'text/markdown', origination_thread_id: chat.id },
    { file_id: 'file-image', file_name: '星河示意图.png', mime_type: 'image/png' },
    { file_id: 'file-orphan', file_name: 'Orphan report', mime_type: 'application/json', library_artifact_type: 'deep_research_report', origination_thread_id: 'absent-chat' },
  ]
  await writeFile(join(backup, 'library_files.json'), JSON.stringify(library))
  await writeFile(join(backup, 'file-report.dat'), JSON.stringify(report))
  await writeFile(join(backup, 'file-orphan.dat'), JSON.stringify({ ...report, title: 'Orphan report' }))
  await writeFile(join(backup, 'file-notes.dat'), '# Notes\n\n附件内容 星河')
  await writeFile(join(backup, 'file-image.dat'), Buffer.from([137, 80, 78, 71]))
  await mkdir(join(backup, 'pages', 'page-one', 'content'), { recursive: true })
  await writeFile(join(backup, 'pages', 'page-one', 'content', 'current.json'), JSON.stringify({ projection: { title: '星河页面', materialized_search_text: '页面文字' } }))
  const env = makeCtx({}, { real: true })
  env.fs.resolve = async (path) => ({ displayPath: path, targetKey: await realpath(path).catch(() => path) })
  env.fs.readBytes = async (target) => readFile(target.targetKey)
  const api = createChatgptArchive(env.ctx, join(root, 'state'))
  const archive = await api.request({ op: 'open', path: backup })
  return { backup, api, archive, report, persistence: env.persistence }
}

test('scoped search finds report and attachment bodies without treating them as chat text', async () => {
  const { api, archive } = await fixture()
  await api.request({ op: 'index', archiveId: archive.id, wait: true })
  const search = (scope, query = '星河') => api.request({ op: 'search', archiveId: archive.id, scope, query })
  assert.equal((await search('chats')).total, 0)
  assert.equal((await search('documents')).total, 3)
  assert.equal((await search('images')).total, 1)
  assert.equal((await search('attachments')).total, 4)
  assert.equal((await search('pages')).total, 1)
  const all = await search('all')
  assert.equal(all.total, 5)
  assert.equal(new Set(all.rows.map(r => r.key)).size, 5)
  assert.equal(all.counts.documents, 3)
  const ranked = await search('documents', '独立报告正文 星河')
  assert.deepEqual(ranked.rows.map(r => r.matchedTermCount), [2, 2, 1])
  assert.equal(ranked.rows[0].indexStatus, 'indexed')
  const bodyOnly = await api.request({ op: 'search', archiveId: archive.id, scope: 'all', query: '星河', matchIn: 'body' })
  assert.equal(bodyOnly.rows.some(r => r.kind === 'image'), false)
  assert.equal(bodyOnly.rows.some(r => r.research), true)
  assert.ok(!JSON.stringify(all).includes('widget_state'))
  await assert.rejects(() => search('unknown'), /搜索范围/)
})

test('a new continuation includes the reports restored on its selected branch', async () => {
  const { api, archive, persistence } = await fixture()
  const list = await api.request({ op: 'list', archiveId: archive.id })
  const resumed = await api.request({ op: 'continue', archiveId: archive.id, key: list.rows[0].key })
  const events = JSON.stringify(persistence.sessions.get(resumed.sessionId).events)
  assert.match(events, /独立报告正文 星河/)
  assert.doesNotMatch(events, /Orphan report/)
  const repeated = await api.request({ op: 'continue', archiveId: archive.id, key: list.rows[0].key })
  assert.equal(repeated.sessionId, resumed.sessionId)
})

test('research reports are readable and attached using exported origin IDs, including orphan recovery', async () => {
  const { api, archive } = await fixture()
  const list = await api.request({ op: 'list', archiveId: archive.id })
  const detail = await api.request({ op: 'conversation', archiveId: archive.id, key: list.rows[0].key })
  assert.equal(detail.messages.find(m => m.id === 'launch').reports[0].title, 'Synthetic independent report')
  assert.equal(detail.messages.flatMap(m => m.reports || []).length, 1)
  const report = await api.request({ op: 'document', archiveId: archive.id, id: 'asset:file-report' })
  assert.match(report.text, /独立报告正文/)
  assert.match(report.text, /\[1\]\(https:\/\/example.org\/paper\)/)
  assert.doesNotMatch(report.text, /cite/)
  assert.equal(report.conversationKey, list.rows[0].key)
  assert.equal(report.refs[0].url, 'https://example.org/paper')
  const orphan = await api.request({ op: 'document', archiveId: archive.id, id: 'asset:file-orphan' })
  assert.equal(orphan.conversationKey, undefined)
  assert.match(orphan.text, /独立报告正文/)
  const earlier = await api.request({ op: 'conversation', archiveId: archive.id, key: list.rows[0].key, nodeId: 'user' })
  assert.equal(earlier.messages.flatMap(m => m.reports || []).length, 0)
})

test('project scope searches local renamed project names and pages remain independently readable', async () => {
  const { api, archive } = await fixture()
  await api.request({ op: 'rename', archiveId: archive.id, projectId: 'g-p-research', name: '星河项目' })
  const p = await api.request({ op: 'search', archiveId: archive.id, scope: 'projects', query: '星河' })
  assert.equal(p.rows[0].title, '星河项目')
  assert.equal(p.rows[0].kind, 'project')
  const page = await api.request({ op: 'document', archiveId: archive.id, id: 'pages/page-one' })
  assert.equal(page.text, '页面文字')
})

test('corrupt reports stay visible with an explicit indexing failure', async () => {
  const { api, archive, backup } = await fixture()
  await writeFile(join(backup, 'file-report.dat'), '{broken')
  const refreshed = await api.request({ op: 'open', path: backup })
  await api.request({ op: 'index', archiveId: refreshed.id, wait: true })
  const search = await api.request({ op: 'search', archiveId: archive.id, scope: 'documents', query: 'Synthetic independent' })
  assert.equal(search.rows[0].indexStatus, 'failed')
  assert.ok(search.rows[0].indexNote)
})
