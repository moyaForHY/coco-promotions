import { createHmac } from 'node:crypto'

const base = process.env.PROMO_BASE_URL || 'http://localhost:4600'
const svcId = process.env.SERVICE_ID || 'coco-api'
const ts = Date.now().toString()
const nonce = Math.random().toString(36).slice(2)
const secret = process.env.PROMOTIONS_SHARED_SECRET || 'change_me_shared_secret'

const body = {
  page: 1,
  pageSize: 10,
  viewerId: process.env.VIEWER_ID || '00000000-0000-0000-0000-000000000000',
  context: { mode: 'hot', windowH: 72, seenPostIds: [], blockedAuthorIds: [] },
  desired: { total: 2 },
}
const payload = JSON.stringify(body)
const baseStr = `${svcId}|${ts}|${nonce}|${payload}`
const sig = createHmac('sha256', secret).update(baseStr).digest('hex')

const resp = await fetch(`${base.replace(/\/$/, '')}/promotions/fetch`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-service-id': svcId,
    'x-timestamp': ts,
    'x-nonce': nonce,
    'x-signature': sig,
  },
  body: payload,
})
const text = await resp.text()
console.log('STATUS', resp.status)
console.log(text)


