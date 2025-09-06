export const PromotionConfig = {
  // 定价配置
  pricing: {
    basePrices: {
      view: Number(process.env.PROMO_PRICE_VIEW || '0.001'),
      click: Number(process.env.PROMO_PRICE_CLICK || '0.01'),
      like: Number(process.env.PROMO_PRICE_LIKE || '0.02'),
      comment: Number(process.env.PROMO_PRICE_COMMENT || '0.08'),
      share: Number(process.env.PROMO_PRICE_SHARE || '0.06'),
      unlock: Number(process.env.PROMO_PRICE_UNLOCK || '0.15'),
      follow: Number(process.env.PROMO_PRICE_FOLLOW || '0.12'),
    },
    
    // 财富等级价值倍数
    wealthMultipliers: {
      'Plankton': 1.0,
      'Turtle': 2.0,
      'Dolphin': 4.0,
      'Whale': 8.0,
    },
    
    // 质量折扣配置
    qualityDiscounts: {
      premium: 0.7,  // 30% 折扣
      high: 0.8,     // 20% 折扣
      medium: 0.9,   // 10% 折扣
      low: 1.2,      // 20% 溢价
    }
  },
  
  // 用户体验保护配置
  experienceProtection: {
    maxPromotionsPerUserDaily: Number(process.env.MAX_PROMOS_PER_USER_DAILY || '3'),
    minContentQuality: Number(process.env.MIN_CONTENT_QUALITY || '40'),
    maxSameAuthorDaily: Number(process.env.MAX_SAME_AUTHOR_DAILY || '2'),
    organicContentRatio: Number(process.env.ORGANIC_CONTENT_RATIO || '0.85'), // 85%有机内容
    minOrganicGap: Number(process.env.MIN_ORGANIC_GAP || '3'), // 推广间至少3个有机内容
  },
  
  // 定向配置
  targeting: {
    maxTargetUsers: Number(process.env.MAX_TARGET_USERS || '2000'),
    minRelevanceScore: Number(process.env.MIN_RELEVANCE_SCORE || '30'),
    maxCandidatesPerWealth: Number(process.env.MAX_CANDIDATES_PER_WEALTH || '500'),
  },
  
  // 预算配置
  budget: {
    minBudget: Number(process.env.MIN_PROMOTION_BUDGET || '1'),
    maxBudget: Number(process.env.MAX_PROMOTION_BUDGET || '10000'),
    minDuration: Number(process.env.MIN_PROMOTION_DURATION || '1'),
    maxDuration: Number(process.env.MAX_PROMOTION_DURATION || '30'),
    defaultDuration: Number(process.env.DEFAULT_PROMOTION_DURATION || '7'),
  },
  
  // 算法配置
  algorithm: {
    // 评分权重
    qualityWeight: Number(process.env.PROMO_W_QUALITY || '1.0'),
    freshnessWeight: Number(process.env.PROMO_W_FRESH || '1.0'),
    wealthWeight: Number(process.env.PROMO_W_WEALTH || '1.0'),
    relevanceWeight: Number(process.env.PROMO_W_RELEVANCE || '2.0'),
    
    // 时间衰减参数
    freshnessDecayHours: Number(process.env.FRESHNESS_DECAY_HOURS || '72'),
    
    // 多样性参数
    maxContentTypeDominance: Number(process.env.MAX_CONTENT_TYPE_DOMINANCE || '0.6'),
    maxRegionalDominance: Number(process.env.MAX_REGIONAL_DOMINANCE || '0.4'),
  }
}

export default PromotionConfig
