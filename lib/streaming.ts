/**
 * SSE (Server-Sent Events) streaming utilities for console responses
 */

import { StreamChunk } from '@/types/console'

const MAX_FILE_MB = 10
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024

/**
 * Validate a file before sending. Returns an error string or null if OK.
 */
export function validateFileSize(sizeBytes: number, filename: string): string | null {
  if (sizeBytes > MAX_FILE_BYTES) {
    return `"${filename}" exceeds the ${MAX_FILE_MB} MB limit. Please use a smaller file.`
  }
  return null
}

/**
 * Streams console responses from the API endpoint using SSE.
 * Yields StreamChunk objects. The final chunk will always be type 'done'
 * (with receivedContent=true if tokens were streamed) or type 'error'.
 */
export async function* streamConsoleResponse(
  endpoint: string,
  payload: {
    session_id: string
    organization_id: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  }
): AsyncGenerator<StreamChunk, void, unknown> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let receivedContent = false

  // Client-side idle timeout: if no data arrives for 30s, abort
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let abortController: AbortController | null = null

  try {
    abortController = new AbortController()

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer)
      // FIXED: TIMEOUT INCREASE — raised from 30s to 120s for long AI responses
      idleTimer = setTimeout(() => {
        if (process.env.NODE_ENV === 'development') {
          console.error('[streaming] idle timeout: no data received for 120s')
        }
        abortController?.abort()
      }, 120000)
    }

    resetIdleTimer()

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: abortController.signal,
    })

    if (!response.ok) {
      if (idleTimer) clearTimeout(idleTimer)
      let errorMessage: string

      try {
        const errorJson = await response.json()
        errorMessage = errorJson.message || errorJson.error || `Server error ${response.status}`
        if (process.env.NODE_ENV === 'development') {
          console.error('[streaming] non-2xx response:', { status: response.status, body: errorJson })
        }
      } catch {
        errorMessage = `Server error ${response.status}: ${response.statusText}`
        if (process.env.NODE_ENV === 'development') {
          console.error('[streaming] non-2xx response (non-JSON):', { status: response.status, statusText: response.statusText })
        }
      }

      yield { type: 'error', error: errorMessage }
      return
    }

    if (!response.body) {
      if (idleTimer) clearTimeout(idleTimer)
      yield { type: 'error', error: 'Response body is empty' }
      return
    }

    reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()

      // Reset idle timer on any data
      resetIdleTimer()

      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim() || line.startsWith(':')) continue

        if (line.startsWith('data: ')) {
          const data = line.slice(6)

          try {
            const parsed = JSON.parse(data) as StreamChunk

            if (parsed.type === 'chunk' && parsed.content) {
              receivedContent = true
            }

            if (parsed.type === 'done') {
              // Annotate the upstream done with our receivedContent flag
              // so the caller knows whether tokens were actually streamed
              if (idleTimer) clearTimeout(idleTimer)
              yield { ...parsed, receivedContent } as StreamChunk & { receivedContent?: boolean }
              return
            }

            if (parsed.type === 'error') {
              // Normalise: VPS bridge uses 'content' for error text, we use 'error'
              const errorText = parsed.error || (parsed as any).content || 'Stream error'
              if (idleTimer) clearTimeout(idleTimer)
              yield { type: 'error', error: errorText }
              return
            }

            yield parsed
          } catch {
            // Non-JSON data line — treat as plain text token
            if (data.trim()) {
              receivedContent = true
              yield { type: 'chunk', content: data }
            }
          }
        } else if (line.startsWith('error: ')) {
          if (idleTimer) clearTimeout(idleTimer)
          yield { type: 'error', error: line.slice(7) }
          return
        }
      }
    }

    // Flush remaining buffer
    if (buffer.trim() && buffer.startsWith('data: ')) {
      const data = buffer.slice(6)
      try {
        const parsed = JSON.parse(data) as StreamChunk
        if (parsed.type === 'chunk' && parsed.content) receivedContent = true
        yield parsed
      } catch {
        if (data.trim()) {
          receivedContent = true
          yield { type: 'chunk', content: data }
        }
      }
    }

    if (idleTimer) clearTimeout(idleTimer)

    // Always emit a synthetic done so the caller knows the stream ended cleanly
    yield { type: 'done', receivedContent } as StreamChunk & { receivedContent?: boolean }

  } catch (error) {
    if (idleTimer) clearTimeout(idleTimer)

    const isAbort = error instanceof Error && error.name === 'AbortError'
    const errorMessage = isAbort
      ? 'Response timed out — no data received for 120 seconds. Try a shorter message.'
      : error instanceof Error ? error.message : 'Unknown connection error'

    if (process.env.NODE_ENV === 'development') {
      console.error('[streaming] caught error:', { isAbort, error })
    }

    yield { type: 'error', error: errorMessage }
  } finally {
    if (reader) {
      try { await reader.cancel() } catch { /* ignore */ }
    }
  }
}


// TYPEWRITER — client-side animation for console streaming
// Collect all chunk text, then re-emit with delay and accumulated content
const TYPEWRITER_STEP_MS = 40  // delay between pieces (ms)
const TYPEWRITER_CHARS = 10    // characters per piece

export async function* typewriterStream(
  source: AsyncIterable<StreamChunk>
): AsyncGenerator<StreamChunk> {
  let fullText = ''
  const nonChunkEvents: StreamChunk[] = []

  // Collect all chunk text from source first
  for await (const ev of source) {
    if (ev.type === 'chunk' && typeof ev.content === 'string') {
      fullText += ev.content
    } else {
      // Save non-chunk events (workflowspec, done, error) to emit after animation
      nonChunkEvents.push(ev)
      if (ev.type === 'error') {
        // If error, forward immediately and stop
        yield ev
        return
      }
    }
  }

  // Animate fullText per TYPEWRITER_CHARS characters with delay
  let displayed = ''
  for (let i = 0; i < fullText.length; i += TYPEWRITER_CHARS) {
    displayed += fullText.slice(i, i + TYPEWRITER_CHARS)
    yield { type: 'chunk', content: displayed } as StreamChunk
    await new Promise(resolve => setTimeout(resolve, TYPEWRITER_STEP_MS))
  }

  // Emit remaining events (workflowspec, done, etc) after animation
  for (const ev of nonChunkEvents) {
    yield ev
  }
}
