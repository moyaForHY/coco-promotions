import express from 'express';
import { verifySignature } from './middleware/signature.js';
import { z } from 'zod';
import { query } from './db.js';
const app = express();
app.use(express.json());
app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});
const FetchSchema = z.object({
    viewerId: z.string().uuid().optional(),
    page: z.number(),
    pageSize: z.number(),
    context: z.object({
        mode: z.enum(['hot', 'new', 'mix']),
        windowH: z.number().min(1).max(168),
        wealth: z.string().optional(),
        seenPostIds: z.array(z.string().uuid()).optional(),
        blockedAuthorIds: z.array(z.string().uuid()).optional(),
    }),
    desired: z.object({ total: z.number().min(0).max(5) }),
});
app.post('/promotions/fetch', verifySignature, async (req, res) => {
    try {
        const body = FetchSchema.parse(req.body);
        const limit = Math.min(Math.max(body.desired.total, 0), 5);
        const seen = new Set(body.context.seenPostIds || []);
        const blocked = new Set(body.context.blockedAuthorIds || []);
        // 简化：选最近72h内有推广预算的帖子，带目标财富定向字段与最近解锁人数，去重/屏蔽后有限排序
        const rows = await query(`SELECT p.id, p.author_id, p.created_at, p.likes, p.replies, p.shares,
              COALESCE((SELECT COUNT(DISTINCT pu.user_id) FROM post_unlocks pu WHERE pu.post_id = p.id AND pu.created_at >= NOW() - INTERVAL '72 hours'), 0) AS unlocks_72h,
              p.target_wealth_levels,
              COALESCE(p.promo_budget_coco,0) AS promo_budget_coco,
              COALESCE((SELECT COUNT(1) FROM post_events pe WHERE pe.post_id = p.id AND pe.type = 'promo_view'),0) AS promo_views,
              COALESCE((SELECT COUNT(1) FROM post_events pe WHERE pe.post_id = p.id AND pe.type = 'promo_click'),0) AS promo_clicks,
              COALESCE((SELECT COUNT(1) FROM post_events pe WHERE pe.post_id = p.id AND pe.type = 'like' AND (pe.metadata->>'source') = 'promo'),0) AS likes_promo,
              COALESCE((SELECT COUNT(1) FROM post_events pe WHERE pe.post_id = p.id AND pe.type = 'comment' AND (pe.metadata->>'source') = 'promo'),0) AS comments_promo,
              COALESCE((SELECT COUNT(1) FROM post_events pe WHERE pe.post_id = p.id AND pe.type = 'share' AND (pe.metadata->>'source') = 'promo'),0) AS shares_promo,
              COALESCE((SELECT COUNT(1) FROM post_events pe WHERE pe.post_id = p.id AND pe.type = 'unlock' AND (pe.metadata->>'source') = 'promo'),0) AS unlocks_promo
       FROM posts p
       WHERE monetization_type IN ('promoted','premium_promoted')
         AND COALESCE(promo_budget_coco,0) > 0
         AND created_at >= NOW() - INTERVAL '72 hours'
       ORDER BY created_at DESC
       LIMIT 100`);
        // 打分：quality(互动=点赞/回复/转发/解锁) + freshness(新鲜度) + wealthMatch（按目标财富定向）；权重可由环境变量配置
        const now = Date.now();
        const priceView = Number(process.env.PROMO_PRICE_VIEW || '1');
        const priceClick = Number(process.env.PROMO_PRICE_CLICK || '5');
        const priceLike = Number(process.env.PROMO_PRICE_LIKE || '2');
        const priceComment = Number(process.env.PROMO_PRICE_COMMENT || '8');
        const priceShare = Number(process.env.PROMO_PRICE_SHARE || '6');
        const priceUnlock = Number(process.env.PROMO_PRICE_UNLOCK || '10');
        const scored = rows
            .filter((r) => !seen.has(r.id) && !blocked.has(r.author_id))
            // 预算检查：若已花费 >= 预算，则不返回
            .filter((r) => {
            const spent = (r.promo_views || 0) * priceView +
                (r.promo_clicks || 0) * priceClick +
                (r.likes_promo || 0) * priceLike +
                (r.comments_promo || 0) * priceComment +
                (r.shares_promo || 0) * priceShare +
                (r.unlocks_promo || 0) * priceUnlock;
            return spent < (r.promo_budget_coco || 0);
        })
            .filter((r) => {
            const vw = body.context.wealth;
            if (!vw)
                return true;
            const raw = r.target_wealth_levels;
            let arr = null;
            if (Array.isArray(raw))
                arr = raw;
            else if (typeof raw === 'string') {
                try {
                    const p = JSON.parse(raw);
                    if (Array.isArray(p))
                        arr = p;
                }
                catch { }
            }
            if (!arr || arr.length === 0)
                return true;
            return arr.includes(vw);
        })
            .map((r) => {
            const ageH = Math.max(1, (now - new Date(r.created_at).getTime()) / 3600000);
            const WQ = Number(process.env.PROMO_W_QUALITY || '1');
            const WF = Number(process.env.PROMO_W_FRESH || '1');
            const WW = Number(process.env.PROMO_W_WEALTH || '1');
            const WU = Number(process.env.PROMO_W_UNLOCK || '8');
            const quality = (r.likes || 0) * 1 + (r.replies || 0) * 2 + (r.shares || 0) * 1.5 + (r.unlocks_72h || 0) * WU;
            const freshness = 10 / ageH;
            const raw = r.target_wealth_levels;
            let arr = [];
            if (Array.isArray(raw))
                arr = raw;
            else if (typeof raw === 'string') {
                try {
                    const p = JSON.parse(raw);
                    if (Array.isArray(p))
                        arr = p;
                }
                catch { }
            }
            const wealthMatch = body.context.wealth && arr.includes(body.context.wealth) ? 1 : 0;
            const priority = WQ * quality + WF * freshness + WW * wealthMatch;
            return { postId: r.id, authorId: r.author_id, priority, impToken: 'imp_' + r.id };
        })
            .sort((a, b) => b.priority - a.priority)
            .slice(0, limit);
        res.json({ items: scored, ttlSec: 30 });
    }
    catch (e) {
        return res.status(400).json({ code: 400, message: e?.message || 'bad_request' });
    }
});
const port = Number(process.env.PORT || 4600);
app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`coco-promotions running on :${port}`);
});
