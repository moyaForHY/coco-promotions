import type { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'

function getSecret(): string {
  const s = process.env.PROMOTIONS_SHARED_SECRET || ''
  if (!s) throw new Error('PROMOTIONS_SHARED_SECRET is required')
  return s
}

export function verifySignature(req: Request, res: Response, next: NextFunction) {
  try {
    const svcId = String(req.header('x-service-id') || '')
    const ts = String(req.header('x-timestamp') || '')
    const nonce = String(req.header('x-nonce') || '')
    const sig = String(req.header('x-signature') || '')

    if (!svcId || !ts || !nonce || !sig) {
      return res.status(401).json({ code: 401, message: 'missing auth headers' })
    }
    const now = Date.now()
    const t = Number(ts)
    if (!Number.isFinite(t) || Math.abs(now - t) > 5 * 60 * 1000) {
      return res.status(401).json({ code: 401, message: 'timestamp out of window' })
    }
    const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body || {})
    const base = svcId + '|' + ts + '|' + nonce + '|' + payload
    const h = crypto.createHmac('sha256', getSecret()).update(base).digest('hex')
    if (!crypto.timingSafeEqual(Buffer.from(h), Buffer.from(String(sig)))) {
      return res.status(401).json({ code: 401, message: 'invalid signature' })
    }
    // TODO: add Redis-based replay protection for (svcId, ts, nonce)
    next()
  } catch (e) {
    return res.status(401).json({ code: 401, message: 'auth error' })
  }
}


