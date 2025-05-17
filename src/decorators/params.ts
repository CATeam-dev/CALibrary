import 'reflect-metadata';

/**
 * 参数装饰器模块
 *
 * 该模块提供了用于定义和管理请求参数的装饰器和相关类型。
 * 它允许使用装饰器从不同来源（请求体、查询参数、路径参数、请求头）
 * 提取参数，并支持参数验证。
 *
 * 主要功能：
 * - 提供 @Body、@Query、@Param、@Header 等参数装饰器
 * - 定义参数元数据结构
 * - 支持参数验证规则
 */

// 参数元数据键
export const PARAM_METADATA_KEY = 'custom:param-metadata';

/**
 * 参数类型枚举
 *
 * 定义了支持的参数来源类型。
 */
export enum ParamType {
    /** 请求体参数 */
    Body = 'body',
    /** 查询参数 */
    Query = 'query',
    /** 路径参数 */
    Param = 'param',
    /** 请求头参数 */
    Header = 'header',
    /** 完整请求对象 */
    Request = 'request',
}

/**
 * 参数元数据接口
 *
 * 定义了参数的元数据结构，包含参数索引、类型、名称和验证规则。
 */
export interface ParamMetadata {
    /** 参数在函数参数列表中的索引 */
    index: number;
    /** 参数类型（请求体、查询、路径、头部） */
    type: ParamType;
    /** 参数名称，用于从请求中提取特定字段 */
    name?: string;
    /** 参数验证规则数组 */
    validations: ValidationRule[];
}

/**
 * 验证规则接口
 *
 * 定义了参数验证规则的结构，包含验证类型和参数。
 */
export interface ValidationRule {
    /** 验证规则类型（如 'required'、'email'、'length' 等） */
    type: string;
    /** 验证规则参数数组 */
    params: any[];
}

/**
 * 创建参数装饰器的工厂函数
 *
 * 该函数用于创建特定类型的参数装饰器。
 *
 * @param type 参数类型
 * @returns 参数装饰器函数
 */
function createParamDecorator(type: ParamType) {
    /**
     * 参数装饰器函数
     *
     * @param name 参数名称，用于从请求中提取特定字段
     * @returns 参数装饰器
     */
    return (name?: string) => {
        return ((target: Object, propertyKey: string | symbol, parameterIndex: number): void => {
            const existingParams: ParamMetadata[] =
                Reflect.getMetadata(PARAM_METADATA_KEY, target, propertyKey as string) || [];

            existingParams.push({
                index: parameterIndex,
                type,
                name,
                validations: [],
            });

            Reflect.defineMetadata(
                PARAM_METADATA_KEY,
                existingParams,
                target,
                propertyKey as string
            );
        }) as ParameterDecorator;
    };
}

/**
 * 参数装饰器
 *
 * 这些装饰器用于从不同来源提取请求参数。
 *
 * @example
 * ```typescript
 * // 从请求体提取参数
 * @Post('/users')
 * createUser(@Body('name') name: string, @Body('email') email: string) {
 *   // ...
 * }
 *
 * // 从查询参数提取参数
 * @Get('/users')
 * getUsers(@Query('page') page: number, @Query('limit') limit: number) {
 *   // ...
 * }
 * ```
 */
export const Body = /* @__PURE__ */ createParamDecorator(ParamType.Body);
export const Query = /* @__PURE__ */ createParamDecorator(ParamType.Query);
export const Param = /* @__PURE__ */ createParamDecorator(ParamType.Param);
export const Header = /* @__PURE__ */ createParamDecorator(ParamType.Header);
export const Req = /* @__PURE__ */ createParamDecorator(ParamType.Request);

/**
 * 获取参数元数据
 *
 * 获取控制器方法的参数元数据。
 *
 * @param target 控制器类实例
 * @param propertyKey 方法名称
 * @returns 参数元数据数组
 */
export function getParameterMetadata(target: any, propertyKey: string): ParamMetadata[] {
    return Reflect.getMetadata(PARAM_METADATA_KEY, target, propertyKey) || [];
}
