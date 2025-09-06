-- 推广记录表
CREATE TABLE IF NOT EXISTS promotions (
  id VARCHAR(255) PRIMARY KEY,
  post_id UUID NOT NULL,
  author_id UUID NOT NULL,
  budget_total DECIMAL(10,4) NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 7,
  target_wealth_levels JSONB NOT NULL,
  preferred_regions JSONB DEFAULT '[]',
  exclude_followers BOOLEAN DEFAULT FALSE,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
);

-- 投放队列表
CREATE TABLE IF NOT EXISTS promotion_queue (
  id BIGSERIAL PRIMARY KEY,
  promotion_id VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL,
  scheduled_delivery TIMESTAMP NOT NULL,
  actual_delivery TIMESTAMP,
  status VARCHAR(50) DEFAULT 'scheduled', -- 'scheduled', 'delivered', 'cancelled'
  created_at TIMESTAMP DEFAULT NOW(),
  cancelled_at TIMESTAMP,
  cancellation_reason VARCHAR(255),
  FOREIGN KEY (promotion_id) REFERENCES promotions(id)
);

-- 推广费用支出表
CREATE TABLE IF NOT EXISTS promotion_expenses (
  id BIGSERIAL PRIMARY KEY,
  promotion_id VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL,
  action_type VARCHAR(50) NOT NULL, -- 'view', 'click', 'like', 'comment', 'share', 'unlock', 'follow'
  cost DECIMAL(8,4) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (promotion_id) REFERENCES promotions(id)
);

-- 退还任务表
CREATE TABLE IF NOT EXISTS refund_tasks (
  id BIGSERIAL PRIMARY KEY,
  promotion_id VARCHAR(255) NOT NULL,
  original_budget DECIMAL(10,4) NOT NULL,
  refund_date TIMESTAMP NOT NULL,
  refund_amount DECIMAL(10,4),
  status VARCHAR(50) DEFAULT 'scheduled', -- 'scheduled', 'completed', 'failed'
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  FOREIGN KEY (promotion_id) REFERENCES promotions(id)
);

-- 推广投放记录表 (用于频次控制和效果统计)
CREATE TABLE IF NOT EXISTS promotion_deliveries (
  id BIGSERIAL PRIMARY KEY,
  promotion_id VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL,
  post_id UUID NOT NULL,
  delivered_at TIMESTAMP DEFAULT NOW(),
  context JSONB, -- 投放上下文 (位置、时间等)
  FOREIGN KEY (promotion_id) REFERENCES promotions(id)
);

-- 用户推广频次统计表 (用于体验保护)
CREATE TABLE IF NOT EXISTS user_promotion_stats (
  user_id UUID PRIMARY KEY,
  daily_promotion_count INTEGER DEFAULT 0,
  weekly_promotion_count INTEGER DEFAULT 0,
  last_promotion_date DATE,
  total_promotions_received INTEGER DEFAULT 0,
  avg_engagement_rate DECIMAL(5,4) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(status, expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_queue_pending ON promotion_queue(scheduled_delivery, status) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_expenses_daily ON promotion_expenses(promotion_id, DATE(created_at));
CREATE INDEX IF NOT EXISTS idx_deliveries_user_daily ON promotion_deliveries(user_id, DATE(delivered_at));

-- 创建视图便于查询
CREATE OR REPLACE VIEW active_promotions AS
SELECT 
  p.*,
  COALESCE(SUM(pe.cost), 0) as spent_amount,
  p.budget_total - COALESCE(SUM(pe.cost), 0) as remaining_budget,
  COUNT(DISTINCT pq.user_id) as queued_users,
  COUNT(DISTINCT pd.user_id) as delivered_users
FROM promotions p
LEFT JOIN promotion_expenses pe ON pe.promotion_id = p.id
LEFT JOIN promotion_queue pq ON pq.promotion_id = p.id AND pq.status = 'scheduled'
LEFT JOIN promotion_deliveries pd ON pd.promotion_id = p.id
WHERE p.status = 'active' AND p.expires_at > NOW()
GROUP BY p.id;

-- 用户每日推广统计视图
CREATE OR REPLACE VIEW user_daily_promotion_stats AS
SELECT 
  user_id,
  DATE(delivered_at) as delivery_date,
  COUNT(*) as promotions_received,
  COUNT(DISTINCT promotion_id) as unique_promotions
FROM promotion_deliveries
WHERE delivered_at >= NOW() - INTERVAL '7 days'
GROUP BY user_id, DATE(delivered_at);
