import { query } from '../db.js'
import { WealthLevel, TargetUser, PromotionRequest } from '../types/promotion.types.js'

export class TargetingEngineService {
  
  /**
   * 在用户设定的框架内找到最优目标受众
   */
  async findTargetsWithinFramework(
    content: any,
    targeting: PromotionRequest['targeting']
  ): Promise<TargetUser[]> {
    
    // 1. 基于用户框架查询候选用户
    const candidates = await this.queryCandidatesInFramework(targeting)
    
    // 2. 在框架内按相关性排序
    const scoredCandidates = candidates.map(user => ({
      ...user,
      relevanceScore: this.calculateRelevanceScore(content, user),
      engagementProbability: this.predictEngagementProbability(content, user),
      influenceMultiplier: this.calculateInfluenceMultiplier(user)
    }))
    
    // 3. 按综合价值排序
    return scoredCandidates
      .sort((a, b) => this.calculateUserValue(b) - this.calculateUserValue(a))
      .slice(0, 1000) // 限制候选池大小
  }
  
  /**
   * 查询用户框架内的候选用户
   */
  private async queryCandidatesInFramework(
    targeting: PromotionRequest['targeting']
  ): Promise<any[]> {
    const wealthLevelsStr = targeting.wealthLevels.map(w => `'${w}'`).join(',')
    
    let sql = `
      SELECT 
        u.id as user_id,
        u.username,
        u.country_code,
        u.region,
        up.wealth_level,
        up.followers_count,
        up.following_count,
        up.posts_count,
        -- 计算用户活跃度
        COALESCE((
          SELECT COUNT(*) 
          FROM post_events pe 
          WHERE pe.user_id = u.id 
          AND pe.created_at >= NOW() - INTERVAL '7 days'
        ), 0) as recent_activity,
        -- 计算用户影响力
        COALESCE((
          SELECT AVG(p.likes + p.replies + p.shares) 
          FROM posts p 
          WHERE p.author_id = u.id 
          AND p.created_at >= NOW() - INTERVAL '30 days'
        ), 0) as avg_engagement
      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE up.wealth_level IN (${wealthLevelsStr})
        AND u.created_at <= NOW() - INTERVAL '24 hours'  -- 排除新注册用户
    `
    
    // 可选的地区过滤
    if (targeting.preferredRegions && targeting.preferredRegions.length > 0) {
      const regionsStr = targeting.preferredRegions.map(r => `'${r}'`).join(',')
      sql += ` AND u.country_code IN (${regionsStr})`
    }
    
    sql += ` ORDER BY recent_activity DESC, avg_engagement DESC LIMIT 2000`
    
    return await query(sql)
  }
  
  /**
   * 计算内容与用户的相关性评分
   */
  private calculateRelevanceScore(content: any, user: any): number {
    let score = 50 // 基础分
    
    // 1. 财富等级匹配度 (0-25分)
    const wealthMatch = this.calculateWealthMatch(content, user)
    score += wealthMatch * 25
    
    // 2. 地理相关性 (0-15分)
    const geoRelevance = this.calculateGeoRelevance(content, user)
    score += geoRelevance * 15
    
    // 3. 活跃度匹配 (0-10分)
    const activityMatch = this.calculateActivityMatch(content, user)
    score += activityMatch * 10
    
    return Math.min(100, Math.max(0, score))
  }
  
  /**
   * 预测用户互动概率
   */
  private predictEngagementProbability(content: any, user: any): number {
    // 基于用户历史行为模式预测
    const userActivity = Number(user.recent_activity) || 0
    const userEngagement = Number(user.avg_engagement) || 0
    
    // 活跃用户更可能互动
    const activityFactor = Math.min(1, userActivity / 10) // 归一化
    
    // 高互动用户更可能产生互动
    const engagementFactor = Math.min(1, userEngagement / 50) // 归一化
    
    // 内容质量影响互动概率
    const contentQuality = this.assessContentQuality(content)
    const qualityFactor = contentQuality / 100
    
    const baseProbability = 0.3 // 30% 基础概率
    return Math.min(0.9, baseProbability * (1 + activityFactor + engagementFactor + qualityFactor))
  }
  
  /**
   * 计算用户影响力倍数
   */
  private calculateInfluenceMultiplier(user: any): number {
    const followersCount = Number(user.followers_count) || 0
    const avgEngagement = Number(user.avg_engagement) || 0
    
    // 影响力 = 关注者数量 × 平均互动率
    const influenceScore = followersCount * Math.min(1, avgEngagement / 100)
    
    // 归一化到1-5倍区间
    return 1 + Math.min(4, influenceScore / 1000)
  }
  
  /**
   * 计算用户综合价值
   */
  private calculateUserValue(user: TargetUser): number {
    return user.relevanceScore * 
           user.engagementProbability * 
           user.influenceMultiplier * 
           this.getWealthLevelValue(user.wealthLevel)
  }
  
  /**
   * 财富等级匹配度计算
   */
  private calculateWealthMatch(content: any, user: any): number {
    // 如果内容有明确的财富等级要求
    if (content.target_wealth_levels) {
      const targetLevels = this.parseTargetLevels(content.target_wealth_levels)
      return targetLevels.includes(user.wealth_level) ? 1.0 : 0.3
    }
    
    // 基于内容类型推断匹配度
    const contentComplexity = this.assessContentComplexity(content)
    const userSophistication = this.getUserSophistication(user.wealth_level)
    
    return Math.min(1, contentComplexity / userSophistication)
  }
  
  /**
   * 地理相关性计算
   */
  private calculateGeoRelevance(content: any, user: any): number {
    if (!content.location || !user.country_code) return 0.5 // 中性
    
    if (content.location.country === user.country_code) {
      // 同国家，检查地区
      if (content.location.region === user.region) {
        return 1.0 // 同地区，高相关性
      }
      return 0.8   // 同国家，中高相关性
    }
    
    return 0.2 // 不同国家，低相关性
  }
  
  /**
   * 活跃度匹配计算
   */
  private calculateActivityMatch(content: any, user: any): number {
    const userActivity = Number(user.recent_activity) || 0
    const contentEngagement = Number(content.likes || 0) + Number(content.replies || 0)
    
    // 高活跃用户更适合高互动内容
    if (userActivity > 10 && contentEngagement > 20) return 1.0
    if (userActivity > 5 && contentEngagement > 10) return 0.8
    if (userActivity > 2 && contentEngagement > 5) return 0.6
    return 0.4
  }
  
  private assessContentQuality(content: any): number {
    const engagement = (content.likes || 0) + (content.replies || 0) * 2 + (content.shares || 0) * 3
    const textLength = (content.text || '').length
    const hasImages = !!(content.images && content.images.length > 0)
    
    let quality = 30 // 基础分
    quality += Math.min(40, engagement * 2) // 互动分
    quality += textLength > 100 ? 20 : 10   // 内容深度
    quality += hasImages ? 10 : 0           // 多媒体加分
    
    return Math.min(100, quality)
  }
  
  private assessContentComplexity(content: any): number {
    // 简化实现：基于文本长度和互动复杂度
    const textLength = (content.text || '').length
    const interactionDepth = (content.replies || 0) / Math.max(1, content.likes || 1)
    
    return Math.min(100, textLength / 10 + interactionDepth * 20)
  }
  
  private getUserSophistication(wealthLevel: WealthLevel): number {
    const sophisticationMap = {
      'foam': 10,
      'plankton': 20,
      'crab': 30,
      'fish': 40,
      'turtle': 50,
      'dolphin': 70,
      'shark': 85,
      'whale': 95,
      'giant_whale': 100
    }
    return sophisticationMap[wealthLevel]
  }
  
  private getWealthLevelValue(wealthLevel: WealthLevel): number {
    const valueMap = {
      'foam': 0.5,
      'plankton': 1,
      'crab': 1.5,
      'fish': 2,
      'turtle': 3,
      'dolphin': 5,
      'shark': 8,
      'whale': 12,
      'giant_whale': 20
    }
    return valueMap[wealthLevel]
  }
  
  private parseTargetLevels(targetWealthLevels: any): WealthLevel[] {
    try {
      if (Array.isArray(targetWealthLevels)) return targetWealthLevels
      if (typeof targetWealthLevels === 'string') return JSON.parse(targetWealthLevels)
      return []
    } catch {
      return []
    }
  }
}
