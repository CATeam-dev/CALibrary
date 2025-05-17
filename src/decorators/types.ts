import 'reflect-metadata';

export const TYPE_METADATA = 'type:metadata';
export const VALIDATION_METADATA = 'validation:metadata';

/**
 * 构造函数类型
 */
export type Constructor = { new (...args: any[]): any };

type TypeOptions = {
    required?: boolean;
    nullable?: boolean;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: RegExp;
    format?: 'email' | 'date' | 'date-time' | 'uri' | 'uuid';
};

/**
 * 基础类型装饰器工厂
 */
function createTypeDecorator(type: string, options: TypeOptions = {}) {
    return (target: any, propertyKey: string) => {
        const metadata = {
            type,
            ...options,
        };

        Reflect.defineMetadata(TYPE_METADATA, metadata, target, propertyKey);
    };
}

/**
 * 字符串类型装饰器
 */
export function IsString(options: TypeOptions = {}) {
    return createTypeDecorator('string', options);
}

/**
 * 数字类型装饰器
 */
export function IsNumber(options: TypeOptions = {}) {
    return createTypeDecorator('number', options);
}

/**
 * 布尔类型装饰器
 */
export function IsBoolean(options: TypeOptions = {}) {
    return createTypeDecorator('boolean', options);
}

/**
 * 日期类型装饰器
 */
export function IsDateTime(options: TypeOptions = {}) {
    return createTypeDecorator('date-time', { ...options, format: 'date-time' });
}

/**
 * 邮箱类型装饰器
 */
export function IsEmail(options: TypeOptions = {}) {
    return createTypeDecorator('string', { ...options, format: 'email' });
}

/**
 * UUID 类型装饰器
 */
export function IsUUID(options: TypeOptions = {}) {
    return createTypeDecorator('string', { ...options, format: 'uuid' });
}

/**
 * 获取属性的类型元数据
 */
export function getTypeMetadata(target: any, propertyKey: string) {
    return Reflect.getMetadata(TYPE_METADATA, target, propertyKey);
}
