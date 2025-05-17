import type { Context, Next } from 'hono';

import path from 'node:path';
import fs from 'node:fs';

import { serveStatic } from '@hono/node-server/serve-static';

import logger from '../utils/logger';

/**
 * 访问日志中间件
 * 记录所有HTTP请求的访问日志
 */
export async function accessLogger(c: Context, next: Next) {
    const start = Date.now();

    await next();
    const duration = Date.now() - start;

    logger.req(c.req.method, c.req.path, c.res.status, duration);
}

/**
 * 性能监控中间件
 * 记录请求处理时间超过阈值的性能日志
 */
export function performanceLogger(thresholdMs = 1000) {
    return async (c: Context, next: Next) => {
        const start = Date.now();

        await next();
        const duration = Date.now() - start;

        if (duration > thresholdMs) {
            logger.warn(`Slow request: ${c.req.method} ${c.req.path} ${duration}ms`);
        }
    };
}

/**
 * 静态文件中间件
 * 处理静态文件请求
 */
export const staticFileMiddleware = async (c: Context, next: Next) => {
    try {
        if (c.req.path.includes('.')) {
            const staticResponse = await serveStatic({ root: './public' })(c, next).catch(
                () => null
            );
            if (staticResponse) return staticResponse;
        }

        const indexPath = path.join(process.cwd(), 'public', 'index.html');
        const content = fs.readFileSync(indexPath);

        return new Response(content, {
            headers: { 'Content-Type': 'text/html' },
            status: 200,
        });
    } catch {
        return new Response('Not Found', {
            status: 404,
        });
    }
};
