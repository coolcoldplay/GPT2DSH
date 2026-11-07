// Deliberately small data-expression interpreter. Never eval/compile archived JavaScript.
import { parse, parseExpressionAt } from 'acorn'

const OPTIONS = { ecmaVersion: 2022 }
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor', 'caller', 'callee', 'arguments'])
const MAX_ARRAY = 2000

export function createRichEvaluator(saved = []) {
  if (!Array.isArray(saved) || JSON.stringify(saved).length > 65536) throw new Error('组件状态超过读取上限。')
  const state = []
  const effects = []
  const allowed = new WeakSet()
  let operations = 0
  let depth = 0
  const tick = () => { if (++operations > 100000) throw new Error('组件计算超过上限。') }
  const bound = value => {
    if (Array.isArray(value) && value.length > MAX_ARRAY || typeof value === 'string' && value.length > 200000) throw new Error('组件内容超过上限。')
    return value
  }
  const fn = f => { allowed.add(f); return f }
  const invoke = (f, args) => {
    tick()
    if (typeof f !== 'function' || !allowed.has(f)) throw new Error('此组件调用不受支持。')
    return bound(f(...args))
  }
  const env = Object.create(null)
  env.DIL = Object.freeze({ useState: fn(initial => {
    const index = state.length
    state.push(bound(index < saved.length ? saved[index] : initial))
    return [state[index], fn(value => { state[index] = bound(typeof value === 'function' ? invoke(value, [state[index]]) : value) })]
  }) })
  env.GenUI = Object.freeze({ copy: fn(text => { effects.push({ type: 'copy', text: String(text).slice(0, 200000) }) }),
    issueNewTurn: fn(text => { effects.push({ type: 'draft', text: String(text).slice(0, 200000) }) }) })
  env.Math = Object.freeze(Object.fromEntries(['min', 'max', 'round', 'floor', 'ceil', 'abs', 'sqrt', 'pow'].map(k => [k, fn((...args) => Math[k](...args))])))
  env.Number = fn(value => Number(value))
  env.String = fn(value => String(value))
  env.parseFloat = fn(value => parseFloat(value))
  env.parseInt = fn(value => parseInt(value, 10))

  function property(object, key) {
    if (FORBIDDEN.has(String(key)) || object === null || object === undefined) throw new Error('此组件属性不受支持。')
    if (Array.isArray(object) || typeof object === 'string') {
      if (key === 'length' || /^\d+$/.test(String(key))) return object[key]
      if (Array.isArray(object)) {
        if (['map', 'filter', 'flatMap', 'some', 'every', 'find', 'findIndex'].includes(key)) return fn(callback => object[key]((value, i) => invoke(callback, [value, i])))
        if (key === 'reduce') return fn((callback, initial) => object.reduce((acc, value, i) => invoke(callback, [acc, value, i]), initial))
        if (['includes', 'indexOf', 'join', 'slice', 'concat', 'flat'].includes(key)) return fn((...args) => object[key](...args))
      } else if (['includes', 'indexOf', 'slice', 'trim', 'toLowerCase', 'toUpperCase', 'split', 'startsWith', 'endsWith'].includes(key)) return fn((...args) => object[key](...args))
    }
    if (typeof object === 'number' && key === 'toFixed') return fn(n => object.toFixed(Math.max(0, Math.min(20, Number(n) || 0))))
    if (typeof object === 'object' && Object.hasOwn(object, key)) return object[key]
    throw new Error('此组件属性不受支持：' + String(key))
  }
  function bind(pattern, value, scope) {
    if (pattern.type === 'Identifier' && !FORBIDDEN.has(pattern.name)) scope[pattern.name] = value
    else if (pattern.type === 'ArrayPattern' && Array.isArray(value)) pattern.elements.forEach((p, i) => { if (p) bind(p, value[i], scope) })
    else throw new Error('此组件变量声明不受支持。')
  }
  function evaluate(n, scope = env) {
    tick()
    if (++depth > 70) { depth--; throw new Error('组件表达式嵌套过深。') }
    try {
      switch (n.type) {
        case 'Literal': if (n.regex || typeof n.value === 'bigint') throw new Error('不支持的文字类型。'); return n.value
        case 'Identifier': {
          if (n.name === 'undefined') return undefined
          if (FORBIDDEN.has(n.name) || !(n.name in scope)) throw new Error('此组件变量不受支持：' + n.name)
          return scope[n.name]
        }
        case 'ArrayExpression': return bound(n.elements.flatMap(e => !e ? [null] : e.type === 'SpreadElement' ? [...evaluate(e.argument, scope)] : [evaluate(e, scope)]))
        case 'ObjectExpression': {
          const value = Object.create(null)
          for (const p of n.properties) {
            if (p.type !== 'Property' || p.kind !== 'init' || p.method) throw new Error('不支持的对象声明。')
            const key = p.computed ? evaluate(p.key, scope) : p.key.name ?? p.key.value
            if (FORBIDDEN.has(String(key))) throw new Error('不支持的对象属性。')
            value[key] = evaluate(p.value, scope)
          }
          return value
        }
        case 'MemberExpression': return property(evaluate(n.object, scope), n.computed ? evaluate(n.property, scope) : n.property.name)
        case 'CallExpression': {
          const args = n.arguments.flatMap(a => a.type === 'SpreadElement' ? [...evaluate(a.argument, scope)] : [evaluate(a, scope)])
          if (args.length > MAX_ARRAY) throw new Error('组件参数过多。')
          return invoke(evaluate(n.callee, scope), args)
        }
        case 'ArrowFunctionExpression': return fn((...args) => {
          const local = Object.create(scope)
          n.params.forEach((p, i) => bind(p, args[i], local))
          if (n.body.type === 'BlockStatement') {
            for (const statement of n.body.body) {
              if (statement.type === 'ReturnStatement') return statement.argument ? evaluate(statement.argument, local) : undefined
              if (statement.type === 'VariableDeclaration') declare(statement, local)
              else if (statement.type === 'ExpressionStatement') evaluate(statement.expression, local)
              else throw new Error('不支持的组件语句。')
            }
            return undefined
          }
          return evaluate(n.body, local)
        })
        case 'TemplateLiteral': return bound(n.quasis.map((q, i) => q.value.cooked + (i < n.expressions.length ? String(evaluate(n.expressions[i], scope)) : '')).join(''))
        case 'ConditionalExpression': return evaluate(n.test, scope) ? evaluate(n.consequent, scope) : evaluate(n.alternate, scope)
        case 'LogicalExpression': {
          const left = evaluate(n.left, scope)
          return n.operator === '&&' ? left && evaluate(n.right, scope) : n.operator === '||' ? left || evaluate(n.right, scope) : left ?? evaluate(n.right, scope)
        }
        case 'UnaryExpression': {
          const value = evaluate(n.argument, scope)
          if (n.operator === '!') return !value
          if (n.operator === '-') return -value
          if (n.operator === '+') return +value
          if (n.operator === 'typeof') return typeof value
          throw new Error('不支持的组件运算。')
        }
        case 'BinaryExpression': {
          const left = evaluate(n.left, scope), right = evaluate(n.right, scope)
          switch (n.operator) {
            case '+': return bound(left + right)
            case '-': return left - right
            case '*': return left * right
            case '/': return left / right
            case '%': return left % right
            case '**': return left ** right
            case '>': return left > right
            case '<': return left < right
            case '>=': return left >= right
            case '<=': return left <= right
            case '===': case '==': return left === right
            case '!==': case '!=': return left !== right
            default: throw new Error('不支持的组件运算。')
          }
        }
        default: throw new Error('不支持的组件表达式：' + n.type)
      }
    } finally { depth-- }
  }
  function declare(node, scope = env) {
    if (node.type !== 'VariableDeclaration') throw new Error('组件只允许数据声明。')
    for (const d of node.declarations) bind(d.id, evaluate(d.init, scope), scope)
  }
  function expression(source, scope = env) {
    const node = parseExpressionAt(source, 0, OPTIONS)
    if (source.slice(node.end).trim()) throw new Error('组件表达式包含额外语句。')
    return evaluate(node, scope)
  }
  return { env, state, effects, invoke, tick, expression,
    declarations: source => parse(source, OPTIONS).body.forEach(node => declare(node)) }
}
