import type { Hono } from 'hono';

import { getControllerMetadata } from '../decorators/controller';
import { ROUTE_METADATA } from '../decorators/http';

import { controllerRegistry } from './controller-registry';

/**
 * 规范化路径，确保：
 * 1. 以/开头
 * 2. 不以/结尾（除非是根路径）
 * 3. 不会有重复的/
 */
function normalizePath(inputPath: string): string {
    // 确保以/开头
    const withLeadingSlash = inputPath.startsWith('/') ? inputPath : `/${inputPath}`;

    // 移除结尾的/（除非是根路径）
    const withoutTrailingSlash =
        withLeadingSlash.length > 1 && withLeadingSlash.endsWith('/')
            ? withLeadingSlash.slice(0, -1)
            : withLeadingSlash;

    // 替换多个连续的/为单个/
    return withoutTrailingSlash.replace(/\/+/g, '/');
}

/**
 * 注册单个控制器的路由
 */
function registerController(app: Hono, controller: any) {
    const routes = Reflect.getMetadata(ROUTE_METADATA, controller) || [];
    const instance = new controller();
    const prefix = getControllerMetadata(controller);

    for (const route of routes) {
        const { path, method, handlerName, middlewares } = route;
        const handler = instance[handlerName].bind(instance);
        const methodName = method.toLowerCase() as keyof Hono;
        // 规范化路径
        const fullPath = normalizePath(`${prefix}${path}`);

        // 处理自定义HTTP方法
        if (!app[methodName as keyof Hono]) {
            // 对于不支持的方法，使用on方法
            if (middlewares && middlewares.length > 0) {
                app.on(method, fullPath, ...middlewares, handler);
            } else {
                app.on(method, fullPath, handler);
            }
        } else {
            // 标准HTTP方法
            if (middlewares && middlewares.length > 0) {
                (app[methodName] as Function)(fullPath, ...middlewares, handler);
            } else {
                (app[methodName] as Function)(fullPath, handler);
            }
        }
    }

    return app;
}

/**
 * 注册所有已注册的控制器的路由
 */
export function registerRoutes(app: Hono): Hono {
    const controllers = controllerRegistry.getControllers();

    for (const controller of controllers) {
        registerController(app, controller);
    }

    return app;
}
