import 'reflect-metadata';
import type { MiddlewareHandler } from 'hono';

/**
 * HTTP 方法装饰器模块
 *
 * 该模块提供了用于定义 HTTP 路由的装饰器和相关类型。
 * 它允许使用装饰器将控制器类的方法标记为特定 HTTP 方法的路由处理程序。
 *
 * 主要功能：
 * - 提供 @Get、@Post、@Put、@Delete、@Patch 等 HTTP 方法装饰器
 * - 定义路由元数据结构
 * - 支持路由级中间件
 */

// 元数据键
export const ROUTE_METADATA = 'route';

/**
 * HTTP 方法类型
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * 路由元数据接口
 */
export interface RouteMetadata {
    path: string;
    method: HttpMethod;
    middlewares: MiddlewareHandler[];
    handlerName: string;
}

/**
 * 创建路由装饰器的工厂函数
 */
function createRouteDecorator(method: HttpMethod) {
    return (path: string, ...middlewares: MiddlewareHandler[]) => {
        return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
            const routes = Reflect.getMetadata(ROUTE_METADATA, target.constructor) || [];

            routes.push({
                path,
                method,
                middlewares,
                handlerName: propertyKey,
            });
            Reflect.defineMetadata(ROUTE_METADATA, routes, target.constructor);

            return descriptor;
        };
    };
}

/**
 * HTTP 方法装饰器
 *
 * 这些装饰器用于将控制器方法标记为特定 HTTP 方法的路由处理程序。
 *
 * @example
 * ```typescript
 * @Get('/users')
 * async getUsers(c: Context) {
 *   // 处理 GET /users 请求
 *   return c.json([]);
 * }
 *
 * @Post('/users')
 * async createUser(c: Context) {
 *   // 处理 POST /users 请求
 *   const body = await c.req.json();
 *   return c.json(body);
 * }
 * ```
 */
export const Get = createRouteDecorator('GET');
export const Post = createRouteDecorator('POST');
export const Put = createRouteDecorator('PUT');
export const Delete = createRouteDecorator('DELETE');
export const Patch = createRouteDecorator('PATCH');
