import { query } from '../db.js'
import { TargetUser, QualityProtection } from '../types/promotion.types.js'

export class ExperienceProtectorService {
  
  /**
   * 确保推广不损害用户体验
   */
  async protectUserExperience(
    promotions: any[],
    targetUsers: TargetUser[]
  ): Promise<{
    approvedPromotions: any[]
    rejectedPromotions: any[]
    protectionReport: QualityProtection
  }> {
    
    const approved: any[] = []
    const rejected: any[] = []
    
    for (const promotion of promotions) {
      const protectionCheck = await this.checkPromotionSafety(promotion, targetUsers)
      
      if (protectionCheck.approved) {
        approved.push({
          ...promotion,
          safetyScore: protectionCheck.safetyScore,
          deliveryConstraints: protectionCheck.constraints
        })
      } else {
        rejected.push({
          ...promotion,
          rejectionReason: protectionCheck.rejectionReason
        })
      }
    }
    
    return {
      approvedPromotions: approved,
      rejectedPromotions: rejected,
      protectionReport: this.generateProtectionReport(approved, rejected)
    }
  }
  
  /**
   * 检查单个推广的安全性
   */
  private async checkPromotionSafety(
    promotion: any,
    targetUsers: TargetUser[]
  ): Promise<{
    approved: boolean
    safetyScore: number
    rejectionReason?: string
    constraints?: any
  }> {
    
    // 1. 内容质量检查
    const qualityCheck = await this.checkContentQuality(promotion.postId)
    if (qualityCheck.score < 40) {
      return {
        approved: false,
        safetyScore: qualityCheck.score,
        rejectionReason: 'content_quality_too_low'
      }
    }
    
    // 2. 频次检查 - 确保不过度打扰用户
    const frequencyCheck = await this.checkFrequencyLimits(promotion, targetUsers)
    if (!frequencyCheck.passed) {
      return {
        approved: false,
        safetyScore: 0,
        rejectionReason: 'frequency_limit_exceeded'
      }
    }
    
    // 3. 多样性检查 - 确保推广内容多样性
    const diversityCheck = await this.checkPromotionDiversity(promotion)
    if (!diversityCheck.passed) {
      return {
        approved: false,
        safetyScore: 0,
        rejectionReason: 'diversity_requirements_not_met'
      }
    }
    
    // 4. 计算安全评分
    const safetyScore = this.calculateSafetyScore(qualityCheck, frequencyCheck, diversityCheck)
    
    return {
      approved: true,
      safetyScore,
      constraints: {
        maxDailyFrequency: frequencyCheck.recommendedLimit,
        minOrganicGap: 3, // 推广间至少3个有机内容
        qualityThreshold: qualityCheck.score
      }
    }
  }
  
  /**
   * 内容质量检查
   */
  private async checkContentQuality(postId: string): Promise<{
    score: number
    issues: string[]
  }> {
    const post = await query(
      `SELECT p.*, u.username, u.country_code,
              -- 计算内容互动质量
              COALESCE(p.likes, 0) + COALESCE(p.replies, 0) * 2 + COALESCE(p.shares, 0) * 3 as engagement_score,
              -- 计算内容深度
              LENGTH(COALESCE(p.text, '')) as text_length
       FROM posts p
       LEFT JOIN users u ON u.id = p.author_id  
       WHERE p.id = $1`,
      [postId]
    )
    
    if (post.length === 0) {
      return { score: 0, issues: ['post_not_found'] }
    }
    
    const p = post[0]
    const issues: string[] = []
    let score = 30 // 基础分
    
    // 互动质量检查
    const engagementScore = Number(p.engagement_score) || 0
    score += Math.min(40, engagementScore / 2)
    
    // 内容深度检查
    const textLength = Number(p.text_length) || 0
    if (textLength < 50) {
      issues.push('content_too_short')
      score -= 20
    } else if (textLength > 200) {
      score += 15 // 长内容加分
    }
    
    // 作者信誉检查
    const authorReputation = await this.checkAuthorReputation(p.author_id)
    score += authorReputation * 15
    
    // 内容新鲜度
    const hoursAgo = (Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60)
    if (hoursAgo > 168) { // 超过7天
      issues.push('content_too_old')
      score -= 10
    }
    
    return { score: Math.max(0, Math.min(100, score)), issues }
  }
  
  /**
   * 频次限制检查
   */
  private async checkFrequencyLimits(
    promotion: any,
    targetUsers: TargetUser[]
  ): Promise<{
    passed: boolean
    recommendedLimit: number
    violatingUsers: string[]
  }> {
    
    const violatingUsers: string[] = []
    const dailyLimit = 3 // 每用户每日最多3个推广
    
    // 检查每个目标用户的推广频次
    for (const user of targetUsers.slice(0, 100)) { // 抽样检查
      const recentPromotions = await query(
        `SELECT COUNT(*) as count
         FROM promotion_deliveries pd
         WHERE pd.user_id = $1
         AND pd.delivered_at >= NOW() - INTERVAL '24 hours'`,
        [user.userId]
      )
      
      const dailyCount = Number(recentPromotions[0]?.count) || 0
      if (dailyCount >= dailyLimit) {
        violatingUsers.push(user.userId)
      }
    }
    
    // 如果超过20%用户违反频次限制，拒绝推广
    const violationRate = violatingUsers.length / Math.min(targetUsers.length, 100)
    
    return {
      passed: violationRate < 0.2,
      recommendedLimit: dailyLimit,
      violatingUsers
    }
  }
  
  /**
   * 推广多样性检查
   */
  private async checkPromotionDiversity(promotion: any): Promise<{
    passed: boolean
    issues: string[]
  }> {
    const issues: string[] = []
    
    // 1. 检查同作者推广频次
    const authorPromotions = await query(
      `SELECT COUNT(*) as count
       FROM promotion_deliveries pd
       JOIN posts p ON p.id = pd.post_id
       WHERE p.author_id = $1
       AND pd.delivered_at >= NOW() - INTERVAL '24 hours'`,
      [promotion.authorId]
    )
    
    const authorDailyCount = Number(authorPromotions[0]?.count) || 0
    if (authorDailyCount >= 2) {
      issues.push('same_author_too_frequent')
    }
    
    // 2. 检查内容类型多样性
    const contentTypeCheck = await this.checkContentTypeDiversity(promotion)
    if (!contentTypeCheck.passed) {
      issues.push('content_type_not_diverse')
    }
    
    return {
      passed: issues.length === 0,
      issues
    }
  }
  
  /**
   * 计算综合安全评分
   */
  private calculateSafetyScore(
    qualityCheck: any,
    frequencyCheck: any,
    diversityCheck: any
  ): number {
    let score = 0
    
    // 质量分权重50%
    score += qualityCheck.score * 0.5
    
    // 频次安全权重30%
    const frequencyScore = frequencyCheck.passed ? 100 : 0
    score += frequencyScore * 0.3
    
    // 多样性权重20%
    const diversityScore = diversityCheck.passed ? 100 : 0
    score += diversityScore * 0.2
    
    return Math.min(100, score)
  }
  
  /**
   * 生成保护报告
   */
  private generateProtectionReport(
    approved: any[],
    rejected: any[]
  ): QualityProtection {
    return {
      maxFrequencyPerUser: 3,
      minContentQuality: 40,
      organicContentRatio: 0.85, // 85% 有机内容
      diversityRequirements: {
        maxSameAuthor: 2,
        contentTypeBalance: true
      }
    }
  }
  
  // 辅助方法
  private async checkAuthorReputation(authorId: string): Promise<number> {
    // 简化实现：基于作者的历史表现
    const stats = await query(
      `SELECT 
         AVG(p.likes + p.replies + p.shares) as avg_engagement,
         COUNT(*) as post_count
       FROM posts p
       WHERE p.author_id = $1
       AND p.created_at >= NOW() - INTERVAL '30 days'`,
      [authorId]
    )
    
    const avgEngagement = Number(stats[0]?.avg_engagement) || 0
    return Math.min(1, avgEngagement / 50) // 归一化到0-1
  }
  
  private async checkContentTypeDiversity(promotion: any): Promise<{
    passed: boolean
    currentRatio: number
  }> {
    // 检查最近推广的内容类型分布
    const typeStats = await query(
      `SELECT p.content_type, COUNT(*) as count
       FROM promotion_deliveries pd
       JOIN posts p ON p.id = pd.post_id
       WHERE pd.delivered_at >= NOW() - INTERVAL '24 hours'
       GROUP BY p.content_type`
    )
    
    const totalPromotions = typeStats.reduce((sum: number, stat: any) => sum + Number(stat.count), 0)
    const maxTypeCount = Math.max(...typeStats.map((stat: any) => Number(stat.count)))
    const dominanceRatio = maxTypeCount / Math.max(1, totalPromotions)
    
    return {
      passed: dominanceRatio < 0.6, // 单一类型不超过60%
      currentRatio: dominanceRatio
    }
  }
}
