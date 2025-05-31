import type { Context, Next } from 'hono';
import { getCookie, deleteCookie } from 'hono/cookie';
import { verify } from 'hono/jwt';

import { ResponseUtil } from '@/core/response';
import { jwtSecret } from '@/utils/jwt'; // 引入通用密钥

// 从环境变量读取管理员列表
const TELEGRAM_ADMIN_USERS = (process.env.TELEGRAM_ADMIN_USERS || '').split(',').filter((u) => u);
const GITHUB_ADMIN_USERS = (process.env.GITHUB_ADMIN_USERS || '').split(',').filter((u) => u);

/**
 * 通用认证中间件
 * 验证请求中的 JWT token 是否有效，并检查用户权限
 */
export async function image.pngauthMiddleware(c: Context, next: Next) {
    try {
        const token = getCookie(c, 'auth_token');

        if (!token) {
            return ResponseUtil.error(c, 'Authorization token not found in cookie', 401);
        }

        const secret = jwtSecret;
        if (!secret) {
            console.error('JWT secret is not configured for authMiddleware.');
            return ResponseUtil.error(c, 'Server authentication mechanism is not configured.', 500);
        }

        try {
            const payload = (await verify(token, secret)) as any;

            if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
                deleteCookie(c, 'auth_token', { path: '/' });
                return ResponseUtil.error(c, 'Token expired', 401);
            }

            // 验证 payload 基本结构
            if (!payload.sub || !payload.provider || !payload.username) {
                deleteCookie(c, 'auth_token', { path: '/' });
                return ResponseUtil.error(c, 'Invalid token payload structure', 401);
            }

            // 根据 provider 验证用户是否仍在管理员列表中
            let isAdmin = false;
            if (payload.provider === 'telegram' || payload.provider === 'telegram-widget') {
                if (TELEGRAM_ADMIN_USERS.includes(payload.username)) {
                    isAdmin = true;
                }
            } else if (payload.provider === 'github') {
                if (GITHUB_ADMIN_USERS.includes(payload.username)) {
                    isAdmin = true;
                }
            } else {
                deleteCookie(c, 'auth_token', { path: '/' });
                return ResponseUtil.error(
                    c,
                    'Unknown or unsupported authentication provider in token',
                    401
                );
            }

            if (!isAdmin) {
                deleteCookie(c, 'auth_token', { path: '/' });
                console.warn(
                    `Unauthorized access attempt by user ${payload.username} from provider ${payload.provider}. User removed from admin list or invalid.`
                );
                return ResponseUtil.error(
                    c,
                    'User is no longer an authorized admin for this provider.',
                    403
                );
            }

            // 将用户信息添加到上下文中
            // 确保 c.set('user') 的内容与 verify 接口返回的 user 对象结构一致
            c.set('user', {
                id: payload.sub, // provider_user_id
                provider_user_id: payload.sub,
                username: payload.username,
                name: payload.name,
                provider: payload.provider,
                email: payload.email, // 可能未定义
                avatar_url: payload.avatar_url, // 可能未定义
            });

            await next();
        } catch (err) {
            deleteCookie(c, 'auth_token', { path: '/' });
            console.warn('Token verification failed in authMiddleware:', err);
            return ResponseUtil.error(c, 'Invalid or malformed token', 401);
        }
    } catch (error) {
        console.error('General error in authMiddleware:', error);
        return ResponseUtil.error(c, 'Authentication process failed', 500, true, error as Error);
    }
}
