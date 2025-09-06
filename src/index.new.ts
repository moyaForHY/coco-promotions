import 'dotenv/config'
import express from 'express'
import { verifySignature } from './middleware/signature.js'
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

// 保持向后兼容的旧API
app.post('/promotions/fetch', verifySignature, async (req, res) => {
  try {
    // 简化的兼容实现，调用新的系统
    const body = req.body
    const limit = Math.min(Math.max(body.desired?.total || 3, 0), 5)
    
    // 使用新的定向引擎
    const mockContent = { 
      id: 'legacy_request',
      target_wealth_levels: [body.context?.wealth || 'Plankton']
    }
    
    const targets = await targetingEngine.findTargetsWithinFramework(mockContent, {
      wealthLevels: [body.context?.wealth || 'Plankton'] as WealthLevel[],
    })
    
    // 返回兼容格式
    const items = targets.slice(0, limit).map((target, index) => ({
      postId: `promo_post_${index}`,
      authorId: target.userId,
      priority: target.relevanceScore,
      impToken: `imp_${target.userId}_${Date.now()}`
    }))
    
    res.json({ items, ttlSec: 30 })
    
  } catch (error: any) {
    res.status(400).json({ 
      code: 400, 
      message: error?.message || 'bad_request' 
    })
  }
})

// 启动定时任务
const scheduler = new SchedulerService()
scheduler.start()

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
  scheduler.stop()
  process.exit(0)
})

export default app
