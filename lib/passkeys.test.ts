import { beforeEach, describe, expect, it, vi } from 'vitest'

const authedFetch = vi.fn()
const startRegistration = vi.fn()

vi.mock('./deployAuth', () => ({ authedFetch: (...a: unknown[]) => authedFetch(...a) }))
vi.mock('@simplewebauthn/browser', () => ({ startRegistration: (...a: unknown[]) => startRegistration(...a) }))

import { PasskeyCancelledError, addPasskey, listPasskeys, removePasskey } from './passkeys'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  authedFetch.mockReset()
  startRegistration.mockReset()
})

describe('passkeys', () => {
  it('lists the account passkeys', async () => {
    authedFetch.mockResolvedValue(json({ passkeys: [{ id: 1, name: 'Mac', created_at: null, last_used_at: null }] }))
    expect(await listPasskeys()).toHaveLength(1)
  })

  it('registers: options -> browser prompt -> verify with the challenge token', async () => {
    authedFetch
      .mockResolvedValueOnce(json({ options: { challenge: 'c' }, challenge_token: 'tok' }))
      .mockResolvedValueOnce(json({ ok: true }))
    startRegistration.mockResolvedValue({ id: 'cred' })

    await addPasskey('Mac · Chrome')

    expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: 'c' } })
    const verifyBody = JSON.parse(authedFetch.mock.calls[1][1].body)
    expect(verifyBody).toEqual({ challenge_token: 'tok', credential: { id: 'cred' }, name: 'Mac · Chrome' })
  })

  it('treats a dismissed prompt as a cancel, not an error, and never calls verify', async () => {
    authedFetch.mockResolvedValueOnce(json({ options: {}, challenge_token: 't' }))
    startRegistration.mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' }))
    await expect(addPasskey('x')).rejects.toBeInstanceOf(PasskeyCancelledError)
    expect(authedFetch).toHaveBeenCalledTimes(1)
  })

  it('surfaces the backend message when removing fails', async () => {
    authedFetch.mockResolvedValue(json({ detail: 'Passkey not found' }, 404))
    await expect(removePasskey(9)).rejects.toThrow('Passkey not found')
  })
})
