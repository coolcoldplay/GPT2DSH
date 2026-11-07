// Parse ChatGPT's exported declarative components into a bounded, serializable view tree.
import { createRichEvaluator } from './chatgpt-rich-eval.mjs'

const TAGS = new Set(['box', 'row', 'grid', 'grid-item', 'text', 'title', 'caption', 'divider', 'table', 'table-row', 'table-cell',
  'button', 'checkbox', 'icon', 'form', 'label', 'radio-group', 'radio', 'slider'])
const PROPS = new Set(['border', 'radius', 'padding', 'gap', 'columns', 'color', 'background', 'weight', 'size', 'tabularNums',
  'justify', 'align', 'textAlign', 'flex', 'width', 'direction', 'block', 'submit', 'checked', 'value', 'min', 'max', 'step', 'name', 'variant', 'disabled'])

function braceEnd(source, start) {
  let depth = 0, quote = ''
  for (let i = start; i < source.length; i++) {
    const c = source[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = ''
    } else if (c === '"' || c === "'" || c === '`') quote = c
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i + 1
  }
  throw new Error('组件括号未闭合。')
}

function parseWidget(source, start) {
  let pos = start, depth = 0, nodes = 0
  const declaration = []
  const space = () => { while (/\s/.test(source[pos] || '') && pos < source.length) pos++ }
  space()
  while (source.startsWith('{@body', pos)) {
    const end = braceEnd(source, pos)
    declaration.push(source.slice(pos + 6, end - 1).trim())
    pos = end; space()
  }
  function conditional(expr) {
    const body = children(['{/if}', '{:else', '{#else'])
    let alternate = []
    if (!source.startsWith('{/if}', pos)) {
      const end = braceEnd(source, pos), header = source.slice(pos + 1, end - 1)
      pos = end
      if (/^[:#]else\s+if\s+/.test(header)) {
        alternate = [conditional(header.replace(/^[:#]else\s+if\s+/, ''))]
        return { type: 'if', expr, children: body, alternate }
      }
      alternate = children(['{/if}'])
    }
    if (!source.startsWith('{/if}', pos)) throw new Error('组件条件未闭合。')
    pos += 5
    return { type: 'if', expr, children: body, alternate }
  }
  function children(closing) {
    const result = []
    while (pos < source.length && !closing.some(s => source.startsWith(s, pos))) {
      if (++nodes > 3000) throw new Error('组件节点过多。')
      if (source.startsWith('{@body', pos)) {
        const end = braceEnd(source, pos)
        declaration.push(source.slice(pos + 6, end - 1).trim()); pos = end
      } else if (source.startsWith('{#each', pos) || source.startsWith('{#if', pos)) {
        const end = braceEnd(source, pos), header = source.slice(pos + 2, end - 1)
        pos = end
        if (header.startsWith('each ')) {
          const m = /^each\s+([\s\S]+)\s+as\s+([\w$]+)(?:\s*,\s*([\w$]+))?$/.exec(header)
          if (!m) throw new Error('无法识别组件循环。')
          const body = children(['{/each}'])
          if (!source.startsWith('{/each}', pos)) throw new Error('组件循环未闭合。')
          pos += 7; result.push({ type: 'each', expr: m[1], name: m[2], index: m[3], children: body })
        } else result.push(conditional(header.slice(3)))
      } else if (source[pos] === '<' && /^<[a-z]/.test(source.slice(pos))) result.push(element())
      else if (source[pos] === '{') {
        const end = braceEnd(source, pos)
        result.push({ type: 'expression', expr: source.slice(pos + 1, end - 1) }); pos = end
      } else {
        const begin = pos++
        while (pos < source.length && source[pos] !== '{' && !/^<\/?[a-z]/.test(source.slice(pos)) && !closing.some(s => source.startsWith(s, pos))) pos++
        result.push({ type: 'text', text: source.slice(begin, pos) })
      }
    }
    return result
  }
  function element() {
    if (++depth > 32) throw new Error('组件嵌套过深。')
    const match = /^<([a-z][a-z-]*)\b/.exec(source.slice(pos))
    if (!match) throw new Error('组件标签无法识别。')
    const tag = match[1]
    if (!TAGS.has(tag)) throw new Error('暂不支持组件：' + tag)
    pos += match[0].length
    const props = {}
    space()
    while (pos < source.length && source[pos] !== '>' && !source.startsWith('/>', pos)) {
      const attr = /^[\w-]+/.exec(source.slice(pos))?.[0]
      if (!attr) throw new Error('组件属性格式错误。')
      pos += attr.length; space()
      let value = { value: true }
      if (source[pos] === '=') {
        pos++; space()
        if (source[pos] === '{') {
          const end = braceEnd(source, pos)
          value = { expr: source.slice(pos + 1, end - 1) }; pos = end
        } else if (source[pos] === '"' || source[pos] === "'") {
          const quote = source[pos++], end = source.indexOf(quote, pos)
          if (end < 0) throw new Error('组件属性未闭合。')
          value = { value: source.slice(pos, end) }; pos = end + 1
        } else {
          const literal = /^[\w.-]+/.exec(source.slice(pos))?.[0]
          if (!literal) throw new Error('组件属性值无法识别。')
          value = { value: literal }; pos += literal.length
        }
      }
      if (!PROPS.has(attr) && !['onChange', 'onClick', 'onSubmit'].includes(attr)) throw new Error('暂不支持组件属性：' + attr)
      props[attr] = value; space()
    }
    let body = []
    if (source.startsWith('/>', pos)) pos += 2
    else {
      if (source[pos] !== '>') throw new Error('组件标签未闭合。')
      pos++
      const close = '</' + tag + '>'
      body = children([close])
      if (!source.startsWith(close, pos)) throw new Error('组件标签未闭合：' + tag)
      pos += close.length
    }
    depth--
    return { type: 'element', tag, props, children: body }
  }
  const tree = [element()]
  return { tree, declaration, end: pos }
}

function renderWidget(parsed, saved, action) {
  function render(state) {
    const evaluator = createRichEvaluator(state)
    for (const source of parsed.declaration) evaluator.declarations(source)
    const handlers = new Map()
    let count = 0
    const walk = (nodes, env) => {
      const result = []
      for (const n of nodes) {
        evaluator.tick()
        if (++count > 4000) throw new Error('组件展示内容超过上限。')
        if (n.type === 'each') {
          const array = evaluator.expression(n.expr, env)
          if (!Array.isArray(array) || array.length > 1000) throw new Error('组件循环范围不受支持。')
          array.forEach((value, i) => {
            const local = Object.create(env)
            local[n.name] = value
            if (n.index) local[n.index] = i
            result.push(...walk(n.children, local))
          })
        } else if (n.type === 'if') result.push(...walk(evaluator.expression(n.expr, env) ? n.children : n.alternate, env))
        else if (n.type === 'text' || n.type === 'expression') {
          const text = n.type === 'text' ? n.text : String(evaluator.expression(n.expr, env) ?? '')
          if (result.at(-1)?.tag === '#text') result.at(-1).text += text
          else result.push({ tag: '#text', text })
        } else {
          const props = {}, actions = {}
          for (const [name, prop] of Object.entries(n.props)) {
            const value = prop.expr !== undefined ? evaluator.expression(prop.expr, env) : prop.value
            if (name.startsWith('on')) {
              if (typeof value !== 'function') throw new Error('组件交互处理器无法识别。')
              const id = 'action-' + handlers.size
              handlers.set(id, value); actions[name] = id
            } else if (['string', 'number', 'boolean'].includes(typeof value)) props[name] = value
          }
          result.push({ tag: n.tag, props, actions, children: walk(n.children, env) })
        }
      }
      return result
    }
    return { tree: walk(parsed.tree, evaluator.env), evaluator, handlers }
  }
  let view = render(saved)
  let effects = []
  if (action) {
    if (!view.handlers.has(action.id)) throw new Error('组件操作已变化，请重新打开对话。')
    if (typeof action.value === 'object' || typeof action.value === 'string' && action.value.length > 10000) throw new Error('不支持的组件操作值。')
    view.evaluator.invoke(view.handlers.get(action.id), [action.value])
    effects = view.evaluator.effects
    view = render(view.evaluator.state)
  }
  return { tree: view.tree, state: view.evaluator.state, effects }
}

export function archiveRichParts(text, input = {}) {
  text = String(text || '')
  if (text.length > 250000) return [{ kind: 'text', text }]
  const fences = [...text.matchAll(/(^|\n)[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n[ \t]*\2[^\n]*|$)/g)].map(m => [m.index, m.index + m[0].length])
  const candidate = /\{@body\b|<(?:box|grid|row|table|form)\b/g
  const parts = []
  let cursor = 0, match
  while ((match = candidate.exec(text))) {
    if (fences.some(([a, b]) => match.index >= a && match.index < b)) continue
    if (match.index > cursor) parts.push({ kind: 'text', text: text.slice(cursor, match.index) })
    let parsed
    try {
      parsed = parseWidget(text, match.index)
      const options = input.part === parts.length ? input : {}
      parts.push({ kind: 'widget', ...renderWidget(parsed, options.state, options.action) })
    } catch (err) {
      parts.push({ kind: 'unsupported', error: err.message, source: text.slice(match.index, parsed?.end || text.length) })
    }
    cursor = parsed?.end || text.length
    candidate.lastIndex = cursor
  }
  if (cursor < text.length) parts.push({ kind: 'text', text: text.slice(cursor) })
  return parts.length ? parts : [{ kind: 'text', text }]
}
