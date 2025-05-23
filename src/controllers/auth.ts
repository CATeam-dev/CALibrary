import type { Context } from 'hono';

import * as crypto from 'crypto';

import { verify } from 'hono/jwt';
import { validate, parse } from '@telegram-apps/init-data-node';

import { Controller } from '@/decorators/controller';
import { Post, Get } from '@/decorators/http';
import { ResponseUtil } from '@/core/response';
import { jwtCreate } from '@/utils/jwt';

const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const ADMIN_USERS = ['codyee', 'ancker_0'];

@Controller('/auth')
export class AuthController {
    @Get('/telegram-login-url')
    async getTelegramLoginUrl(c: Context) {
        try {
            if (!BOT_USERNAME) {
                return ResponseUtil.error(c, 'Bot username not configured', 500);
            }

            const callbackUrl = `${FRONTEND_URL}/auth/telegram/callback`;
            const loginUrl = `https://oauth.telegram.org/auth?bot_id=${BOT_USERNAME}&origin=${encodeURIComponent(FRONTEND_URL)}&return_to=${encodeURIComponent(callbackUrl)}`;

            return ResponseUtil.success(c, {
                loginUrl,
                callbackUrl,
            });
        } catch (error) {
            console.error('Get Telegram login URL error:', error);
            return ResponseUtil.error(c, 'Failed to get login URL', 500, true, error as Error);
        }
    }

    @Post('/telegram')
    async telegramAuth(c: Context) {
        try {
            const body = await c.req.json();
            const { initDataRaw } = body;

            if (!initDataRaw) {
                return ResponseUtil.error(c, 'initDataRaw is required', 400);
            }

            if (!BOT_TOKEN) {
                return ResponseUtil.error(c, 'Bot token not configured', 500);
            }

            // 验证 Telegram 初始数据
            try {
                validate(initDataRaw, BOT_TOKEN);
            } catch (error) {
                return ResponseUtil.error(c, 'Invalid Telegram data', 401);
            }

            // 解析初始数据
            const initData = parse(initDataRaw);

            if (!initData.user) {
                return ResponseUtil.error(c, 'User data not found', 401);
            }

            const tgUserId = initData.user.id.toString();
            const user = {
                id: tgUserId,
                name: `${initData.user.first_name} ${initData.user.last_name || ''}`.trim(),
                username: initData.user.username,
                is_premium: initData.user.is_premium,
                language_code: initData.user.language_code,
            };

            // 创建 JWT token
            const token = await jwtCreate({
                userId: tgUserId,
                username: user.username,
                name: user.name,
                provider: 'telegram',
                exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24小时过期
            });

            return ResponseUtil.success(c, {
                token,
                user,
                expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            });
        } catch (error) {
            console.error('Telegram auth error:', error);
            return ResponseUtil.error(c, 'Authentication failed', 500, true, error as Error);
        }
    }

    @Post('/telegram-web')
    async telegramWebAuth(c: Context) {
        try {
            const body = await c.req.json();
            const { authData } = body;

            if (!authData) {
                return ResponseUtil.error(c, 'authData is required', 400);
            }

            if (!BOT_TOKEN) {
                return ResponseUtil.error(c, 'Bot token not configured', 500);
            }

            // 验证 Telegram Web OAuth 数据
            if (!this.verifyTelegramWebAuth(authData, BOT_TOKEN)) {
                return ResponseUtil.error(c, 'Invalid Telegram authentication data', 401);
            }

            const tgUserId = authData.id.toString();
            const user = {
                id: tgUserId,
                name: `${authData.first_name} ${authData.last_name || ''}`.trim(),
                username: authData.username,
                photo_url: authData.photo_url,
            };

            // 创建 JWT token
            const token = await jwtCreate({
                userId: tgUserId,
                username: user.username,
                name: user.name,
                provider: 'telegram-web',
                exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24小时过期
            });

            return ResponseUtil.success(c, {
                token,
                user,
                expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            });
        } catch (error) {
            console.error('Telegram web auth error:', error);
            return ResponseUtil.error(c, 'Authentication failed', 500, true, error as Error);
        }
    }

    /**
     * 验证 Telegram Web OAuth 数据
     */
    private verifyTelegramWebAuth(authData: any, botToken: string): boolean {
        try {
            const { hash, ...data } = authData;

            if (!hash) {
                return false;
            }

            // 检查授权时间是否在有效期内（86400秒 = 24小时）
            const authTime = parseInt(data.auth_date);
            const currentTime = Math.floor(Date.now() / 1000);
            if (currentTime - authTime > 86400) {
                return false;
            }

            // 创建数据字符串
            const dataCheckString = Object.keys(data)
                .sort()
                .map((key) => `${key}=${data[key]}`)
                .join('\n');

            // 计算签名
            const secretKey = crypto.createHash('sha256').update(botToken).digest();
            const hmac = crypto.createHmac('sha256', secretKey);
            hmac.update(dataCheckString);
            const calculatedHash = hmac.digest('hex');

            // 比较签名
            return calculatedHash === hash;
        } catch (error) {
            console.error('Telegram web auth verification error:', error);
            return false;
        }
    }

    @Post('/verify')
    async verifyToken(c: Context) {
        try {
            const authHeader = c.req.header('Authorization');

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return ResponseUtil.error(c, 'Authorization header required', 401);
            }

            const token = authHeader.substring(7);

            if (!BOT_TOKEN) {
                return ResponseUtil.error(c, 'Bot token not configured', 500);
            }

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

                return ResponseUtil.success(c, {
                    valid: true,
                    user: {
                        id: payload.userId,
                        name: payload.name,
                        username: payload.username,
                        provider: payload.provider,
                    },
                });
            } catch (error) {
                return ResponseUtil.error(c, 'Invalid token', 401);
            }
        } catch (error) {
            return ResponseUtil.error(c, 'Token verification failed', 401);
        }
    }
}
