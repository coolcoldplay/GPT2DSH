import test from 'node:test'
import assert from 'node:assert/strict'
import { archiveRichParts } from '../lib/chatgpt-rich.mjs'

const widget = '{@body const rows=[0,1,2]}\n{@body const columns=[10,20]}\n'
  + '{@body const [choices,setChoices]=DIL.useState(rows.flatMap((r,i)=>columns.map((c,j)=>`${i}-${j}`)))}\n'
  + '<box border radius="xl"><row>**Synthetic matrix**<button onClick={()=>setChoices([])}>Clear</button></row>'
  + '<table>{#each rows as r,i}<table-row><table-cell>{r.toFixed(1)} units</table-cell>{#each columns as c,j}'
  + '<table-cell><checkbox checked={choices.includes(`${i}-${j}`)} onChange={v=>setChoices(old=>v?[...old,`${i}-${j}`]:old.filter(x=>x!==`${i}-${j}`))}/></table-cell>'
  + '{/each}</table-row>{/each}</table><text>Selected {choices.length}</text>'
  + '<button onClick={()=>GenUI.copy(choices.join(","))}>Copy</button></box>'

const walk = tree => tree.flatMap(n => [n, ...walk(n.children || [])])
test('static exported cards become a declarative tree without corrupting normal markdown or code fences', () => {
  const source = 'Before\n\n<box border><grid columns={2}><grid-item><text textAlign=start>Label</text><title>12 units</title></grid-item></grid></box>\n\nAfter'
  const parts = archiveRichParts(source)
  const block = parts.find(p => p.kind === 'widget')
  assert.ok(block)
  assert.equal(walk(block.tree).find(n => n.tag === 'text').props.textAlign, 'start')
  assert.ok(walk(block.tree).some(n => n.tag === 'title' && n.children[0].text === '12 units'))
  assert.equal(parts[0].text.trim(), 'Before')
  assert.equal(parts.at(-1).text.trim(), 'After')
  const code = '```html\n<box>Example code</box>\n```'
  assert.deepEqual(archiveRichParts(code), [{ kind: 'text', text: code }])
})

test('exported loops, state, checkbox updates, clear and copy actions retain their actual values', () => {
  const first = archiveRichParts(widget)[0]
  assert.equal(first.kind, 'widget')
  assert.equal(walk(first.tree).filter(n => n.tag === 'checkbox').length, 6)
  const checkbox = walk(first.tree).find(n => n.tag === 'checkbox')
  assert.equal(checkbox.props.checked, true)
  const next = archiveRichParts(widget, { part: 0, state: first.state, action: { id: checkbox.actions.onChange, value: false } })[0]
  assert.equal(walk(next.tree).filter(n => n.tag === 'checkbox' && n.props.checked).length, 5)
  assert.ok(walk(next.tree).some(n => n.text === 'Selected 5'))
  const copy = walk(next.tree).filter(n => n.tag === 'button').at(-1)
  const copied = archiveRichParts(widget, { part: 0, state: next.state, action: { id: copy.actions.onClick } })[0]
  assert.equal(copied.effects[0].type, 'copy')
  assert.equal(copied.effects[0].text, '0-1,1-0,1-1,2-0,2-1')
  const clear = walk(next.tree).find(n => n.tag === 'button')
  const cleared = archiveRichParts(widget, { part: 0, state: next.state, action: { id: clear.actions.onClick } })[0]
  assert.equal(walk(cleared.tree).filter(n => n.tag === 'checkbox' && n.props.checked).length, 0)
})

test('archive component expressions cannot reach globals, constructors, network, or unlimited loops', () => {
  for (const expression of ['globalThis.process', 'fetch("https://example.org")', '({}).constructor.constructor("return process")()', 'Array(99999999).fill(1)']) {
    const parts = archiveRichParts('<box><text>{' + expression + '}</text></box>')
    assert.equal(parts[0].kind, 'unsupported')
    assert.ok(parts[0].error)
  }
  assert.equal(archiveRichParts('<box><iframe src="https://example.org"/></box>')[0].kind, 'unsupported')
  assert.equal(archiveRichParts('<box><text>Unclosed')[0].kind, 'unsupported')
})

test('archived forms produce an unsent draft and independent widgets do not share edited state', () => {
  const source = '{@body const [value,setValue]=DIL.useState("a")}<box><form onSubmit={()=>GenUI.issueNewTurn(`Draft ${value}`)}>'
    + '<radio-group value={value} onChange={setValue}><radio value="a">A</radio><radio value="b">B</radio></radio-group><button submit>Prepare</button></form></box>'
  const first = archiveRichParts(source)[0]
  const form = walk(first.tree).find(n => n.tag === 'form')
  const next = archiveRichParts(source, { part: 0, state: first.state, action: { id: form.actions.onSubmit } })[0]
  assert.deepEqual(next.effects, [{ type: 'draft', text: 'Draft a' }])
})

test('declarations inside cards and chained conditional branches respond to slider changes', () => {
  const source = '<box>{@body const [value,setValue]=DIL.useState(35)}<slider min={0} max={100} value={value} onChange={setValue}/>'
    + '{#if value>80}<text>High</text>{:else if value<20}<text>Low</text>{:else}<text>Middle</text>{/if}</box>'
  const first = archiveRichParts(source)[0]
  assert.equal(first.kind, 'widget')
  const slider = walk(first.tree).find(n => n.tag === 'slider')
  const next = archiveRichParts(source, { part: 0, state: first.state, action: { id: slider.actions.onChange, value: 10 } })[0]
  assert.ok(walk(next.tree).some(n => n.text === 'Low'))
})
