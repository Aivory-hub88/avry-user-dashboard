/**
 * Client-side file text extraction utility
 * Extracts readable text from PDF, DOCX, and plain text files
 * before sending to AIRA — never sends raw binary to the LLM.
 *
 * Debug logs prefixed with [fileExtractor] — check browser console.
 */

const MAX_CHARS = 6000

function truncate(text: string): string {
  if (text.length <= MAX_CHARS) return text
  console.log(`[fileExtractor] truncating content from ${text.length} to ${MAX_CHARS} chars`)
  return text.substring(0, MAX_CHARS) + '\n\n[Content truncated at 6,000 characters. File has more content.]'
}

export async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  console.log(`[fileExtractor] extracting: ${file.name} (${(file.size / 1024).toFixed(1)}KB, ext=${ext})`)

  try {
    let text: string

    if (ext === 'pdf') {
      text = await extractFromPDF(file)
    } else if (ext === 'docx' || ext === 'doc') {
      text = await extractFromDOCX(file)
    } else if (file.type.startsWith('image/')) {
      // Return base64 data URL for images — never call file.text() on binary
      text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      console.log(`[fileExtractor] image read as data URL: ${text.length} chars`)
    } else {
      // Plain text: txt, csv, md, json
      text = await file.text()
      console.log(`[fileExtractor] plain text read: ${text.length} chars`)
    }

    const result = truncate(text)
    console.log(`[fileExtractor] extraction complete: ${result.length} chars, preview: "${result.substring(0, 100)}"`)
    return result
  } catch (err) {
    console.error(`[fileExtractor] extraction failed for ${file.name}:`, err)
    throw err
  }
}

async function extractFromPDF(file: File): Promise<string> {
  console.log('[fileExtractor] starting PDF extraction...')

  // Load pdfjs from CDN via webpackIgnore — prevents webpack from bundling the worker
  // which causes "Object.defineProperty called on non-object" in Next.js
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — dynamic CDN import, no type definitions available
  const pdfjsLib = await import(/* webpackIgnore: true */ 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs')
  console.log('[fileExtractor] pdfjs loaded from CDN')

  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs'
  console.log('[fileExtractor] worker set to CDN worker')

  const arrayBuffer = await file.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)
  console.log(`[fileExtractor] PDF buffer size: ${uint8Array.length} bytes`)

  const loadingTask = pdfjsLib.getDocument({ data: uint8Array })
  const pdf = await loadingTask.promise
  console.log(`[fileExtractor] PDF loaded: ${pdf.numPages} pages`)

  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageText = textContent.items
      .filter((item: any) => 'str' in item)
      .map((item: any) => item.str ?? '')
      .join(' ')
    fullText += `\n[Page ${i}]\n${pageText}`
    console.log(`[fileExtractor] page ${i}/${pdf.numPages}: ${pageText.length} chars`)
  }

  const result = fullText.trim()
  console.log(`[fileExtractor] PDF total extracted: ${result.length} chars`)

  if (!result) return '[PDF has no extractable text content]'

  // Validate that extracted text is actually readable (not raw PDF binary)
  // Raw PDF binary contains markers like %PDF, endstream, endobj, BT/ET operators
  const looksLikeBinary = (
    result.startsWith('%PDF') ||
    /endstream\s+endobj/.test(result) ||
    /BT\s+\/F\d/.test(result) ||
    /stream\r?\n/.test(result)
  )

  if (looksLikeBinary) {
    console.warn('[fileExtractor] PDF extraction returned raw binary — falling back to error message')
    return '[PDF text could not be extracted. Please copy-paste the content manually.]'
  }

  // Check readability: at least 60% printable ASCII chars
  const printable = result.split('').filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127).length
  const ratio = printable / result.length
  console.log(`[fileExtractor] PDF readability ratio: ${(ratio * 100).toFixed(1)}%`)

  if (ratio < 0.6) {
    console.warn('[fileExtractor] PDF text has low readability ratio — likely binary garbage')
    return '[PDF text could not be extracted. Please copy-paste the content manually.]'
  }

  return result
}

async function extractFromDOCX(file: File): Promise<string> {
  console.log('[fileExtractor] starting DOCX extraction...')

  // Dynamic import keeps mammoth out of the initial bundle
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  console.log(`[fileExtractor] DOCX buffer size: ${arrayBuffer.byteLength} bytes`)

  const result = await mammoth.extractRawText({ arrayBuffer })
  console.log(`[fileExtractor] DOCX extracted: ${result.value.length} chars`)

  if (result.messages?.length) {
    console.warn('[fileExtractor] DOCX extraction warnings:', result.messages)
  }

  return result.value.trim() || '[DOCX has no extractable text content]'
}
