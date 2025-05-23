import type { Context, Next } from 'hono';
import { verify } from 'hono/jwt';

import { ResponseUtil } from '@/core/response';

const BOT_TOKEN = process.env.BOT_TOKEN || 'default_secret';
const ADMIN_USERS = ['codyee', 'ancker_0'];

/**
 * Telegram 认证中间件
 * 验证请求中的 JWT token 是否有效
 */
export async function telegramAuthMiddleware(c: Context, next: Next) {
    try {
        const authHeader = c.req.header('Authorization');

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return ResponseUtil.error(c, 'Authorization header required', 401);
        }

        const token = authHeader.substring(7);

        try {
            const payload = await verify(token, BOT_TOKEN);

            // 检查 token 是否过期
            if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
                return ResponseUtil.error(c, 'Token expired', 401);
            }

            // 检查是否是 Telegram 认证的用户
            if (
                !payload.provider ||
                typeof payload.provider !== 'string' ||
                !payload.provider.startsWith('telegram')
            ) {
                return ResponseUtil.error(c, 'Invalid authentication provider', 401);
            }

            // 只有当用户名存在时才进行管理员验证
            if (payload.username && !ADMIN_USERS.includes(payload.username as string)) {
                return ResponseUtil.error(c, 'Access denied', 403);
            }

            // 将用户信息添加到上下文中
            c.set('user', {
                id: payload.userId,
                name: payload.name,
                username: payload.username,
                provider: payload.provider,
            });

            await next();
        } catch (error) {
            return ResponseUtil.error(c, 'Invalid token', 401);
        }
    } catch (error) {
        return ResponseUtil.error(c, 'Authentication failed', 500, true, error as Error);
    }
}
