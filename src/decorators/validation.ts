import 'reflect-metadata';
import { PARAM_METADATA_KEY, type ParamMetadata } from '@/decorators/params';

/**
 * 参数验证模块
 *
 * 该模块提供了用于验证请求参数的装饰器和工具类。
 * 它允许使用装饰器对参数进行验证，并提供了一组内置的验证规则。
 *
 * 主要功能：
 * - 提供 @Required、@IsEmail、@Length 等验证装饰器
 * - 支持自定义验证规则
 * - 提供验证器类用于执行验证
 */

/**
 * 验证函数类型
 *
 * 定义了验证函数的签名。验证函数接收要验证的值和验证参数，
 * 返回一个包含验证结果和错误消息的对象。
 */

type ValidationFunction = (
    value: any,
    ...params: any[]
) => { isValid: boolean; error: string | null };

/**
 * 验证函数映射
 *
 * 存储所有注册的验证函数，以验证类型为键。
 */
const validationFunctions: Record<string, ValidationFunction> = {};

// 验证规则工厂
function createValidationDecorator(type: string, ...params: any[]) {
    return (target: Object, propertyKey: string | symbol, parameterIndex: number) => {
        const existingParams: ParamMetadata[] =
            Reflect.getMetadata(PARAM_METADATA_KEY, target, propertyKey as string) || [];

        const param = existingParams.find((p) => p.index === parameterIndex);

        if (param) {
            param.validations.push({ type, params });
            Reflect.defineMetadata(
                PARAM_METADATA_KEY,
                existingParams,
                target,
                propertyKey as string
            );
        }
    };
}

// 注册验证函数
function registerValidation(type: string, fn: ValidationFunction) {
    validationFunctions[type] = fn;
}

// 长度验证
registerValidation('length', (value: string, min: number, max = -1) => {
    if (typeof value !== 'string') {
        return { isValid: false, error: 'Value must be a string' };
    }

    const isValid = max === -1 ? value.length >= min : value.length >= min && value.length <= max;

    return {
        isValid,
        error: isValid
            ? null
            : `Length must be ${max === -1 ? `at least ${min}` : `between ${min} and ${max}`}`,
    };
});

// 邮箱验证
registerValidation('email', (value: string) => {
    if (typeof value !== 'string') {
        return { isValid: false, error: 'Value must be a string' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(value);

    return {
        isValid,
        error: isValid ? null : 'Invalid email format',
    };
});

// 数字验证
registerValidation('number', (value: any, min?: number, max?: number) => {
    const num = Number(value);
    const isValid =
        !Number.isNaN(num) &&
        (min === undefined || num >= min) &&
        (max === undefined || num <= max);

    return {
        isValid,
        error: isValid
            ? null
            : `Must be a number ${
                  min !== undefined || max !== undefined
                      ? `(${min !== undefined ? `min: ${min}` : ''}${max !== undefined ? ` max: ${max}` : ''})`
                      : ''
              }`,
    };
});

// 必填验证
registerValidation('required', (value: any) => {
    const isValid = value !== undefined && value !== null && value !== '';

    return {
        isValid,
        error: isValid ? null : 'Field is required',
    };
});

// 验证装饰器
export function Length(min: number, max = -1) {
    return createValidationDecorator('length', min, max);
}

export function Email() {
    return createValidationDecorator('email');
}

export function IsNumber(min?: number, max?: number) {
    return createValidationDecorator('number', min, max);
}

export function Required() {
    return createValidationDecorator('required');
}

// 验证器
export class Validator {
    /**
     * 验证值是否符合规则
     */
    static validate(
        value: any,
        rules: ParamMetadata['validations']
    ): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        for (const rule of rules) {
            const validationFn = validationFunctions[rule.type];

            if (validationFn) {
                const result = validationFn(value, ...rule.params);

                if (!result.isValid && result.error) {
                    errors.push(result.error);
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
        };
    }

    /**
     * 注册自定义验证函数
     */
    static registerValidation(type: string, fn: ValidationFunction): void {
        registerValidation(type, fn);
    }
}
