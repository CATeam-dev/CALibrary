import type { Constructor } from '../decorators/types';

/**
 * 控制器注册中心
 *
 * 用于管理和存储所有被@Controller装饰器标记的控制器
 */
export class ControllerRegistry {
    private static instance: ControllerRegistry;
    private controllers: Set<Constructor> = new Set();

    private constructor() {}

    /**
     * 获取ControllerRegistry单例
     */
    public static getInstance(): ControllerRegistry {
        if (!ControllerRegistry.instance) {
            ControllerRegistry.instance = new ControllerRegistry();
        }

        return ControllerRegistry.instance;
    }

    /**
     * 注册一个控制器
     * @param controller 控制器类
     */
    public registerController(controller: Constructor): void {
        this.controllers.add(controller);
    }

    /**
     * 获取所有注册的控制器
     */
    public getControllers(): Constructor[] {
        return Array.from(this.controllers);
    }
}

export const controllerRegistry = ControllerRegistry.getInstance();
