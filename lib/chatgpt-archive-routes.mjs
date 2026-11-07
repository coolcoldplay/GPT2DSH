import { createChatgptArchive } from './chatgpt-archive.mjs'

export function registerChatgptArchive(ctx, webServer, registryDir) {
  const archive = createChatgptArchive(ctx, registryDir)
  return webServer.register({ kind: 'exact', path: '/api-import/chatgpt-archive', handler: async (req, res) => {
    try {
      // Requests must originate in the local Harness client. No CORS/preflight support.
      const peer = req.socket?.remoteAddress
      if (peer && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer)) throw new Error('档案功能仅允许本机访问。')
      if (req.method !== 'POST' || req.headers['x-dsh-archive'] !== '1'
        || !String(req.headers['content-type'] || '').startsWith('application/json')) throw new Error('无效的档案请求。')
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new Error('拒绝跨站档案请求。')
      const origin = req.headers.origin
      if (origin && origin !== 'null' && new URL(origin).host !== req.headers.host) throw new Error('档案请求来源不匹配。')
      const chunks = []
      let size = 0
      for await (const chunk of req) {
        size += Buffer.byteLength(chunk)
        if (size > 64 * 1024) throw new Error('档案请求过大。')
        chunks.push(chunk)
      }
      const input = JSON.parse(Buffer.concat(chunks.map((c) => Buffer.from(c))).toString() || '{}')
      const data = await archive.request(input)
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
      res.end(JSON.stringify({ ok: true, data }))
    } catch (err) {
      res.writeHead(400, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ ok: false, error: String(err.message || err) }))
    }
  } })
}
