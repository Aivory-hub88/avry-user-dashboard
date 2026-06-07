export type BridgeResponse<T = unknown> = {
  error: boolean
  code?: string
  message?: string
  details?: unknown
} & T

export class BridgeError extends Error {
  code: string
  status: number
  details: unknown

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message)
    this.name = 'BridgeError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export async function callBridge<T = unknown>(
  path: string,
  payload: unknown,
): Promise<T> {
  const res = await fetch(`/api/bridge/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data: BridgeResponse<T> = await res.json()

  if (!res.ok || data.error) {
    console.error('Bridge error', {
      status: res.status,
      path,
      code: data.code,
      message: data.message,
      details: data.details,
    })
    throw new BridgeError(
      data.message ?? `Bridge error: ${data.code ?? res.status.toString()}`,
      data.code ?? 'UNKNOWN',
      res.status,
      data.details,
    )
  }

  return data as T
}
