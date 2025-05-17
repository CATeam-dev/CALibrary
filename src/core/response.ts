import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { createId } from '@paralleldrive/cuid2';
import dayjs from 'dayjs';
import { HTTPException } from 'hono/http-exception';

import logger from '../utils/logger';

/**
 * 标准响应格式
 */
export interface StandardResponse<T = unknown> {
    status: 'success' | 'error';
    message?: string;
    data?: T;
    requestId?: string;
    timestamp?: string;
}

/**
 * 响应工具类
 * 提供统一的响应格式化功能，确保所有API响应遵循一致的格式。
 */
export class ResponseUtil {
    /**
     * 创建成功响应
     * @param c Hono Context
     * @param data 响应数据
     * @param message 成功消息
     * @returns Response对象
     */
    static success<T>(c: Context, data?: T, message?: string): Response {
        const response: StandardResponse<T> = {
            status: 'success',
            timestamp: dayjs().toISOString(),
        };

        if (data !== undefined) {
            response.data = data;
        }

        if (message) {
            response.message = message;
        }

        return c.json(response);
    }

    /**
     * 创建错误响应
     * @param c Hono Context
     * @param message 错误消息
     * @param httpStatus HTTP状态码
     * @param isServerError 是否为服务器错误
     * @param error 原始错误对象
     * @returns Response对象
     */
    static error(
        c: Context,
        message: string,
        httpStatus = 400,
        isServerError = false,
        error?: Error
    ) {
        const response: StandardResponse = {
            status: 'error',
            message,
            timestamp: dayjs().toISOString(),
        };

        if (isServerError) {
            const requestId = createId();

            response.requestId = requestId;

            ResponseUtil.logError(error, c).catch((err) => {
                logger.error('Failed to log error:', err);
            });
        }

        return c.json(response, httpStatus as ContentfulStatusCode);
    }

    private static async logError(
        err: Error | HTTPException | unknown,
        _c: Context
    ): Promise<void> {
        try {
            if (err instanceof HTTPException) {
                logger.warn(`HTTP Exception: ${err.message}`);
            } else if (err instanceof Error) {
                logger.error(`Error: ${err.message}\n${err.stack}`);
            } else {
                logger.error('Unknown error');
            }
        } catch (_error) {
            logger.error('Error in logError');
        }
    }
}
