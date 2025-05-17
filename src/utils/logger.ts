import pc from 'picocolors';

const logger = {
    info: (...args: any[]) =>
        console.log(`${pc.gray(new Date().toLocaleTimeString())} ${pc.blue('INFO')}`, ...args),

    warn: (...args: any[]) =>
        console.warn(`${pc.gray(new Date().toLocaleTimeString())} ${pc.yellow('WARN')}`, ...args),

    error: (...args: any[]) =>
        console.error(`${pc.gray(new Date().toLocaleTimeString())} ${pc.red('ERROR')}`, ...args),

    debug: (...args: any[]) => {
        if (process.env.NODE_ENV !== 'production') {
            console.debug(
                `${pc.gray(new Date().toLocaleTimeString())} ${pc.gray('DEBUG')}`,
                ...args
            );
        }
    },

    // 简化的请求日志
    req: (method: string, path: string, status: number, ms: number) => {
        const statusColor = status >= 400 ? pc.red : status >= 300 ? pc.yellow : pc.green;

        logger.info(`${method} ${path} ${statusColor(status)} ${ms}ms`);
    },
};

export default logger;
