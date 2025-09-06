import { query } from '../db.js'
import { PromotionRequest, PromotionPlan, TargetUser, BudgetAllocation } from '../types/promotion.types.js'
import { PricingStrategyService } from './pricing-strategy.service.js'
import { TargetingEngineService } from './targeting-engine.service.js'
import { ExperienceProtectorService } from './experience-protector.service.js'

export class PromotionOptimizerService {
  
  constructor(
    private readonly pricingStrategy: PricingStrategyService,
    private readonly targetingEngine: TargetingEngineService,
    private readonly experienceProtector: ExperienceProtectorService
  ) {}
  
  /**
   * 在用户框架内优化推广效果
   */
  async optimizePromotionWithinFramework(request: PromotionRequest): Promise<PromotionPlan> {
    
    // 1. 获取内容信息
    const content = await this.getContentInfo(request.postId)
    if (!content) {
      throw new Error('Post not found')
    }
    
    // 2. 在用户设定的财富等级框架内找到目标用户
    const targetUsers = await this.targetingEngine.findTargetsWithinFramework(content, request.targeting)
    
    // 3. 计算智能定价策略
    const pricingStrategy = this.pricingStrategy.calculateDynamicPricing(
      request.targeting.wealthLevels,
      this.assessContentQuality(content),
      new Date().getHours(),
      'CN' // 默认中国区域
    )
    
    // 4. 优化预算分配
    const budgetOptimization = this.pricingStrategy.calculateBudgetOptimization(
      request.budget.total,
      request.targeting.wealthLevels,
      this.estimateExpectedActions(targetUsers)
    )
    
    // 5. 应用用户体验保护
    const experienceProtection = await this.experienceProtector.protectUserExperience(
      [{ ...request, content }],
      targetUsers
    )
    
    // 6. 创建最优投放计划
    const deliverySchedule = this.createOptimalSchedule(
      targetUsers,
      request.budget.duration,
      budgetOptimization.recommendedAllocation
    )
    
    // 7. 预测推广效果
    const expectedOutcome = this.predictPromotionOutcome(
      content,
      targetUsers,
      budgetOptimization,
      pricingStrategy
    )
    
    return {
      promotionId: this.generatePromotionId(),
      postId: request.postId,
      authorId: request.authorId,
      budget: {
        total: request.budget.total,
        wealthLevelAllocations: budgetOptimization.recommendedAllocation,
        timeSlotAllocations: deliverySchedule.timeAllocations,
        actionPricing: pricingStrategy.basePrices
      },
      targeting: {
        primaryTargets: targetUsers.slice(0, Math.floor(targetUsers.length * 0.7)),
        secondaryTargets: targetUsers.slice(Math.floor(targetUsers.length * 0.7)),
        totalReach: targetUsers.length,
        averageRelevance: this.calculateAverageRelevance(targetUsers)
      },
      schedule: deliverySchedule,
      expectedOutcome,
      qualityProtection: experienceProtection.protectionReport
    }
  }
  
  /**
   * 创建最优投放时间表
   */
  private createOptimalSchedule(
    targetUsers: TargetUser[],
    duration: number,
    budgetAllocations: Record<string, number>
  ): any {
    
    // 分析目标用户的活跃时段
    const activityPatterns = this.analyzeUserActivityPatterns(targetUsers)
    
    // 按活跃度分配时段预算
    const hourlyAllocations = this.distributeByActivity(budgetAllocations, activityPatterns)
    
    // 生成每日投放计划
    const dailySchedule = []
    for (let day = 0; day < duration; day++) {
      const dayBudget = Object.values(budgetAllocations).reduce((sum, amount) => sum + amount, 0) / duration
      const dayTargets = this.selectDayTargets(targetUsers, day, duration)
      
      dailySchedule.push({
        day,
        budget: dayBudget,
        targets: dayTargets,
        hourlyDistribution: hourlyAllocations
      })
    }
    
    return {
      startTime: new Date(),
      endTime: new Date(Date.now() + duration * 24 * 60 * 60 * 1000),
      dailySchedule,
      timeAllocations: hourlyAllocations
    }
  }
  
  /**
   * 预测推广效果
   */
  private predictPromotionOutcome(
    content: any,
    targetUsers: TargetUser[],
    budgetOptimization: any,
    pricingStrategy: any
  ): any {
    
    const totalBudget = Object.values(budgetOptimization.recommendedAllocation).reduce((sum: number, amount: any) => sum + Number(amount), 0)
    
    // 基于用户质量和预算预测结果
    const averageRelevance = this.calculateAverageRelevance(targetUsers)
    const averageEngagementProb = targetUsers.reduce((sum, user) => sum + user.engagementProbability, 0) / targetUsers.length
    
    // 预测各项指标
    const estimatedViews = Math.floor(totalBudget / 0.002) // 平均每次展示成本
    const estimatedClicks = Math.floor(estimatedViews * averageEngagementProb * 0.1)
    const estimatedEngagements = Math.floor(estimatedViews * averageEngagementProb * 0.05)
    const estimatedFollows = Math.floor(estimatedViews * averageEngagementProb * 0.02)
    
    // 计算预期ROI
    const expectedBusinessValue = this.calculateExpectedBusinessValue(content, targetUsers)
    const expectedROI = expectedBusinessValue / totalBudget
    
    return {
      estimatedViews,
      estimatedClicks,
      estimatedEngagements,
      estimatedFollows,
      expectedROI,
      goalAchievementProbability: this.calculateGoalAchievementProbability(content, targetUsers, averageRelevance)
    }
  }
  
  /**
   * 分析用户活跃时段模式
   */
  private analyzeUserActivityPatterns(targetUsers: TargetUser[]): Record<number, number> {
    // 基于财富等级推断活跃时段 (简化实现)
    const patterns: Record<number, number> = {}
    
    // 初始化24小时
    for (let hour = 0; hour < 24; hour++) {
      patterns[hour] = 0.1 // 基础活跃度
    }
    
    // 根据用户财富等级调整活跃时段
    for (const user of targetUsers) {
      if (user.wealthLevel === 'Whale' || user.wealthLevel === 'Dolphin') {
        // 高净值用户：工作时间更活跃
        for (let hour = 9; hour <= 18; hour++) {
          patterns[hour] += 0.3
        }
      } else {
        // 普通用户：晚上更活跃
        for (let hour = 19; hour <= 23; hour++) {
          patterns[hour] += 0.2
        }
      }
    }
    
    // 归一化
    const maxActivity = Math.max(...Object.values(patterns))
    Object.keys(patterns).forEach(hour => {
      patterns[Number(hour)] = patterns[Number(hour)] / maxActivity
    })
    
    return patterns
  }
  
  /**
   * 按活跃度分配预算
   */
  private distributeByActivity(
    budgetAllocations: Record<string, number>,
    activityPatterns: Record<number, number>
  ): Record<string, number> {
    const totalBudget = Object.values(budgetAllocations).reduce((sum, amount) => sum + Number(amount), 0)
    const totalActivity = Object.values(activityPatterns).reduce((sum, activity) => sum + activity, 0)
    
    const hourlyAllocations: Record<string, number> = {}
    
    Object.entries(activityPatterns).forEach(([hour, activity]) => {
      const allocation = (activity / totalActivity) * totalBudget
      hourlyAllocations[`hour_${hour}`] = allocation
    })
    
    return hourlyAllocations
  }
  
  /**
   * 选择每日目标用户
   */
  private selectDayTargets(
    allTargets: TargetUser[],
    day: number,
    totalDays: number
  ): TargetUser[] {
    const usersPerDay = Math.ceil(allTargets.length / totalDays)
    const startIndex = day * usersPerDay
    const endIndex = Math.min(startIndex + usersPerDay, allTargets.length)
    
    return allTargets.slice(startIndex, endIndex)
  }
  
  // 辅助计算方法
  private calculateAverageRelevance(users: TargetUser[]): number {
    if (users.length === 0) return 0
    return users.reduce((sum, user) => sum + user.relevanceScore, 0) / users.length
  }
  
  private calculateExpectedBusinessValue(content: any, targetUsers: TargetUser[]): number {
    // 基于内容类型和目标用户预测商业价值
    const contentValue = this.assessContentBusinessPotential(content)
    const audienceValue = this.calculateAudienceBusinessValue(targetUsers)
    
    return contentValue * audienceValue * targetUsers.length * 0.01 // 转换为COCO币价值
  }
  
  private calculateGoalAchievementProbability(
    content: any,
    targetUsers: TargetUser[],
    averageRelevance: number
  ): number {
    const contentQuality = this.assessContentQuality(content)
    const audienceQuality = this.calculateAudienceQuality(targetUsers)
    
    // 综合评估目标达成概率
    const baseProbability = 0.4 // 40% 基础概率
    const qualityBonus = (contentQuality / 100) * 0.3
    const audienceBonus = (audienceQuality / 100) * 0.2
    const relevanceBonus = (averageRelevance / 100) * 0.1
    
    return Math.min(0.95, baseProbability + qualityBonus + audienceBonus + relevanceBonus)
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
  
  private assessContentQuality(content: any): number {
    const engagement = (content.likes || 0) + (content.replies || 0) * 2 + (content.shares || 0) * 3
    const textLength = (content.text || '').length
    const hasImages = !!(content.images && JSON.parse(content.images || '[]').length > 0)
    
    let quality = 20
    quality += Math.min(50, engagement)
    quality += textLength > 200 ? 20 : 10
    quality += hasImages ? 10 : 0
    
    return Math.min(100, quality)
  }
  
  private assessContentBusinessPotential(content: any): number {
    // 基于关键词和内容类型评估商业潜力
    const businessKeywords = ['投资', '合作', '创业', '项目', '商机', 'investment', 'partnership', 'startup', 'business']
    const text = (content.text || '').toLowerCase()
    
    const keywordMatches = businessKeywords.filter(keyword => text.includes(keyword)).length
    return Math.min(100, keywordMatches * 20 + 20) // 基础20分 + 关键词匹配
  }
  
  private calculateAudienceBusinessValue(targetUsers: TargetUser[]): number {
    // 基于目标用户的财富等级和影响力计算受众商业价值
    const avgWealthValue = targetUsers.reduce((sum, user) => {
      const wealthValues = { 'Plankton': 1, 'Turtle': 3, 'Dolphin': 7, 'Whale': 15 }
      return sum + wealthValues[user.wealthLevel]
    }, 0) / targetUsers.length
    
    const avgInfluence = targetUsers.reduce((sum, user) => sum + user.influenceMultiplier, 0) / targetUsers.length
    
    return avgWealthValue * avgInfluence
  }
  
  private calculateAudienceQuality(targetUsers: TargetUser[]): number {
    // 计算受众质量评分
    const avgRelevance = this.calculateAverageRelevance(targetUsers)
    const avgEngagement = targetUsers.reduce((sum, user) => sum + user.engagementProbability, 0) / targetUsers.length
    const wealthDistribution = this.calculateWealthDistribution(targetUsers)
    
    return (avgRelevance + avgEngagement * 100 + wealthDistribution) / 3
  }
  
  private calculateWealthDistribution(targetUsers: TargetUser[]): number {
    // 财富等级分布越均衡，质量越高
    const distribution = { 'Plankton': 0, 'Turtle': 0, 'Dolphin': 0, 'Whale': 0 }
    
    targetUsers.forEach(user => {
      distribution[user.wealthLevel]++
    })
    
    const total = targetUsers.length
    const entropy = Object.values(distribution).reduce((sum, count) => {
      if (count === 0) return sum
      const p = count / total
      return sum - p * Math.log2(p)
    }, 0)
    
    return (entropy / 2) * 100 // 归一化到0-100
  }
  
  private estimateExpectedActions(targetUsers: TargetUser[]): Record<string, number> {
    const totalUsers = targetUsers.length
    const avgEngagement = targetUsers.reduce((sum, user) => sum + user.engagementProbability, 0) / totalUsers
    
    return {
      'view': totalUsers,
      'click': Math.floor(totalUsers * avgEngagement * 0.1),
      'like': Math.floor(totalUsers * avgEngagement * 0.05),
      'comment': Math.floor(totalUsers * avgEngagement * 0.02),
      'share': Math.floor(totalUsers * avgEngagement * 0.03),
      'unlock': Math.floor(totalUsers * avgEngagement * 0.01),
      'follow': Math.floor(totalUsers * avgEngagement * 0.02),
    }
  }
  
  private generatePromotionId(): string {
    return 'promo_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2)
  }
}
