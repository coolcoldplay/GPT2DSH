import test from 'node:test'
import assert from 'node:assert/strict'
import { searchArchiveRecords } from '../lib/chatgpt-archive-search.mjs'

const row = (id, title, body = '', updated = 1, projectId = '') => ({ key: id, id, title,
  search: title + '\n' + body, updated, projectId, file: 'private-shard.json', position: 0 })

test('archive relevance counts unique query words before title weight, frequency or date', () => {
  const records = [row('single', '摄影', '摄影 '.repeat(1000), 100), row('body', '讨论记录', '旅行\n咖啡馆\n摄影', 50),
    row('title', '旅行 咖啡馆', '后来讨论摄影', 1), row('two', '旅行 咖啡馆', '', 200), row('none', '购物清单')]
  const result = searchArchiveRecords(records, { query: '摄影　旅行\t咖啡馆\n摄影' })
  assert.deepEqual(result.rows.map(r => r.id), ['title', 'body', 'two', 'single'])
  assert.deepEqual(result.rows.map(r => r.matchedTermCount), [3, 3, 2, 1])
  assert.deepEqual(result.terms, ['摄影', '旅行', '咖啡馆'])
})

test('equal matches use title hits then recent activity, with stable ties', () => {
  const records = [row('old', 'notes', 'term', 1), row('new', 'notes', 'term', 9),
    row('titled', 'TERM', '', 0), row('same-date', 'notes', 'Term', 9)]
  assert.deepEqual(searchArchiveRecords(records, { query: 'term' }).rows.map(r => r.id), ['titled', 'new', 'same-date', 'old'])
})

test('whitespace, case and literal punctuation follow the shared tokenizer', () => {
  const result = searchArchiveRecords([row('a', 'C++ API', 'GLYMPHATIC'), row('b', 'C patterns', 'api')], { query: ' C++\tAPI api\nGlymphatic ' })
  assert.deepEqual(result.terms, ['c++', 'api', 'glymphatic'])
  assert.deepEqual(result.rows.map(r => r.matchedTermCount), [3, 1])
  assert.match(result.rows[0].snippet, /C\+\+ API/)
  assert.match(result.rows[0].snippet, /GLYMPHATIC/)
  assert.equal(searchArchiveRecords([row('a', 'hello')], { query: '[.*]' }).total, 0)
})

test('empty search, project scope and title-only mode preserve browse semantics', () => {
  const records = [row('a', 'Notes', 'ultrasound', 2, 'p1'), row('b', 'Ultrasound plan', '', 1, 'p2'), row('c', 'General', '', 3)]
  assert.deepEqual(searchArchiveRecords(records, { query: ' \t　' }).rows.map(r => r.id), ['c', 'a', 'b'])
  assert.equal(searchArchiveRecords(records, { projectId: 'p1', query: 'ultrasound' }).rows[0].id, 'a')
  assert.equal(searchArchiveRecords(records, { projectId: '__general' }).rows[0].id, 'c')
  assert.equal(searchArchiveRecords(records, { titlesOnly: true, query: 'ultrasound' }).rows[0].id, 'b')
  assert.equal(searchArchiveRecords(records, { titlesOnly: true, projectId: 'p1', query: 'ultrasound' }).total, 0)
})

test('ranking is global before pagination and internal full text is never returned', () => {
  const records = Array.from({ length: 90 }, (_, i) => row(String(i), 'alpha', '', 1000-i))
  records.push(row('best', 'alpha beta gamma', '', 1))
  const first = searchArchiveRecords(records, { query: 'alpha beta gamma' })
  const second = searchArchiveRecords(records, { query: 'alpha beta gamma', offset: 80 })
  assert.equal(first.total, 91)
  assert.equal(first.rows[0].id, 'best')
  assert.equal(first.rows.length, 80)
  assert.equal(second.rows.length, 11)
  assert.equal(new Set([...first.rows, ...second.rows].map(r => r.id)).size, 91)
  assert.ok(!('search' in first.rows[0]) && !('file' in first.rows[0]) && !('position' in first.rows[0]))
  assert.ok(records[0].search)
})

test('snippets expose distant matching terms with original text and bounded excerpts', () => {
  const record = row('a', 'Research', '旅行' + '中间文字'.repeat(100) + '咖啡馆' + '更多文字'.repeat(100) + '摄影')
  const result = searchArchiveRecords([record], { query: '旅行 咖啡馆 摄影' }).rows[0]
  assert.equal(result.snippets.length, 3)
  for (const term of result.matchedTerms) assert.ok(result.snippet.includes(term))
  assert.ok(result.snippet.length < 350)
  assert.deepEqual(searchArchiveRecords([record]).rows[0].snippets, [])
})

test('excessive distinct terms fail explicitly instead of silently dropping search words', () => {
  assert.throws(() => searchArchiveRecords([], { query: Array.from({ length: 33 }, (_, i) => 't'+i).join(' ') }), /32/)
})
