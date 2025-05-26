import type { Context } from 'hono';

import { verify } from 'hono/jwt';
import { validate, parse } from '@telegram-apps/init-data-node';

import { Controller } from '@/decorators/controller';
import { Post } from '@/decorators/http';
import { ResponseUtil } from '@/core/response';
import { jwtCreate } from '@/utils/jwt';
import crypto from 'crypto';

const BOT_TOKEN = process.env.BOT_TOKEN;

const ADMIN_USERS = ['codyee', 'Ancker_0'];

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

            if (!user.username) {
                return ResponseUtil.error(c, 'User username not found', 401);
            }

            if (!ADMIN_USERS.includes(user.username)) {
                return ResponseUtil.error(c, 'Invalid username', 401);
            }

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

    @Post('/telegram-widget')
    async telegramWidgetAuth(c: Context) {
        try {
            const body = await c.req.json();
            const { id, first_name, last_name, username, photo_url, auth_date, hash } = body;

            if (!BOT_TOKEN) {
                return ResponseUtil.error(c, 'Bot token not configured', 500);
            }

            // 验证必需字段
            if (!id || !auth_date || !hash) {
                return ResponseUtil.error(c, 'Missing required fields', 400);
            }

            // 构建数据检查字符串
            const dataCheckArr: string[] = [];
            if (auth_date) dataCheckArr.push(`auth_date=${auth_date}`);
            if (first_name) dataCheckArr.push(`first_name=${first_name}`);
            if (id) dataCheckArr.push(`id=${id}`);
            if (last_name) dataCheckArr.push(`last_name=${last_name}`);
            if (photo_url) dataCheckArr.push(`photo_url=${photo_url}`);
            if (username) dataCheckArr.push(`username=${username}`);

            // 按字母顺序排序
            dataCheckArr.sort();
            const dataCheckString = dataCheckArr.join('\n');

            // 计算密钥
            const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();

            // 计算 HMAC-SHA256
            const calculatedHash = crypto
                .createHmac('sha256', secretKey)
                .update(dataCheckString)
                .digest('hex');

            // 验证哈希
            if (calculatedHash !== hash) {
                return ResponseUtil.error(c, 'Invalid authentication data', 401);
            }

            // 检查数据是否过期（5分钟内有效）
            const authTime = parseInt(auth_date);
            const currentTime = Math.floor(Date.now() / 1000);
            if (currentTime - authTime > 300) {
                return ResponseUtil.error(c, 'Authentication data expired', 401);
            }

            // 检查用户名是否在管理员列表中
            if (!username || !ADMIN_USERS.includes(username)) {
                return ResponseUtil.error(c, 'Access denied', 403);
            }

            const user = {
                id: id.toString(),
                name: `${first_name} ${last_name || ''}`.trim(),
                username,
                photo_url,
            };

            // 创建 JWT token
            const token = await jwtCreate({
                userId: id.toString(),
                username,
                name: user.name,
                provider: 'telegram-widget',
                exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24小时过期
            });

            return ResponseUtil.success(c, {
                token,
                user,
                expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            });
        } catch (error) {
            console.error('Telegram widget auth error:', error);
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
                if (payload.provider !== 'telegram' && payload.provider !== 'telegram-widget') {
                    return ResponseUtil.error(c, 'Invalid authentication provider', 401);
                }

                console.log(payload);

                if (!ADMIN_USERS.includes(payload.username as string)) {
                    return ResponseUtil.error(c, 'Invalid username', 401);
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
            } catch {
                return ResponseUtil.error(c, 'Invalid token', 401);
            }
        } catch {
            return ResponseUtil.error(c, 'Token verification failed', 401);
        }
    }
}
