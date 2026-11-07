// In-memory archive search. Terms and highlighting share the same literal, whitespace-based
// tokenizer; distinct-term coverage always outranks title matches and recency.
import { highlightTerms } from './highlight.mjs'

function snippetsOf(text, terms) {
  const lower = text.toLowerCase()
  const windows = terms.map((term) => {
    const at = lower.indexOf(term)
    return at < 0 ? null : [Math.max(0, at - 36), Math.min(text.length, at + term.length + 60)]
  }).filter(Boolean).sort((a, b) => a[0] - b[0])
  const merged = []
  for (const window of windows) {
    const previous = merged.at(-1)
    if (previous && window[0] <= previous[1] && window[1] - previous[0] <= 180) previous[1] = Math.max(previous[1], window[1])
    else merged.push([...window])
  }
  // Three short extracts can show terms that occur in different turns. Wider queries still
  // expose every matched term separately in the result metadata.
  return merged.slice(0, 3).map(([start, end]) => (start ? '…' : '')
    + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : ''))
}

export function searchArchiveRecords(records, input = {}) {
  const terms = highlightTerms(input.query)
  if (terms.length > 32) throw new Error('一次最多输入 32 个不同关键词，请减少搜索词。')
  let ranked = []
  for (const record of records) {
    if (input.projectId && (input.projectId === '__general' ? !!record.projectId : record.projectId !== input.projectId)) continue
    const title = String(record.title || '')
    const full = String(record.search || title)
    const text = input.titlesOnly || input.matchIn === 'title' ? title : input.matchIn === 'body'
      ? full.startsWith(title + '\n') ? full.slice(title.length + 1) : full === title ? '' : full : full
    const lower = terms.length ? text.toLowerCase() : ''
    const matchedTerms = terms.filter((term) => lower.includes(term))
    if (terms.length && !matchedTerms.length) continue
    const lowerTitle = title.toLowerCase()
    ranked.push({ record, text, matchedTerms, titleMatchCount: matchedTerms.filter((term) => lowerTitle.includes(term)).length })
  }
  let counts
  if (input.scope) {
    counts = { all: ranked.length }
    for (const { record } of ranked) for (const scope of new Set(record.scopes || [])) counts[scope] = (counts[scope] || 0) + 1
    if (input.scope !== 'all') ranked = ranked.filter(({ record }) => record.scopes?.includes(input.scope))
  }
  ranked.sort((a, b) => b.matchedTerms.length - a.matchedTerms.length || b.titleMatchCount - a.titleMatchCount
    || (Number(b.record.updated) || 0) - (Number(a.record.updated) || 0))
  const offset = Math.max(0, Math.floor(Number(input.offset) || 0))
  return { terms, total: ranked.length, ...(counts ? { counts } : {}), rows: ranked.slice(offset, offset + 80).map(({ record, text, matchedTerms, titleMatchCount }) => {
    const { search, file, position, ...publicRecord } = record
    const snippets = terms.length ? snippetsOf(text, matchedTerms) : []
    return { ...publicRecord, matchedTerms, matchedTermCount: matchedTerms.length, titleMatchCount, snippets, snippet: snippets.join(' … ') }
  }) }
}
