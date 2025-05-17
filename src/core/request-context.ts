import type { Context } from 'hono';

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * 请求上下文模块
 *
 * 该模块使用 AsyncLocalStorage 来存储和获取当前请求的上下文信息。
 * 这是一种线程安全的方式，可以在不同的异步调用之间传递请求上下文。
 */

// 创建异步本地存储实例
const requestStorage = new AsyncLocalStorage<Context['req']>();

/**
 * 请求上下文类
 *
 * 提供了存储和获取当前请求的方法。
 */
export class RequestContext {
    /**
     * 获取当前请求
     * @returns 当前请求对象，如果不在请求上下文中则返回 undefined
     */
    static getCurrentRequest(): Context['req'] | undefined {
        return requestStorage.getStore();
    }

    /**
     * 在请求上下文中运行回调函数
     * @param req 请求对象
     * @param callback 回调函数
     * @returns 回调函数的返回值
     */
    static run<T>(req: Context['req'], callback: () => T): T {
        return requestStorage.run(req, callback);
    }
}
