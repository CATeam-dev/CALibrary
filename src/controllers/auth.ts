import type { Context } from 'hono';

import { Controller } from '@/decorators/controller';
import { Post, Get } from '@/decorators/http';
import { ResponseUtil } from '@/core/response';
import { validateTelegramWebAppData, isAdminUser } from '@/utils/telegram-auth';
import { jwtCreate } from '@/utils/jwt';

@Controller('/auth')
export class AuthController {
    @Post('/telegram')
    async telegramAuth(c: Context) {
        try {
            const body = await c.req.json();
            const { initData } = body;

            if (!initData) {
                return ResponseUtil.error(c, 'Missing initData', 400);
            }

            const botToken = process.env.BOT_TOKEN;
            if (!botToken) {
                return ResponseUtil.error(c, 'Bot token not configured', 500);
            }

            // 验证Telegram WebApp数据
            const validatedData = validateTelegramWebAppData(initData, botToken);
            if (!validatedData || !validatedData.user) {
                return ResponseUtil.error(c, 'Invalid Telegram data', 401);
            }

            // 检查是否为管理员
            if (!isAdminUser(validatedData.user.id)) {
                return ResponseUtil.error(c, 'Access denied: Admin only', 403);
            }

            // 创建JWT token
            const token = await jwtCreate({
                userId: validatedData.user.id,
                username: validatedData.user.username,
                firstName: validatedData.user.first_name,
                lastName: validatedData.user.last_name,
                isAdmin: true,
                exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24小时过期
            });

            // 设置cookie
            c.header(
                'Set-Cookie',
                `jwt=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${24 * 60 * 60}; Path=/`
            );

            return ResponseUtil.success(c, {
                user: {
                    id: validatedData.user.id,
                    username: validatedData.user.username,
                    firstName: validatedData.user.first_name,
                    lastName: validatedData.user.last_name,
                    photoUrl: validatedData.user.photo_url,
                },
                token,
            });
        } catch (error) {
            console.error('Telegram auth error:', error);
            return ResponseUtil.error(c, 'Authentication failed', 500);
        }
    }

    @Post('/logout')
    async logout(c: Context) {
        // 清除JWT cookie
        c.header('Set-Cookie', 'jwt=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/');
        return ResponseUtil.success(c, { message: 'Logged out successfully' });
    }

    @Get('/me')
    async me(c: Context) {
        // 这个路由需要JWT中间件保护
        const payload = c.get('jwtPayload');
        if (!payload) {
            return ResponseUtil.error(c, 'Unauthorized', 401);
        }

        return ResponseUtil.success(c, {
            user: {
                id: payload.userId,
                username: payload.username,
                firstName: payload.firstName,
                lastName: payload.lastName,
                isAdmin: payload.isAdmin,
            },
        });
    }
}
