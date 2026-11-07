import test from 'node:test'
import assert from 'node:assert/strict'
import { zipSync, strToU8 } from 'fflate'
import { extractArchiveDocument, archiveCitationText } from '../lib/chatgpt-archive-documents.mjs'

function pdf(text) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]
  let data = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((o, i) => { offsets.push(data.length); data += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = data.length
  data += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(data)
}

test('PDF text is extracted in an isolated worker without requiring a rendered page', async () => {
  const result = await extractArchiveDocument(pdf('Synthetic nebula report'), { name: 'report.pdf', mediaType: 'application/pdf' })
  assert.match(result.text, /Synthetic nebula report/)
  assert.equal(result.indexStatus, 'indexed')
})

test('Office text preserves Word paragraphs and spreadsheet shared strings and numeric values', async () => {
  const word = zipSync({ 'word/document.xml': strToU8('<w:document><w:p><w:r><w:t>研究记录</w:t></w:r></w:p><w:p><w:r><w:t>星河</w:t></w:r></w:p></w:document>') })
  const doc = await extractArchiveDocument(word, { name: 'notes.docx', mediaType: '' })
  assert.match(doc.text, /研究记录\n星河/)
  const sheet = zipSync({ 'xl/sharedStrings.xml': strToU8('<sst><si><t>星河样本</t></si></sst>'),
    'xl/worksheets/sheet1.xml': strToU8('<worksheet><row><c t="s"><v>0</v></c><c><v>42</v></c></row></worksheet>') })
  assert.match((await extractArchiveDocument(sheet, { name: 'samples.xlsx', mediaType: '' })).text, /星河样本\t42/)
})

test('HTML becomes searchable text, script bodies are excluded, and unsupported binaries are explicit', async () => {
  const html = await extractArchiveDocument(Buffer.from('<h1>星河 &amp; 月亮</h1><script>privateCode()</script><p>文档内容</p>'), { name: 'page.html', mediaType: 'text/html' })
  assert.match(html.text, /星河 & 月亮/)
  assert.doesNotMatch(html.text, /privateCode/)
  assert.equal((await extractArchiveDocument(Buffer.from([0, 1]), { name: 'archive.zip', mediaType: 'application/zip' })).indexStatus, 'name-only')
})

test('grouped research citations preserve secondary sources instead of linking every claim to the first URL', () => {
  const ref = { matched_text: 'citeturn1search0turn1search1', items: [{ title: 'Primary', url: 'https://example.org/one',
    supporting_websites: [{ title: 'Secondary', url: 'https://example.org/two' }, { title: 'Invalid', url: 'javascript:bad()' }],
    refs: [{ turn_index: 1, ref_type: 'search', ref_index: 0 }, { turn_index: 1, ref_type: 'search', ref_index: 1 }] }] }
  const result = archiveCitationText(ref.matched_text, [ref])
  assert.deepEqual(result.refs.map(r => r.title), ['Primary', 'Secondary'])
  assert.match(result.text, /\[1\].*\[2\]/)
  assert.doesNotMatch(result.text, /javascript/)
})
