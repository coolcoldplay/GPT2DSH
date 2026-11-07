import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, realpath, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { createChatgptArchive } from '../lib/chatgpt-archive.mjs'
import { registerChatgptArchive } from '../lib/chatgpt-archive-routes.mjs'
import { archiveConversation, archiveMessage } from '../lib/chatgpt-archive-content.mjs'
import { convertChatgptJson, chatgptThread } from '../lib/convert/chatgpt.mjs'
import { makeCtx, makeWorkspaceRegistry } from './_support/fake-host.mjs'

const node = (id, parent, role, text, extra = {}) => ({ id, parent,
  message: { author: { role }, content: { content_type: 'text', parts: [text] }, create_time: 1700000000, ...extra } })
function conversation(id = 'synthetic-chat') {
  return { id, title: 'Synthetic branches', create_time: 1700000000, update_time: 1700000010,
    conversation_template_id: 'g-p-synthetic-project', current_node: 'a1', mapping: {
      root: { id: 'root', parent: null, message: null },
      u1: node('u1', 'root', 'user', 'First question'),
      a1: node('a1', 'u1', 'assistant', 'Selected older answer'),
      a2: node('a2', 'u1', 'assistant', 'Unselected newer answer'),
    } }
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-chatgpt-archive-'))
  const backup = join(root, 'backup')
  const registry = join(root, 'state')
  await mkdir(backup)
  const source = join(backup, 'conversations-000.json')
  await writeFile(source, JSON.stringify([conversation()]))
  const wr = makeWorkspaceRegistry()
  const create = wr.create.bind(wr)
  wr.create = async (path) => {
    const ws = await create(path)
    ws.setTitle = async (title) => { ws.title = title }
    return ws
  }
  const env = makeCtx({}, { real: true, workspaceRegistry: wr })
  env.fs.resolve = async (path) => ({ displayPath: path, targetKey: await realpath(path).catch(() => path) })
  env.fs.readBytes = async (target) => readFile(target.targetKey)
  const api = createChatgptArchive(env.ctx, registry)
  return { ...env, root, backup, registry, source, api, wr }
}

test('ChatGPT respects current_node in slim exports and selected branches match imported context', () => {
  const c = conversation()
  assert.deepEqual(chatgptThread(c).map((n) => n.id), ['u1', 'a1'])
  const detail = archiveConversation(c, 'a2')
  assert.deepEqual(detail.messages.map((m) => m.text), ['First question', 'Unselected newer answer'])
  const output = convertChatgptJson(JSON.stringify([c])).conversations[0]
  assert.match(JSON.stringify(output.events), /Selected older answer/)
  assert.doesNotMatch(JSON.stringify(output.events), /Unselected newer answer/)
  const all = convertChatgptJson(JSON.stringify([c]), { branch: 'all' }).conversations
  assert.equal(all.length, 2)
  assert.equal(all.find((s) => s.meta.sourceId === c.id).title, c.title)
})

test('image-only user turns remain present and corrupt parent cycles fail explicitly', () => {
  const c = conversation()
  c.mapping.u1.message.content = { content_type: 'multimodal_text', parts: [{ asset_pointer: 'file-service://file-example' }] }
  assert.match(JSON.stringify(convertChatgptJson(JSON.stringify([c]))), /file-example/)
  c.mapping.u1.parent = 'a1'
  assert.throws(() => chatgptThread(c), /cycle/)
  assert.throws(() => archiveConversation(conversation(), 'not-a-node'), /分支已不存在/)
})

test('one local image referenced by both message content and metadata is shown once with its name', () => {
  const message = archiveMessage({ author: { role: 'user' }, content: { parts: [
    { content_type: 'image_asset_pointer', asset_pointer: 'file-service://file-picture' },
  ] }, metadata: { attachments: [{ id: 'file-picture', name: 'picture.png', mime_type: 'image/png' }] } })
  assert.equal(message.assets.length, 1)
  assert.equal(message.assets[0].name, 'picture.png')
  assert.equal(message.assets[0].mediaType, 'image/png')
})

test('project names in conversation metadata are recovered; missing names get a clearly marked conversation title', async () => {
  const f = await fixture()
  const named = conversation()
  named.project = { id: named.conversation_template_id, name: 'Original research project' }
  const unnamed = conversation('another-project-chat')
  unnamed.conversation_template_id = 'g-p-other-project'
  unnamed.title = 'Local literature review'
  await writeFile(f.source, JSON.stringify([named, unnamed]))
  const a = await f.api.request({ op: 'open', path: f.backup })
  const original = a.projects.find((p) => p.id === named.conversation_template_id)
  const suggested = a.projects.find((p) => p.id === unnamed.conversation_template_id)
  assert.equal(original.name, 'Original research project')
  assert.equal(original.nameSource, 'export')
  assert.equal(suggested.name, 'Local literature review')
  assert.equal(suggested.nameSource, 'conversation-title')
  await f.api.request({ op: 'rename', archiveId: a.id, projectId: suggested.id, name: 'My project' })
  const reopened = await f.api.request({ op: 'open', path: f.backup })
  assert.equal(reopened.projects.find((p) => p.id === suggested.id).name, 'My project')
  assert.equal(reopened.projects.find((p) => p.id === suggested.id).nameSource, 'local')
})

test('local image metadata is exposed for automatic previews even when filenames use .dat', async () => {
  const f = await fixture()
  const c = conversation()
  c.mapping.u1.message.content.parts = [{ content_type: 'image_asset_pointer', asset_pointer: 'file-service://file-example' }]
  await writeFile(f.source, JSON.stringify([c]))
  await writeFile(join(f.backup, 'file-example.dat'), Buffer.from([137, 80, 78, 71, 0]))
  await writeFile(join(f.backup, 'library_files.json'), JSON.stringify([{ file_id: 'file-example', file_name: 'diagram.png', mime_type: 'image/png' }]))
  const a = await f.api.request({ op: 'open', path: f.backup })
  const { rows } = await f.api.request({ op: 'list', archiveId: a.id })
  const d = await f.api.request({ op: 'conversation', archiveId: a.id, key: rows[0].key })
  assert.equal(d.messages[0].assets[0].mediaType, 'image/png')
  assert.equal(d.messages[0].assets[0].previewable, true)
})

test('project renaming works before any continuation workspace exists and does not hide other registry errors', async () => {
  const f = await fixture()
  f.wr.resolveByPath = async (path) => { await realpath(path); return null }
  const a = await f.api.request({ op: 'open', path: f.backup })
  const input = { op: 'rename', archiveId: a.id, projectId: a.projects[0].id, name: 'Named before continuation' }
  const renamed = await f.api.request(input)
  assert.equal(renamed.projects[0].name, input.name)
  assert.deepEqual(await readdir(f.registry), ['chatgpt-archives.json'])
  const reopened = await createChatgptArchive(f.ctx, f.registry).request({ op: 'summary', archiveId: a.id })
  assert.equal(reopened.projects[0].name, input.name)
  f.wr.resolveByPath = async () => { throw Object.assign(new Error('workspace access denied'), { code: 'EACCES' }) }
  await assert.rejects(() => f.api.request({ ...input, name: 'Not saved' }), /workspace access denied/)
  assert.equal((await f.api.request({ op: 'summary', archiveId: a.id })).projects[0].name, input.name)
})

test('directory import indexes shards, searches all branches, retains project names and never copies the archive', async () => {
  const f = await fixture()
  const second = conversation('second-chat')
  delete second.conversation_template_id
  delete second.id
  await writeFile(join(f.backup, 'conversations-001.json'), JSON.stringify([second]))
  await writeFile(join(f.backup, 'user.json'), JSON.stringify({ message: 'not a conversation' }))
  const summary = await f.api.request({ op: 'open', path: f.root })
  assert.equal(summary.conversations, 2)
  assert.equal(summary.files, 2)
  assert.equal(summary.projects[0].count, 1)
  assert.equal(summary.projects[0].recoveredName, false)
  const matches = await f.api.request({ op: 'list', archiveId: summary.id, query: 'unselected newer' })
  assert.equal(matches.total, 2)
  const general = await f.api.request({ op: 'list', archiveId: summary.id, projectId: '__general' })
  assert.equal(general.total, 1)
  assert.equal((await f.api.request({ op: 'conversation', archiveId: summary.id, key: general.rows[0].key })).messages.length, 2)
  await f.api.request({ op: 'rename', archiveId: summary.id, projectId: summary.projects[0].id, name: 'Local project title' })
  const again = createChatgptArchive(f.ctx, f.registry)
  const reopened = await again.request({ op: 'summary', archiveId: summary.id })
  assert.equal(reopened.projects[0].name, 'Local project title')
  assert.deepEqual(await readdir(f.registry), ['chatgpt-archives.json'])
  assert.doesNotMatch(await readFile(join(f.registry, 'chatgpt-archives.json'), 'utf8'), /First question/)
})

test('archive search ranks distinct space-separated memory words across messages and branches', async () => {
  const f = await fixture()
  const multi = conversation('three-in-body')
  multi.title = '研究讨论'
  multi.mapping.u1.message.content.parts = ['讨论旅行实验']
  multi.mapping.a1.message.content.parts = ['随后记录咖啡馆观察']
  multi.mapping.a2.message.content.parts = ['另一分支讨论摄影']
  const titled = conversation('three-in-title')
  titled.title = '旅行、咖啡馆与摄影'
  titled.update_time = 1
  const two = conversation('two-in-title')
  two.title = '旅行与咖啡馆'
  const one = conversation('one-repeated')
  one.title = '摄影随访'
  one.mapping.u1.message.content.parts = ['摄影 '.repeat(100)]
  one.update_time = 2000000000
  const none = conversation('no-hit')
  await writeFile(f.source, JSON.stringify([one, none, two, multi, titled]))
  const a = await f.api.request({ op: 'open', path: f.backup })
  const result = await f.api.request({ op: 'list', archiveId: a.id, query: '旅行 咖啡馆 摄影' })
  assert.deepEqual(result.rows.map((r) => r.id), ['three-in-title', 'three-in-body', 'two-in-title', 'one-repeated'])
  assert.deepEqual(result.rows.map((r) => r.matchedTermCount), [3, 3, 2, 1])
  assert.deepEqual(result.terms, ['旅行', '咖啡馆', '摄影'])
  const repeated = await f.api.request({ op: 'list', archiveId: a.id, query: ' 旅行　旅行\t咖啡馆\n摄影 ' })
  assert.deepEqual(repeated.rows.map((r) => r.matchedTermCount), [3, 3, 2, 1])
  assert.deepEqual(repeated.terms, result.terms)
})

test('assets resolve locally with original names, and a changed source fails until refreshed', async () => {
  const f = await fixture()
  await writeFile(join(f.backup, 'file-example.dat'), Buffer.from([137, 80, 78, 71, 0]))
  await writeFile(join(f.backup, 'conversation_asset_file_names.json'), JSON.stringify({ 'file-example.dat': 'diagram.png' }))
  const c = conversation()
  c.mapping.u1.message.metadata = { attachments: [{ id: 'file-example', name: 'fallback' }, { id: 'file-missing' }] }
  await writeFile(f.source, JSON.stringify([c]))
  const a = await f.api.request({ op: 'open', path: f.backup })
  const { rows } = await f.api.request({ op: 'list', archiveId: a.id })
  const d = await f.api.request({ op: 'conversation', archiveId: a.id, key: rows[0].key })
  assert.equal(d.messages[0].assets[0].name, 'diagram.png')
  assert.equal(d.messages[0].assets[1].available, false)
  const image = await f.api.request({ op: 'asset', archiveId: a.id, assetId: 'file-service://file-example' })
  assert.equal(image.mediaType, 'image/png')
  assert.equal(Buffer.from(image.base64, 'base64').length, 5)
  await assert.rejects(() => f.api.request({ op: 'asset', archiveId: a.id, assetId: '../outside' }), /未包含/)
  await writeFile(f.source, JSON.stringify([conversation('replacement-chat')]))
  await assert.rejects(() => f.api.request({ op: 'conversation', archiveId: a.id, key: rows[0].key }), /已变化/)
})

test('continuing branches creates separate native sessions, reopens existing continuation, and titles project workspaces', async () => {
  const f = await fixture()
  const original = await readFile(f.source, 'utf8')
  const a = await f.api.request({ op: 'open', path: f.backup })
  const { rows } = await f.api.request({ op: 'list', archiveId: a.id })
  const input = { op: 'continue', archiveId: a.id, key: rows[0].key, nodeId: 'a1' }
  const first = await f.api.request(input)
  assert.equal(first.status, 'imported')
  const session = f.persistence.sessions.get(first.sessionId)
  assert.match(JSON.stringify(session.events), /Selected older answer/)
  assert.doesNotMatch(JSON.stringify(session.events), /Unselected newer answer/)
  const continued = { seq: session.events.length, type: 'session/title', data: { title: 'Continued locally' } }
  await f.persistence.append(first.sessionId, [continued])
  const repeat = await f.api.request(input)
  assert.equal(repeat.sessionId, first.sessionId)
  assert.equal(session.events.at(-1).data.title, 'Continued locally')
  const other = await f.api.request({ ...input, nodeId: 'a2' })
  assert.notEqual(other.sessionId, first.sessionId)
  assert.equal(f.persistence.sessions.size, 2)
  assert.equal(f.workspaces.size, 1)
  const ws = [...f.workspaces.values()][0]
  assert.equal(ws.title, 'Synthetic branches')
  await f.api.request({ op: 'rename', archiveId: a.id, projectId: a.projects[0].id, name: 'Renamed project' })
  assert.equal(ws.title, 'Renamed project')
  assert.equal(await readFile(f.source, 'utf8'), original)
  assert.ok((await stat(ws.path)).isDirectory())
})

test('archive routes reject cross-site and non-local reads and remove themselves on dispose', async () => {
  const f = await fixture()
  const dispose = registerChatgptArchive(f.ctx, f.ctx.webServer, f.registry)
  const route = f.ctx.webServer.defs.find((r) => r.path === '/api-import/chatgpt-archive')
  async function request(headers, peer = '127.0.0.1') {
    const req = Readable.from([Buffer.from('{"op":"status"}')])
    req.method = 'POST'
    req.headers = { 'content-type': 'application/json', 'x-dsh-archive': '1', host: 'localhost:3399', ...headers }
    req.socket = { remoteAddress: peer }
    const result = {}
    const res = { writeHead: (status) => { result.status = status }, end: (body) => { result.body = JSON.parse(body) } }
    await route.handler(req, res)
    return result
  }
  assert.equal((await request({})).status, 200)
  assert.equal((await request({ 'sec-fetch-site': 'cross-site' })).status, 400)
  assert.equal((await request({ origin: 'https://external.example' })).status, 400)
  assert.equal((await request({}, '192.0.2.1')).status, 400)
  assert.equal((await request({ 'x-dsh-archive': undefined })).status, 400)
  dispose()
  assert.equal(f.ctx.webServer.defs.length, 0)
})
