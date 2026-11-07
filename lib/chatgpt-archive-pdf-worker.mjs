// Isolate PDF parsing from the host event loop; only supplied bytes are read.
import { parentPort, workerData } from 'node:worker_threads'

let document
try {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  document = await getDocument({ data: workerData.bytes, isEvalSupported: false, useSystemFonts: false,
    disableFontFace: true, useWorkerFetch: false, verbosity: 0 }).promise
  let text = ''
  let pages = 0
  for (; pages < Math.min(document.numPages, 300) && text.length < workerData.limit; pages++) {
    const page = await document.getPage(pages + 1)
    const content = await page.getTextContent()
    text += content.items.map(item => item.str ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('') + '\n\n'
    page.cleanup()
  }
  parentPort.postMessage({ text: text.slice(0, workerData.limit), partial: pages < document.numPages || text.length > workerData.limit })
} catch (err) {
  parentPort.postMessage({ error: 'PDF 正文无法读取：' + err.message })
} finally {
  await document?.destroy()
}
