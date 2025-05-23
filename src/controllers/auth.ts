import type { Context } from 'hono';
import { verify } from 'hono/jwt';

import { validate, parse } from '@telegram-apps/init-data-node';

import { Controller } from '@/decorators/controller';
import { Post } from '@/decorators/http';
import { ResponseUtil } from '@/core/response';
import { jwtCreate } from '@/utils/jwt';

const BOT_TOKEN = process.env.BOT_TOKEN;

@Controller('/auth')
export class AuthController {
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
                if (payload.provider !== 'telegram') {
                    return ResponseUtil.error(c, 'Invalid authentication provider', 401);
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
