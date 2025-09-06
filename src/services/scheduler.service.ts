import { RefundService } from './refund.service.js'
import { query } from '../db.js'

export class SchedulerService {
  private refundService: RefundService
  private isRunning: boolean = false
  
  constructor() {
    this.refundService = new RefundService()
  }
  
  /**
   * 启动定时任务
   */
  start(): void {
    if (this.isRunning) {
      console.log('⚠️ Scheduler already running')
      return
    }
    
    this.isRunning = true
    console.log('🚀 Starting promotion scheduler...')
    
    // 每小时检查一次退还任务
    setInterval(() => {
      this.processRefunds().catch(console.error)
    }, 60 * 60 * 1000) // 1小时
    
    // 每10分钟检查预算耗尽的推广
    setInterval(() => {
      this.checkBudgetExhaustion().catch(console.error)
    }, 10 * 60 * 1000) // 10分钟
    
    // 每天凌晨重置用户频次统计
    setInterval(() => {
      this.resetDailyStats().catch(console.error)
    }, 24 * 60 * 60 * 1000) // 24小时
    
    // 立即执行一次
    this.processRefunds().catch(console.error)
  }
  
  /**
   * 停止定时任务
   */
  stop(): void {
    this.isRunning = false
    console.log('🛑 Scheduler stopped')
  }
  
  /**
   * 处理到期退还
   */
  private async processRefunds(): Promise<void> {
    try {
      await this.refundService.processScheduledRefunds()
    } catch (error) {
      console.error('❌ Refund processing failed:', error)
    }
  }
  
  /**
   * 检查预算耗尽的推广，提前停止
   */
  private async checkBudgetExhaustion(): Promise<void> {
    try {
      const exhaustedPromotions = await query(
        `SELECT p.id, p.author_id, p.budget_total,
                COALESCE(SUM(pe.cost), 0) as total_spent
         FROM promotions p
         LEFT JOIN promotion_expenses pe ON pe.promotion_id = p.id
         WHERE p.status = 'active'
         AND p.expires_at > NOW()
         GROUP BY p.id, p.author_id, p.budget_total
         HAVING COALESCE(SUM(pe.cost), 0) >= p.budget_total * 0.98` // 98%预算用完
      )
      
      for (const promotion of exhaustedPromotions) {
        await this.refundService.stopPromotionEarly(promotion.id, 'budget_exhausted')
        console.log(`🛑 Stopped promotion ${promotion.id} - budget exhausted`)
      }
      
    } catch (error) {
      console.error('❌ Budget exhaustion check failed:', error)
    }
  }
  
  /**
   * 重置每日用户频次统计
   */
  private async resetDailyStats(): Promise<void> {
    try {
      const now = new Date()
      const today = now.toISOString().split('T')[0]
      
      // 重置每日计数器
      await query(
        `UPDATE user_promotion_stats 
         SET daily_promotion_count = 0
         WHERE last_promotion_date < $1`,
        [today]
      )
      
      console.log(`🔄 Reset daily promotion stats for ${today}`)
      
    } catch (error) {
      console.error('❌ Daily stats reset failed:', error)
    }
  }
  
  /**
   * 获取系统统计信息
   */
  async getSystemStats(): Promise<{
    activePromotions: number
    scheduledRefunds: number
    totalSpentToday: number
    avgBudgetUtilization: number
  }> {
    try {
      const [activeCount, refundCount, dailySpend, utilization] = await Promise.all([
        query(`SELECT COUNT(*) as count FROM promotions WHERE status = 'active'`),
        query(`SELECT COUNT(*) as count FROM refund_tasks WHERE status = 'scheduled'`),
        query(`SELECT COALESCE(SUM(cost), 0) as total FROM promotion_expenses WHERE DATE(created_at) = CURRENT_DATE`),
        query(`SELECT AVG((total_spent / budget_total) * 100) as avg_util FROM (
          SELECT p.budget_total, COALESCE(SUM(pe.cost), 0) as total_spent
          FROM promotions p
          LEFT JOIN promotion_expenses pe ON pe.promotion_id = p.id
          WHERE p.created_at >= NOW() - INTERVAL '7 days'
          GROUP BY p.id, p.budget_total
        ) as utilization_stats`)
      ])
      
      return {
        activePromotions: Number(activeCount[0]?.count) || 0,
        scheduledRefunds: Number(refundCount[0]?.count) || 0,
        totalSpentToday: Number(dailySpend[0]?.total) || 0,
        avgBudgetUtilization: Number(utilization[0]?.avg_util) || 0
      }
    } catch (error) {
      console.error('❌ Failed to get system stats:', error)
      return {
        activePromotions: 0,
        scheduledRefunds: 0,
        totalSpentToday: 0,
        avgBudgetUtilization: 0
      }
    }
  }
}
