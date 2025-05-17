import 'reflect-metadata';
import type { Constructor } from './types';

import { controllerRegistry } from '../core/controller-registry';

import { ROUTE_METADATA } from './http';

/**
 * 控制器装饰器模块
 *
 * 该模块提供了用于定义和管理控制器的装饰器和工具函数。
 * 控制器装饰器用于将类标记为控制器，并定义其基础路径。
 *
 * 主要功能：
 * - 提供 @Controller 装饰器用于标记控制器类
 * - 提供工具函数用于获取控制器元数据
 * - 提供工具函数用于获取控制器中定义的路由
 */

// 控制器元数据键
export const CONTROLLER_METADATA = 'controller';

/**
 * 控制器装饰器
 *
 * 用于将类标记为控制器，并定义其基础路径。
 * 同时会自动将控制器注册到全局的controllerRegistry中。
 *
 * @param prefix 控制器的基础路径前缀
 */
export function Controller(prefix = '') {
    return (target: Constructor) => {
        Reflect.defineMetadata(CONTROLLER_METADATA, prefix, target);
        controllerRegistry.registerController(target);
    };
}

/**
 * 获取控制器元数据
 *
 * 获取控制器类上定义的基础路径前缀。
 *
 * @param target 控制器类
 * @returns 控制器的基础路径前缀，如果未定义则返回空字符串
 */
export function getControllerMetadata(target: Function): string {
    return Reflect.getMetadata(CONTROLLER_METADATA, target) || '';
}

/**
 * 获取控制器中定义的路由
 *
 * 获取控制器类上定义的所有路由元数据。
 *
 * @param target 控制器类
 * @returns 路由元数据数组，如果未定义则返回空数组
 */
export function getRoutes(target: Function) {
    return Reflect.getMetadata(ROUTE_METADATA, target) || [];
}
