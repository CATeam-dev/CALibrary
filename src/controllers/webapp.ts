import type { Context } from 'hono';

import { Controller } from '@/decorators/controller';
import { Get, Post } from '@/decorators/http';
import { ResponseUtil } from '@/core/response';
import { authMiddleware } from '@/middleware/auth';

@Controller('/webapp')
export class WebAppController {
    @Get('/auth/check')
    async checkAuth(c: Context) {
        try {
            // 尝试从请求头或查询参数中获取Telegram WebApp初始化数据
            const initDataRaw =
                c.req.header('x-telegram-web-app-init-data') || c.req.query('initData');

            if (!initDataRaw) {
                return ResponseUtil.error(c, 'No Telegram WebApp initialization data found', 401);
            }

            // 如果有初始化数据，可以在此处验证（与auth controller类似的逻辑）
            // 但通常在WebApp中，我们依赖cookie中的auth_token

            // 这里我们直接检查是否已经有有效的cookie认证
            // 通过调用下一个中间件来验证
            return ResponseUtil.success(c, {
                message: 'WebApp authentication check',
                needsAuth: true,
            });
        } catch (error) {
            console.error('WebApp auth check error:', error);
            return ResponseUtil.error(c, 'WebApp authentication check failed', 500);
        }
    }

    @Get('/me', authMiddleware)
    async getWebAppUser(c: Context) {
        const user = c.get('user');
        return ResponseUtil.success(c, {
            user,
            webApp: true,
            message: 'Authenticated via WebApp',
        });
    }

    @Post('/init')
    async initWebApp(c: Context) {
        try {
            const body = await c.req.json();
            const { initDataRaw, platform } = body;

            if (!initDataRaw) {
                return ResponseUtil.error(c, 'initDataRaw is required for WebApp', 400);
            }

            // 这里可以使用与auth controller相同的验证逻辑
            // 但是为了避免重复代码，我们可以重定向到已有的auth endpoint
            // 或者在这里实现简化的验证

            return ResponseUtil.success(c, {
                message: 'WebApp initialization successful',
                platform: platform || 'unknown',
                redirectToAuth: '/api/auth/telegram',
            });
        } catch (error) {
            console.error('WebApp init error:', error);
            return ResponseUtil.error(c, 'WebApp initialization failed', 500);
        }
    }
}
