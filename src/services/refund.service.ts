import { query } from '../db.js'

export class RefundService {
  
  /**
   * 处理7天后的预算退还
   */
  async processScheduledRefunds(): Promise<void> {
    console.log('🔄 Processing scheduled refunds...')
    
    try {
      // 查找需要退还的推广
      const expiredPromotions = await query(
        `SELECT rt.promotion_id, rt.original_budget, p.author_id, p.post_id,
                COALESCE(SUM(pe.cost), 0) as total_spent
         FROM refund_tasks rt
         JOIN promotions p ON p.id = rt.promotion_id
         LEFT JOIN promotion_expenses pe ON pe.promotion_id = rt.promotion_id
         WHERE rt.status = 'scheduled'
         AND rt.refund_date <= NOW()
         GROUP BY rt.promotion_id, rt.original_budget, p.author_id, p.post_id`
      )
      
      for (const promotion of expiredPromotions) {
        await this.processRefund(promotion)
      }
      
      console.log(`✅ Processed ${expiredPromotions.length} refunds`)
      
    } catch (error) {
      console.error('❌ Failed to process refunds:', error)
    }
  }
  
  /**
   * 处理单个推广的退还
   */
  private async processRefund(promotion: any): Promise<void> {
    const originalBudget = Number(promotion.original_budget)
    const totalSpent = Number(promotion.total_spent)
    const refundAmount = Math.max(0, originalBudget - totalSpent)
    
    if (refundAmount > 0) {
      // 执行退还操作
      await this.executeRefund(promotion.author_id, refundAmount, promotion.promotion_id)
      
      console.log(`💰 Refunded ${refundAmount} COCO to user ${promotion.author_id} for promotion ${promotion.promotion_id}`)
    }
    
    // 更新推广状态为已完成
    await query(
      `UPDATE promotions SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [promotion.promotion_id]
    )
    
    // 更新退还任务状态
    await query(
      `UPDATE refund_tasks SET status = 'completed', processed_at = NOW(), refund_amount = $1 WHERE promotion_id = $2`,
      [refundAmount, promotion.promotion_id]
    )
  }
  
  /**
   * 执行实际的退还操作
   */
  private async executeRefund(authorId: string, amount: number, promotionId: string): Promise<void> {
    // 将COCO币退还到用户账户
    await query(
      `INSERT INTO points_ledger (
        user_id, amount, type, reference_type, reference_id, 
        description, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        authorId,
        amount,
        'earn', // 退还作为收入记录
        'promotion_refund',
        promotionId,
        `推广预算退还 - 推广ID: ${promotionId}`,
        new Date()
      ]
    )
  }
  
  /**
   * 记录推广费用支出
   */
  async recordPromotionExpense(
    promotionId: string,
    userId: string,
    action: string,
    cost: number
  ): Promise<void> {
    await query(
      `INSERT INTO promotion_expenses (
        promotion_id, user_id, action_type, cost, created_at
      ) VALUES ($1, $2, $3, $4, $5)`,
      [promotionId, userId, action, cost, new Date()]
    )
  }
  
  /**
   * 检查推广预算剩余
   */
  async checkRemainingBudget(promotionId: string): Promise<{
    originalBudget: number
    totalSpent: number
    remainingBudget: number
    isExhausted: boolean
  }> {
    const result = await query(
      `SELECT p.budget_total,
              COALESCE(SUM(pe.cost), 0) as total_spent
       FROM promotions p
       LEFT JOIN promotion_expenses pe ON pe.promotion_id = p.id
       WHERE p.id = $1
       GROUP BY p.budget_total`,
      [promotionId]
    )
    
    if (result.length === 0) {
      throw new Error('Promotion not found')
    }
    
    const originalBudget = Number(result[0].budget_total)
    const totalSpent = Number(result[0].total_spent)
    const remainingBudget = Math.max(0, originalBudget - totalSpent)
    
    return {
      originalBudget,
      totalSpent,
      remainingBudget,
      isExhausted: remainingBudget <= 0.01 // 预算耗尽阈值
    }
  }
  
  /**
   * 提前停止推广 (预算耗尽时)
   */
  async stopPromotionEarly(promotionId: string, reason: string): Promise<void> {
    // 取消未执行的投放
    await query(
      `UPDATE promotion_queue 
       SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = $1
       WHERE promotion_id = $2 AND status = 'scheduled'`,
      [reason, promotionId]
    )
    
    // 更新推广状态
    await query(
      `UPDATE promotions 
       SET status = 'stopped_early', completed_at = NOW()
       WHERE id = $1`,
      [promotionId]
    )
    
    // 立即触发退还
    const budgetInfo = await this.checkRemainingBudget(promotionId)
    if (budgetInfo.remainingBudget > 0) {
      const promotion = await query(
        'SELECT author_id FROM promotions WHERE id = $1',
        [promotionId]
      )
      
      if (promotion.length > 0) {
        await this.executeRefund(promotion[0].author_id, budgetInfo.remainingBudget, promotionId)
        console.log(`💰 Early refund: ${budgetInfo.remainingBudget} COCO for promotion ${promotionId}`)
      }
    }
  }
}
