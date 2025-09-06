import 'dotenv/config'
import express from 'express'
import { verifySignature } from './middleware/signature.js'
import { query } from './db.js'
import { PromotionController } from './controllers/promotion.controller.js'
import { PromotionOptimizerService } from './services/promotion-optimizer.service.js'
import { PricingStrategyService } from './services/pricing-strategy.service.js'
import { TargetingEngineService } from './services/targeting-engine.service.js'
import { ExperienceProtectorService } from './services/experience-protector.service.js'
import { SchedulerService } from './services/scheduler.service.js'

const app = express()
app.use(express.json())

// 初始化服务
const pricingStrategy = new PricingStrategyService()
const targetingEngine = new TargetingEngineService()
const experienceProtector = new ExperienceProtectorService()
const promotionOptimizer = new PromotionOptimizerService(
  pricingStrategy,
  targetingEngine,
  experienceProtector
)

// 初始化控制器
const promotionController = new PromotionController(
  promotionOptimizer,
  pricingStrategy,
  targetingEngine,
  experienceProtector
)

// 健康检查
app.get('/health', (_req, res) => {
  res.json({ 
    status: 'ok',
    service: 'coco-promotions-v2',
    features: [
      'smart_pricing',
      'framework_targeting', 
      'experience_protection',
      'budget_optimization'
    ]
  })
})

// 新的智能推广API
app.post('/promotions/create', verifySignature, (req, res) => 
  promotionController.createPromotion(req, res)
)

app.post('/promotions/estimate', verifySignature, (req, res) => 
  promotionController.estimatePricing(req, res)
)

app.get('/promotions/:promotionId/report', verifySignature, (req, res) => 
  promotionController.getPromotionReport(req, res)
)

// 保持向后兼容的旧API - 使用原始实现
app.post('/promotions/fetch', verifySignature, async (req, res) => {
  try {
    const body = req.body
    const limit = Math.min(Math.max(body.desired?.total || 3, 0), 5)
    const seen = new Set(body.context?.seenPostIds || [])
    const blocked = new Set(body.context?.blockedAuthorIds || [])

    // 查询有推广预算的帖子
    const rows = await query<{ id: string; author_id: string; created_at: string; likes: number; replies: number; shares: number; unlocks_72h: number; target_wealth_levels: any; promo_budget_coco: number; promo_views: number; promo_clicks: number; likes_promo: number; comments_promo: number; shares_promo: number; unlocks_promo: number }>(
      `SELECT p.id, p.author_id, p.created_at, p.likes, p.replies, p.shares,
              COALESCE((SELECT COUNT(DISTINCT pu.user_id) FROM post_unlocks pu WHERE pu.post_id = p.id AND pu.created_at >= NOW() - INTERVAL '72 hours'), 0) AS unlocks_72h,
              p.target_wealth_levels,
              COALESCE(p.promo_budget_coco,0) AS promo_budget_coco,
              COALESCE((SELECT COUNT(1) FROM post_events pe WHERE pe.post_id = p.id AND pe.type = 'promo_view'),0) AS promo_views,
              COALESCE((SELECT COUNT(1) FROM post_events pe WHERE pe.post_id = p.id AND pe.type = 'promo_click'),0) AS promo_clicks,
              COALESCE((SELECT COUNT(1) FROM post_events pe WHERE pe.post_id = p.id AND pe.type = 'like' AND (pe.metadata->>'source') = 'promo'),0) AS likes_promo,
              COALESCE((SELECT COUNT(1) FROM post_events pe WHERE pe.post_id = p.id AND pe.type = 'comment' AND (pe.metadata->>'source') = 'promo'),0) AS comments_promo,
              COALESCE((SELECT COUNT(1) FROM post_events pe WHERE pe.post_id = p.id AND pe.type = 'share' AND (pe.metadata->>'source') = 'promo'),0) AS shares_promo,
              COALESCE((SELECT COUNT(1) FROM post_events pe WHERE pe.post_id = p.id AND pe.type = 'unlock' AND (pe.metadata->>'source') = 'promo'),0) AS unlocks_promo
       FROM posts p
       WHERE monetization_type IN ('promoted','premium_promoted')
         AND COALESCE(promo_budget_coco,0) > 0
         AND created_at >= NOW() - INTERVAL '72 hours'
       ORDER BY created_at DESC
       LIMIT 100`
    )

    // 打分和过滤
    const now = Date.now()
    const priceView = Number(process.env.PROMO_PRICE_VIEW || '1')
    const priceClick = Number(process.env.PROMO_PRICE_CLICK || '5')
    const priceLike = Number(process.env.PROMO_PRICE_LIKE || '2')
    const priceComment = Number(process.env.PROMO_PRICE_COMMENT || '8')
    const priceShare = Number(process.env.PROMO_PRICE_SHARE || '6')
    const priceUnlock = Number(process.env.PROMO_PRICE_UNLOCK || '10')

    const scored = rows
      .filter((r) => !seen.has(r.id) && !blocked.has(r.author_id))
      // 预算检查：若已花费 >= 预算，则不返回
      .filter((r) => {
        const spent =
          (r.promo_views || 0) * priceView +
          (r.promo_clicks || 0) * priceClick +
          (r.likes_promo || 0) * priceLike +
          (r.comments_promo || 0) * priceComment +
          (r.shares_promo || 0) * priceShare +
          (r.unlocks_promo || 0) * priceUnlock
        return spent < (r.promo_budget_coco || 0)
      })
      .filter((r) => {
        const vw = body.context?.wealth
        if (!vw) return true
        const raw = r.target_wealth_levels
        let arr: any[] | null = null
        if (Array.isArray(raw)) arr = raw
        else if (typeof raw === 'string') { try { const p = JSON.parse(raw); if (Array.isArray(p)) arr = p } catch {} }
        if (!arr || arr.length === 0) return true
        return arr.includes(vw)
      })
      .map((r) => {
        const ageH = Math.max(1, (now - new Date(r.created_at).getTime()) / 3600000)
        const WQ = Number(process.env.PROMO_W_QUALITY || '1')
        const WF = Number(process.env.PROMO_W_FRESH || '1')
        const WW = Number(process.env.PROMO_W_WEALTH || '1')
        const WU = Number(process.env.PROMO_W_UNLOCK || '8')
        const quality = (r.likes || 0) * 1 + (r.replies || 0) * 2 + (r.shares || 0) * 1.5 + (r.unlocks_72h || 0) * WU
        const freshness = 10 / ageH
        const raw = r.target_wealth_levels
        let arr: any[] = []
        if (Array.isArray(raw)) arr = raw
        else if (typeof raw === 'string') { try { const p = JSON.parse(raw); if (Array.isArray(p)) arr = p } catch {} }
        const wealthMatch = body.context?.wealth && arr.includes(body.context.wealth) ? 1 : 0
        const priority = WQ * quality + WF * freshness + WW * wealthMatch
        return { postId: r.id, authorId: r.author_id, priority, impToken: 'imp_' + r.id }
      })
      .sort((a, b) => b.priority - a.priority)
      .slice(0, limit)

    res.json({ items: scored, ttlSec: 30 })
  } catch (error: any) {
    res.status(400).json({ 
      code: 400, 
      message: error?.message || 'bad_request' 
    })
  }
})

// 启动定时任务 (暂时禁用，直到数据库表创建完成)
// const scheduler = new SchedulerService()
// scheduler.start()

const port = Number(process.env.PORT || 4600)
app.listen(port, () => {
  console.log(`🚀 COCO Promotions Service v2 running on port ${port}`)
  console.log(`📊 Features: Smart Pricing, Framework Targeting, Experience Protection`)
  console.log(`⏰ Auto-refund: 7天后自动退还剩余预算`)
  console.log(`🛡️ Experience Protection: 频次控制 + 质量保证`)
})

// 优雅关闭
process.on('SIGINT', () => {
  console.log('🛑 Shutting down gracefully...')
  // scheduler.stop()
  process.exit(0)
})

export default app
