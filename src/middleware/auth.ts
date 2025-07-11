import type { Context, Next } from 'hono';
import { getCookie, deleteCookie, setCookie } from 'hono/cookie';
import { verify } from 'hono/jwt';

import { ResponseUtil } from '@/core/response';
import { jwtSecret } from '@/utils/jwt'; // 引入通用密钥

// 从环境变量读取管理员列表
const TELEGRAM_ADMIN_USERS = (process.env.TELEGRAM_ADMIN_USERS || '').split(',').filter((u) => u);
const GITHUB_ADMIN_USERS = (process.env.GITHUB_ADMIN_USERS || '').split(',').filter((u) => u);

/**
 * 验证 JWT token 是否有效
 */
async function verifyJwtToken(token: string): Promise<any> {
    const secret = jwtSecret;
    if (!secret) {
        throw new Error('JWT secret not configured');
    }
    return await verify(token, secret);
}

/**
 * 检查token是否过期
 */
function isTokenExpired(payload: any): boolean {
    return payload.exp && payload.exp < Math.floor(Date.now() / 1000);
}

/**
 * 验证token结构是否完整
 */
function validateTokenStructure(payload: any): boolean {
    return !!(payload.sub && payload.provider && payload.username);
}

/**
 * 检查用户是否为管理员
 */
function isUserAdmin(provider: string, username: string): boolean {
    switch (provider) {
        case 'telegram':
        case 'telegram-widget':
            return TELEGRAM_ADMIN_USERS.includes(username);
        case 'github':
            return GITHUB_ADMIN_USERS.includes(username);
        default:
            return false;
    }
}

/**
 * 创建用户上下文对象
 */
function createUserContext(payload: any) {
    return {
        id: payload.sub,
        provider_user_id: payload.sub,
        username: payload.username,
        name: payload.name,
        provider: payload.provider,
        email: payload.email,
        avatar_url: payload.avatar_url,
    };
}

/**
 * 清除认证cookie
 */
function clearAuthCookie(c: Context): void {
    deleteCookie(c, 'auth_token', { path: '/' });
}

/**
 * 刷新认证cookie过期时间
 */
function refreshAuthCookie(c: Context, token: string): void {
    setCookie(c, 'auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60, // 7天
    });
}

/**
 * 通用认证中间件
 * 验证请求中的 JWT token 是否有效，并检查用户权限
 */
export async function authMiddleware(c: Context, next: Next) {
    try {
        const token = getCookie(c, 'auth_token');
        
        if (!token) {
            return ResponseUtil.error(c, 'Authorization token not found in cookie', 401);
        }

        try {
            // 验证JWT token
            const payload = await verifyJwtToken(token);

            // 检查token是否过期
            if (isTokenExpired(payload)) {
                clearAuthCookie(c);
                return ResponseUtil.error(c, 'Token expired', 401);
            }

            // 验证token结构
            if (!validateTokenStructure(payload)) {
                clearAuthCookie(c);
                return ResponseUtil.error(c, 'Invalid token payload structure', 401);
            }

            // 检查用户是否为管理员
            if (!isUserAdmin(payload.provider, payload.username)) {
                clearAuthCookie(c);
                console.warn(
                    `Unauthorized access attempt by user ${payload.username} from provider ${payload.provider}. Available admins: ${payload.provider === 'telegram' || payload.provider === 'telegram-widget' ? TELEGRAM_ADMIN_USERS.join(', ') : GITHUB_ADMIN_USERS.join(', ')}`
                );
                return ResponseUtil.error(c, `User is no longer an authorized admin. Username: ${payload.username}, Provider: ${payload.provider}`, 403);
            }

            // 将用户信息添加到上下文中
            c.set('user', createUserContext(payload));

            // 刷新cookie过期时间 (滑动会话)
            refreshAuthCookie(c, token);

            await next();
        } catch (err) {
            clearAuthCookie(c);
            console.warn('Token verification failed in authMiddleware:', err);
            return ResponseUtil.error(c, 'Invalid or malformed token', 401);
        }
    } catch (error) {
        console.error('General error in authMiddleware:', error);
        return ResponseUtil.error(c, 'Authentication process failed', 500, true, error as Error);
    }
}
