import type { Request, Response } from 'express'
import { z } from 'zod'
import crypto from 'crypto'
import { query } from '../db.js'
import { PromotionOptimizerService } from '../services/promotion-optimizer.service.js'
import { PricingStrategyService } from '../services/pricing-strategy.service.js'
import { TargetingEngineService } from '../services/targeting-engine.service.js'
import { ExperienceProtectorService } from '../services/experience-protector.service.js'
import { PromotionRequest, WealthLevel } from '../types/promotion.types.js'

// 请求验证Schema
const CreatePromotionSchema = z.object({
  authorId: z.string().uuid(),
  postId: z.string().uuid(),
  budget: z.object({
    total: z.number().min(1).max(10000),      // 1-10000 COCO币
    dailyLimit: z.number().min(1).optional(),
    duration: z.number().min(1).max(30).default(7), // 1-30天，默认7天
  }),
  targeting: z.object({
    wealthLevels: z.array(z.enum(['foam', 'plankton', 'crab', 'fish', 'turtle', 'dolphin', 'shark', 'whale', 'giant_whale'])).min(1),
    preferredRegions: z.array(z.string()).optional(),
    excludeFollowers: z.boolean().default(false),
  }),
  goals: z.object({
    primary: z.enum(['investment', 'recognition', 'collaboration', 'networking', 'general']).default('general'),
    expectedReach: z.number().min(10).optional(),
    expectedEngagements: z.number().min(1).optional(),
  }).optional()
})

const EstimatePricingSchema = z.object({
  targetWealthLevels: z.array(z.enum(['foam', 'plankton', 'crab', 'fish', 'turtle', 'dolphin', 'shark', 'whale', 'giant_whale'])).min(1),
  budget: z.number().min(1).max(10000),
  duration: z.number().min(1).max(30).default(7),
  contentQuality: z.number().min(0).max(100).optional(),
})

export class PromotionController {
  
  constructor(
    private readonly promotionOptimizer: PromotionOptimizerService,
    private readonly pricingStrategy: PricingStrategyService,
    private readonly targetingEngine: TargetingEngineService,
    private readonly experienceProtector: ExperienceProtectorService
  ) {}
  
  /**
   * 创建推广 - 直接接受用户请求并开始执行
   */
  async createPromotion(req: Request, res: Response) {
    try {
      const requestData = CreatePromotionSchema.parse(req.body) as PromotionRequest
      
      // 强制设置7天上限
      requestData.budget.duration = Math.min(requestData.budget.duration, 7)
      
      // 创建推广并立即开始执行
      const promotionId = await this.startPromotionExecution(requestData)
      
      // 简单确认响应
      res.json({
        success: true,
        promotionId,
        message: '推广已开始执行',
        budget: {
          total: requestData.budget.total,
          duration: requestData.budget.duration,
          refundPolicy: '7天后自动退还剩余预算'
        },
        targeting: {
          wealthLevels: requestData.targeting.wealthLevels,
          estimatedReach: await this.estimateQuickReach(requestData)
        }
      })
      
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message || 'Invalid promotion request',
        code: 'PROMOTION_CREATE_ERROR'
      })
    }
  }

  /**
   * 开始执行推广
   */
  private async startPromotionExecution(request: PromotionRequest): Promise<string> {
    const promotionId = this.generatePromotionId()
    
    // 1. 记录推广请求
    await this.recordPromotionRequest(promotionId, request)
    
    // 2. 在用户框架内找到目标用户并开始投放
    await this.initiateDelivery(promotionId, request)
    
    // 3. 设置7天后的预算退还任务
    await this.scheduleRefundTask(promotionId, request.budget.total, 7)
    
    return promotionId
  }

  /**
   * 记录推广请求到数据库
   */
  private async recordPromotionRequest(promotionId: string, request: PromotionRequest): Promise<void> {
    await query(
      `INSERT INTO promotions (
        id, post_id, author_id, budget_total, duration_days, 
        target_wealth_levels, preferred_regions, exclude_followers,
        status, created_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        promotionId,
        request.postId,
        request.authorId,
        request.budget.total,
        request.budget.duration,
        JSON.stringify(request.targeting.wealthLevels),
        JSON.stringify(request.targeting.preferredRegions || []),
        request.targeting.excludeFollowers || false,
        'active',
        new Date(),
        new Date(Date.now() + request.budget.duration * 24 * 60 * 60 * 1000)
      ]
    )
  }

  /**
   * 启动推广投放
   */
  private async initiateDelivery(promotionId: string, request: PromotionRequest): Promise<void> {
    // 获取内容信息
    const content = await this.getContentInfo(request.postId)
    
    // 在用户框架内找到目标用户
    const targetUsers = await this.targetingEngine.findTargetsWithinFramework(content, request.targeting)
    
    // 应用体验保护过滤
    const protectedResult = await this.experienceProtector.protectUserExperience([content], targetUsers)
    
    // 创建投放队列
    await this.createDeliveryQueue(promotionId, protectedResult.approvedPromotions, targetUsers)
    
    console.log(`✅ Promotion ${promotionId} delivery initiated for ${targetUsers.length} users`)
  }

  /**
   * 创建投放队列
   */
  private async createDeliveryQueue(
    promotionId: string, 
    approvedPromotions: any[], 
    targetUsers: any[]
  ): Promise<void> {
    // 将目标用户分批加入投放队列，按时段分配
    const duration = 7 // 最多7天
    const usersPerDay = Math.ceil(targetUsers.length / duration)
    
    for (let day = 0; day < duration; day++) {
      const dayUsers = targetUsers.slice(day * usersPerDay, (day + 1) * usersPerDay)
      const deliveryDate = new Date(Date.now() + day * 24 * 60 * 60 * 1000)
      
      // 为每个用户创建投放记录
      for (const user of dayUsers) {
        await query(
          `INSERT INTO promotion_queue (
            promotion_id, user_id, scheduled_delivery, status, created_at
          ) VALUES ($1, $2, $3, $4, $5)`,
          [promotionId, user.userId, deliveryDate, 'scheduled', new Date()]
        )
      }
    }
  }

  /**
   * 设置预算退还任务
   */
  private async scheduleRefundTask(promotionId: string, totalBudget: number, maxDays: number): Promise<void> {
    const refundDate = new Date(Date.now() + maxDays * 24 * 60 * 60 * 1000)
    
    await query(
      `INSERT INTO refund_tasks (
        promotion_id, original_budget, refund_date, status, created_at
      ) VALUES ($1, $2, $3, $4, $5)`,
      [promotionId, totalBudget, refundDate, 'scheduled', new Date()]
    )
    
    console.log(`⏰ Refund task scheduled for promotion ${promotionId} on ${refundDate.toISOString()}`)
  }

  /**
   * 快速估算触达人数
   */
  private async estimateQuickReach(request: PromotionRequest): Promise<number> {
    const wealthLevelsStr = request.targeting.wealthLevels.map(w => `'${w}'`).join(',')
    
    const result = await query(
      `SELECT COUNT(*) as count
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE up.wealth_level IN (${wealthLevelsStr})
       AND u.created_at <= NOW() - INTERVAL '24 hours'`
    )
    
    const totalEligible = Number(result[0]?.count) || 0
    
    // 考虑频次限制和体验保护，实际触达约为候选用户的60-80%
    return Math.floor(totalEligible * 0.7)
  }

  private async getContentInfo(postId: string): Promise<any> {
    const result = await query(
      `SELECT p.*, u.username, u.country_code, u.region
       FROM posts p
       LEFT JOIN users u ON u.id = p.author_id
       WHERE p.id = $1`,
      [postId]
    )
    return result[0] || null
  }
  
  /**
   * 估算推广价格 - 用户设定框架前的价格预览
   */
  async estimatePricing(req: Request, res: Response) {
    try {
      const params = EstimatePricingSchema.parse(req.body)
      
      // 计算基于用户框架的定价
      const pricingStrategy = this.pricingStrategy.calculateDynamicPricing(
        params.targetWealthLevels,
        params.contentQuality || 70, // 默认中等质量
        new Date().getHours(),
        'CN'
      )
      
      // 计算预算优化建议
      const budgetOptimization = this.pricingStrategy.calculateBudgetOptimization(
        params.budget,
        params.targetWealthLevels,
        this.getDefaultExpectedActions()
      )
      
      // 预测消耗情况
      const consumptionPrediction = this.pricingStrategy.predictBudgetConsumption(
        params.budget,
        this.generateMockTargetUsers(params.targetWealthLevels, 100),
        pricingStrategy,
        params.duration
      )
      
      res.json({
        success: true,
        pricing: {
          basePrices: pricingStrategy.basePrices,
          wealthMultipliers: pricingStrategy.wealthMultipliers,
          estimatedCostPerUser: this.calculateEstimatedCostPerUser(params.targetWealthLevels, pricingStrategy),
        },
        budgetOptimization: {
          recommendedAllocation: budgetOptimization.recommendedAllocation,
          expectedOutcome: budgetOptimization.expectedOutcome,
          efficiencyScore: budgetOptimization.efficiencyScore,
        },
        consumption: consumptionPrediction,
        recommendations: this.generatePricingRecommendations(params, budgetOptimization)
      })
      
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message || 'Invalid pricing request',
        code: 'PRICING_ESTIMATE_ERROR'
      })
    }
  }
  
  /**
   * 获取推广效果报告
   */
  async getPromotionReport(req: Request, res: Response) {
    try {
      const { promotionId } = req.params
      
      if (!promotionId) {
        return res.status(400).json({
          success: false,
          error: 'Promotion ID is required',
          code: 'MISSING_PROMOTION_ID'
        })
      }
      
      // 获取推广效果数据 (实际实现需要从数据库查询)
      const performanceData = await this.getPromotionPerformance(promotionId)
      
      res.json({
        success: true,
        performance: performanceData,
        insights: this.generatePerformanceInsights(performanceData),
        optimizationSuggestions: this.generateOptimizationSuggestions(performanceData)
      })
      
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get promotion report',
        code: 'REPORT_ERROR'
      })
    }
  }
  
  // 辅助方法
  private calculateBudgetEfficiency(plan: any): number {
    const expectedROI = plan.expectedOutcome.expectedROI
    return Math.min(100, expectedROI * 20) // 归一化
  }
  
  private calculateTargetingQuality(plan: any): number {
    return plan.targeting.averageRelevance
  }
  
  private generateOptimizationSuggestions(plan: any): string[] {
    const suggestions: string[] = []
    
    if (plan.expectedOutcome.expectedROI < 1.5) {
      suggestions.push('考虑提高内容质量或调整目标人群以提升ROI')
    }
    
    if (plan.targeting.averageRelevance < 60) {
      suggestions.push('建议缩小目标人群范围，提高相关性')
    }
    
    if (plan.budget.total > 1000) {
      suggestions.push('大额预算建议分批投放，观察效果后调整')
    }
    
    return suggestions
  }
  
  private calculateEstimatedCostPerUser(
    wealthLevels: WealthLevel[],
    pricing: any
  ): Record<WealthLevel, number> {
    const costs: Record<WealthLevel, number> = {} as any
    
    wealthLevels.forEach(level => {
      const baseViewCost = pricing.basePrices.view
      const multiplier = pricing.wealthMultipliers[level]
      costs[level] = Number((baseViewCost * multiplier * 100).toFixed(2)) // 预估100次展示成本
    })
    
    return costs
  }
  
  private getDefaultExpectedActions(): Record<string, number> {
    return {
      'view': 1000,
      'click': 50,
      'like': 25,
      'comment': 8,
      'share': 15,
      'unlock': 3,
      'follow': 12,
    }
  }
  
  private generateMockTargetUsers(wealthLevels: WealthLevel[], count: number): any[] {
    // 生成模拟目标用户用于估算
    return Array.from({ length: count }, (_, i) => ({
      userId: `mock_${i}`,
      wealthLevel: wealthLevels[i % wealthLevels.length],
      relevanceScore: 60 + Math.random() * 30,
      engagementProbability: 0.3 + Math.random() * 0.4,
      influenceMultiplier: 1 + Math.random() * 2,
    }))
  }
  
  private generatePricingRecommendations(params: any, optimization: any): string[] {
    const recommendations: string[] = []
    
    // 基于预算和目标给出建议
    const budgetPerDay = params.budget / params.duration
    if (budgetPerDay < 10) {
      recommendations.push('建议增加每日预算至少到10 COCO币以获得更好效果')
    }
    
    if (params.targetWealthLevels.includes('Whale') && params.budget < 100) {
      recommendations.push('定向高净值用户建议预算至少100 COCO币')
    }
    
    if (optimization.efficiencyScore < 60) {
      recommendations.push('当前预算分配效率较低，建议调整财富等级组合')
    }
    
    return recommendations
  }
  
  private async getPromotionPerformance(promotionId: string): Promise<any> {
    // 实际实现需要查询推广效果数据
    return {
      promotionId,
      actualReach: 0,
      actualEngagements: 0,
      actualSpend: 0,
      costPerAction: {},
      goalAchievement: 0,
      userSatisfactionScore: 0,
      platformHealthImpact: 0
    }
  }
  
  private generatePerformanceInsights(performance: any): any[] {
    // 生成效果分析洞察
    return [
      {
        metric: 'reach_efficiency',
        value: performance.actualReach,
        benchmark: 'industry_average',
        insight: '触达效率分析'
      }
    ]
  }
}
