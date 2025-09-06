import { WealthLevel, ActionType, PricingStrategy, TargetUser } from '../types/promotion.types.js'

export class PricingStrategyService {
  
  /**
   * 计算智能定价策略 - 基于用户价值、市场需求、内容质量
   */
  calculateDynamicPricing(
    targetWealthLevels: WealthLevel[],
    contentQuality: number,
    timeOfDay: number,
    region: string
  ): PricingStrategy {
    
    // 1. 基础价格 (COCO币 - 整数积分)
    const basePrices: Record<ActionType, number> = {
      'view': 1,           // 展示：1 COCO币
      'like': 2,           // 点赞：2 COCO币
      'unlike': 1,         // 取消点赞：1 COCO币
      'share': 6,          // 分享：6 COCO币 (传播价值高)
      'comment': 8,        // 评论：8 COCO币 (深度互动)
      'unlock': 15,        // 解锁：15 COCO币 (付费行为，最高价值)
      'promo_view': 1,     // 推广展示：1 COCO币
      'promo_click': 5,    // 推广点击：5 COCO币
      'promo_comment': 10, // 推广评论：10 COCO币 (推广互动更有价值)
      'follow': 12,        // 关注：12 COCO币 (建立长期关系)
    }
    
    // 2. 财富等级价值倍数 (高财富用户的行为更有价值)
    const wealthMultipliers: Record<WealthLevel, number> = {
      'foam': 0.5,         // 最低等级
      'plankton': 1.0,     // 基础倍数
      'crab': 1.5,         // 入门进阶
      'fish': 2.0,         // 小有资产
      'turtle': 3.0,       // 稳定用户 (有消费能力)
      'dolphin': 5.0,      // 高净值用户
      'shark': 8.0,        // 超高净值用户
      'whale': 12.0,       // 顶级用户 (极高商业价值)
      'giant_whale': 20.0, // 传奇级用户 (最高商业价值)
    }
    
    // 3. 时段需求倍数 (供需关系影响价格)
    const demandMultipliers = this.calculateDemandMultipliers(timeOfDay, region)
    
    // 4. 内容质量折扣 (优质内容获得价格优惠)
    const qualityDiscounts = this.calculateQualityDiscounts(contentQuality)
    
    return {
      basePrices,
      wealthMultipliers,
      demandMultipliers,
      qualityDiscounts
    }
  }
  
  /**
   * 计算特定用户的行为价格
   */
  calculateActionPrice(
    action: ActionType,
    targetUser: TargetUser,
    pricing: PricingStrategy,
    contentQuality: number
  ): number {
    const basePrice = pricing.basePrices[action]
    const wealthMultiplier = pricing.wealthMultipliers[targetUser.wealthLevel]
    const demandMultiplier = pricing.demandMultipliers[targetUser.location?.country || 'default'] || 1.0
    const qualityDiscount = pricing.qualityDiscounts[this.getQualityTier(contentQuality)]
    
    // 相关性调整 (相关性越高，价格越低，ROI更好)
    const relevanceDiscount = this.calculateRelevanceDiscount(targetUser.relevanceScore)
    
    const finalPrice = basePrice * 
                      wealthMultiplier * 
                      demandMultiplier * 
                      qualityDiscount * 
                      relevanceDiscount
                      
    return Math.ceil(finalPrice) // 向上取整，确保为正整数COCO币
  }
  
  /**
   * 计算时段和地区需求倍数
   */
  private calculateDemandMultipliers(timeOfDay: number, region: string): Record<string, number> {
    // 基于历史数据和实时需求计算
    const timeMultipliers = {
      // 工作时间 (9-18点) 商业内容需求高
      'business_hours': timeOfDay >= 9 && timeOfDay <= 18 ? 1.5 : 1.0,
      // 晚间 (19-23点) 娱乐内容需求高  
      'evening': timeOfDay >= 19 && timeOfDay <= 23 ? 1.3 : 1.0,
      // 周末需求较低
      'weekend': this.isWeekend() ? 0.8 : 1.0,
    }
    
    const regionMultipliers = {
      'CN': 1.2,    // 中国市场需求高
      'US': 1.5,    // 美国市场价值高
      'EU': 1.3,    // 欧洲市场稳定
      'default': 1.0
    }
    
    return {
      ...timeMultipliers,
      [region]: regionMultipliers[region] || regionMultipliers['default']
    }
  }
  
  /**
   * 计算内容质量折扣
   */
  private calculateQualityDiscounts(contentQuality: number): Record<string, number> {
    // 优质内容获得价格优惠，鼓励高质量推广
    if (contentQuality >= 90) {
      return { 'premium': 0.7 }      // 30% 折扣
    } else if (contentQuality >= 75) {
      return { 'high': 0.8 }         // 20% 折扣
    } else if (contentQuality >= 60) {
      return { 'medium': 0.9 }       // 10% 折扣
    } else {
      return { 'low': 1.2 }          // 20% 溢价 (低质量内容)
    }
  }
  
  /**
   * 计算相关性折扣
   */
  private calculateRelevanceDiscount(relevanceScore: number): number {
    // 相关性越高，推广效果越好，给予价格优惠
    if (relevanceScore >= 80) {
      return 0.8  // 高相关性，20% 折扣
    } else if (relevanceScore >= 60) {
      return 0.9  // 中等相关性，10% 折扣
    } else {
      return 1.1  // 低相关性，10% 溢价
    }
  }
  
  /**
   * 计算预算优化建议
   */
  calculateBudgetOptimization(
    totalBudget: number,
    targetWealthLevels: WealthLevel[],
    expectedActions: Record<ActionType, number>
  ): {
    recommendedAllocation: Record<WealthLevel, number>
    expectedOutcome: Record<ActionType, number>
    efficiencyScore: number
  } {
    // 基于不同财富等级的转化率和价值，优化预算分配
    const wealthLevelValues = {
      'giant_whale': { conversionRate: 0.25, averageValue: 100 },  // 最高转化，最高价值
      'whale': { conversionRate: 0.20, averageValue: 80 },         // 很高转化，很高价值
      'shark': { conversionRate: 0.15, averageValue: 60 },         // 高转化，高价值
      'dolphin': { conversionRate: 0.12, averageValue: 40 },       // 中高转化，中高价值
      'turtle': { conversionRate: 0.08, averageValue: 20 },        // 中等转化，中等价值
      'fish': { conversionRate: 0.06, averageValue: 12 },          // 中低转化，中低价值
      'crab': { conversionRate: 0.04, averageValue: 8 },           // 低转化，低价值
      'plankton': { conversionRate: 0.03, averageValue: 5 },       // 很低转化，很低价值
      'foam': { conversionRate: 0.02, averageValue: 3 },           // 最低转化，最低价值
    }
    
    // 计算每个财富等级的预期ROI
    const levelROIs = targetWealthLevels.map(level => {
      const stats = wealthLevelValues[level]
      const cost = this.calculateAverageCost(level)
      const expectedReturn = stats.conversionRate * stats.averageValue
      return {
        level,
        roi: expectedReturn / cost,
        allocation: 0 // 待计算
      }
    })
    
    // 按ROI分配预算 (更高ROI获得更多预算)
    const totalROI = levelROIs.reduce((sum, item) => sum + item.roi, 0)
    levelROIs.forEach(item => {
      item.allocation = (item.roi / totalROI) * totalBudget
    })
    
    const recommendedAllocation: Record<WealthLevel, number> = {}
    levelROIs.forEach(item => {
      recommendedAllocation[item.level] = item.allocation
    })
    
    return {
      recommendedAllocation,
      expectedOutcome: this.calculateExpectedOutcome(recommendedAllocation, wealthLevelValues),
      efficiencyScore: this.calculateEfficiencyScore(levelROIs)
    }
  }
  
  /**
   * 实时价格调整 (基于供需关系)
   */
  adjustPricesRealTime(
    basePrice: number,
    currentDemand: number,
    availableInventory: number,
    competitionLevel: number
  ): number {
    // 供需比例影响价格
    const supplyDemandRatio = availableInventory / Math.max(currentDemand, 1)
    let priceMultiplier = 1.0
    
    if (supplyDemandRatio < 0.5) {
      // 供不应求，价格上涨
      priceMultiplier = 1.5
    } else if (supplyDemandRatio > 2.0) {
      // 供过于求，价格下降
      priceMultiplier = 0.7
    }
    
    // 竞争程度影响 (同时推广的类似内容越多，价格越高)
    const competitionMultiplier = 1.0 + (competitionLevel * 0.3)
    
    return basePrice * priceMultiplier * competitionMultiplier
  }
  
  /**
   * 预算消耗预测
   */
  predictBudgetConsumption(
    budget: number,
    targetUsers: TargetUser[],
    pricing: PricingStrategy,
    duration: number
  ): {
    dailySpend: number[]
    totalSpend: number
    remainingBudget: number
    durationAdjustment?: number  // 建议调整推广时长
  } {
    const dailyTargetReach = Math.floor(targetUsers.length / duration)
    const dailySpends: number[] = []
    
    for (let day = 0; day < duration; day++) {
      const dayTargets = targetUsers.slice(day * dailyTargetReach, (day + 1) * dailyTargetReach)
      const daySpend = this.calculateDaySpend(dayTargets, pricing)
      dailySpends.push(daySpend)
    }
    
    const totalSpend = dailySpends.reduce((sum, spend) => sum + spend, 0)
    
    // 如果预算不足，建议调整时长
    let durationAdjustment: number | undefined
    if (totalSpend > budget) {
      durationAdjustment = Math.floor(duration * (budget / totalSpend))
    }
    
    return {
      dailySpend: dailySpends,
      totalSpend,
      remainingBudget: Math.max(0, budget - totalSpend),
      durationAdjustment
    }
  }
  
  // 辅助方法
  private calculateAverageCost(wealthLevel: WealthLevel): number {
    const baseCosts = {
      'giant_whale': 50,    // 最高成本 (50 COCO币)
      'whale': 30,          // 很高成本 (30 COCO币)
      'shark': 20,          // 高成本 (20 COCO币)
      'dolphin': 12,        // 中高成本 (12 COCO币)
      'turtle': 8,          // 中等成本 (8 COCO币)
      'fish': 5,            // 中低成本 (5 COCO币)
      'crab': 3,            // 低成本 (3 COCO币)
      'plankton': 2,        // 很低成本 (2 COCO币)
      'foam': 1,            // 最低成本 (1 COCO币)
    }
    return baseCosts[wealthLevel]
  }
  
  private calculateExpectedOutcome(
    allocations: Record<WealthLevel, number>,
    wealthStats: Record<WealthLevel, any>
  ): Record<ActionType, number> {
    // 基于预算分配和转化率计算预期结果
    const expectedViews = Object.entries(allocations).reduce((sum, [level, budget]) => {
      const cost = this.calculateAverageCost(level as WealthLevel)
      return sum + (budget / cost)
    }, 0)
    
    return {
      'view': Math.floor(expectedViews),
      'like': Math.floor(expectedViews * 0.02),      // 2% 点赞率
      'unlike': Math.floor(expectedViews * 0.005),   // 0.5% 取消点赞率
      'share': Math.floor(expectedViews * 0.008),    // 0.8% 分享率
      'comment': Math.floor(expectedViews * 0.005),  // 0.5% 评论率
      'unlock': Math.floor(expectedViews * 0.001),   // 0.1% 解锁率
      'promo_view': Math.floor(expectedViews),       // 推广展示 = 总展示
      'promo_click': Math.floor(expectedViews * 0.03), // 3% 推广点击率
      'promo_comment': Math.floor(expectedViews * 0.002), // 0.2% 推广评论率
      'follow': Math.floor(expectedViews * 0.003),   // 0.3% 关注率
    }
  }
  
  private calculateEfficiencyScore(levelROIs: any[]): number {
    // 计算预算分配的效率评分
    const avgROI = levelROIs.reduce((sum, item) => sum + item.roi, 0) / levelROIs.length
    return Math.min(100, avgROI * 20) // 归一化到0-100
  }
  
  private calculateDaySpend(targets: TargetUser[], pricing: PricingStrategy): number {
    return targets.reduce((sum, user) => {
      // 预测该用户的行为概率和对应成本
      const expectedActions = this.predictUserActions(user)
      const userCost = Object.entries(expectedActions).reduce((cost, [action, probability]) => {
        const actionPrice = this.calculateActionPrice(action as ActionType, user, pricing)
        return cost + (actionPrice * probability)
      }, 0)
      return sum + userCost
    }, 0)
  }
  
  private calculateActionPrice(action: ActionType, user: TargetUser, pricing: PricingStrategy): number {
    const basePrice = pricing.basePrices[action]
    const wealthMultiplier = pricing.wealthMultipliers[user.wealthLevel]
    const demandMultiplier = pricing.demandMultipliers[user.location?.country || 'default'] || 1.0
    
    return basePrice * wealthMultiplier * demandMultiplier
  }
  
  private predictUserActions(user: TargetUser): Record<ActionType, number> {
    // 基于用户财富等级和相关性预测行为概率
    const baseEngagement = user.engagementProbability
    const relevanceBonus = user.relevanceScore / 100
    
    return {
      'view': 1.0,  // 100% 会看到
      'like': baseEngagement * relevanceBonus * 0.3,
      'unlike': baseEngagement * relevanceBonus * 0.05,
      'share': baseEngagement * relevanceBonus * 0.15,
      'comment': baseEngagement * relevanceBonus * 0.1,
      'unlock': baseEngagement * relevanceBonus * 0.05,
      'promo_view': 1.0, // 100% 推广展示
      'promo_click': baseEngagement * relevanceBonus * 0.2,
      'promo_comment': baseEngagement * relevanceBonus * 0.08,
      'follow': baseEngagement * relevanceBonus * 0.08,
    }
  }
  
  private getQualityTier(quality: number): string {
    if (quality >= 90) return 'premium'
    if (quality >= 75) return 'high'
    if (quality >= 60) return 'medium'
    return 'low'
  }
  
  private isWeekend(): boolean {
    const day = new Date().getDay()
    return day === 0 || day === 6
  }
}
