export type WealthLevel = 'foam' | 'plankton' | 'crab' | 'fish' | 'turtle' | 'dolphin' | 'shark' | 'whale' | 'giant_whale'

export type PromotionGoal = 'investment' | 'recognition' | 'collaboration' | 'networking' | 'general'

export type ActionType = 'view' | 'like' | 'unlike' | 'share' | 'comment' | 'unlock' | 'promo_view' | 'promo_click' | 'promo_comment' | 'follow'

export interface PromotionRequest {
  authorId: string
  postId: string
  budget: {
    total: number              // 总预算 (COCO币)
    dailyLimit?: number        // 每日限额
    duration: number           // 推广天数
  }
  targeting: {
    wealthLevels: WealthLevel[]    // 用户设定的目标人群框架
    preferredRegions?: string[]    // 优先地区 (可选)
    excludeFollowers?: boolean     // 是否排除已关注用户
  }
  goals?: {
    primary: PromotionGoal
    expectedReach?: number         // 期望触达人数
    expectedEngagements?: number   // 期望互动数
  }
}

export interface PricingStrategy {
  basePrices: Record<ActionType, number>    // 基础价格
  wealthMultipliers: Record<WealthLevel, number>  // 财富等级倍数
  demandMultipliers: Record<string, number> // 需求倍数 (时段/地区)
  qualityDiscounts: Record<string, number>  // 质量折扣
}

export interface TargetUser {
  userId: string
  wealthLevel: WealthLevel
  relevanceScore: number        // 相关性评分 0-100
  engagementProbability: number // 互动概率 0-1
  influenceMultiplier: number   // 影响力倍数
  location?: {
    country: string
    region?: string
  }
}

export interface PromotionPlan {
  promotionId: string
  postId: string
  authorId: string
  budget: BudgetAllocation
  targeting: TargetingPlan
  schedule: DeliverySchedule
  expectedOutcome: ExpectedOutcome
  qualityProtection: QualityProtection
}

export interface BudgetAllocation {
  total: number
  wealthLevelAllocations: Record<WealthLevel, number>
  timeSlotAllocations: Record<string, number>  // 按时段分配
  actionPricing: Record<ActionType, number>    // 动态定价
}

export interface TargetingPlan {
  primaryTargets: TargetUser[]      // 主要目标用户
  secondaryTargets: TargetUser[]    // 次要目标用户
  totalReach: number                // 预期总触达
  averageRelevance: number          // 平均相关性
}

export interface DeliverySchedule {
  startTime: Date
  endTime: Date
  dailySchedule: {
    hour: number
    allocation: number          // 该时段的预算分配
    targetUsers: string[]       // 该时段的目标用户
  }[]
}

export interface ExpectedOutcome {
  estimatedViews: number
  estimatedClicks: number
  estimatedEngagements: number
  estimatedFollows: number
  expectedROI: number           // 预期投资回报率
  goalAchievementProbability: number // 目标达成概率
}

export interface QualityProtection {
  maxFrequencyPerUser: number   // 每用户最大频次
  minContentQuality: number     // 最低内容质量要求
  organicContentRatio: number   // 有机内容比例保证
  diversityRequirements: {
    maxSameAuthor: number       // 同作者最大频次
    contentTypeBalance: boolean  // 内容类型平衡
  }
}

export interface PromotionPerformance {
  promotionId: string
  actualReach: number
  actualEngagements: number
  actualSpend: number
  costPerAction: Record<ActionType, number>
  goalAchievement: number       // 目标完成度 0-1
  userSatisfactionScore: number // 用户满意度
  platformHealthImpact: number  // 对平台生态的影响
}
