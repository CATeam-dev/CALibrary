import 'reflect-metadata';

import fs from 'node:fs';
import path from 'node:path';

import { Hono } from 'hono';
import { prettyJSON } from 'hono/pretty-json';
import { jwt } from 'hono/jwt';
import { cors } from 'hono/cors';

import { accessLogger, performanceLogger } from './core/middleware';
import { registerRoutes } from './core/router';
import logger from './utils/logger';
import { prepareSslCerts, launchHttp, launchHttps } from './utils/server';
import './bot';
import { jwtSecret } from './utils/jwt';
import { init } from './tasks/init';

if (!Reflect || !Reflect.getMetadata) {
    throw new Error('reflect-metadata is not properly initialized');
}

const app = new Hono();

// 中间件
app.use('*', accessLogger);
app.use('*', performanceLogger());
app.use('*', prettyJSON());
app.use('*', cors());

// 先加载所有controllers
const controllerList = fs.readdirSync(path.join(__dirname, 'controllers'));

for (const controller of controllerList) {
    await import(`./controllers/${controller}`);
    logger.info(`Controller ${controller} loaded`);
}

// Register routes
registerRoutes(app);

const jwtMiddleware = jwt({
    secret: jwtSecret,
    cookie: 'jwt',
});

// app.use('/admin/*', jwtMiddleware);

// 全局路由处理程序 - 放在静态文件中间件之前
app.all('*', (c) => {
    return c.html(
        `<body><h1>WHAT ARE YOU LOOKING FOR?</h1><p>A MIKU?</p><pre>${fs.readFileSync(`./art/${Math.floor(Math.random() * 3)}.txt`)}</pre></body>`,
        404
    );
});

await init();

const webAppUrl = process.env.WEB_APP_URL || 'undefined';
const sslEnabled = process.env.SSL_ENABLE === 'true';

startServer().catch((err) =>
    logger.error(`Failed to start server: ${err instanceof Error ? err.message : String(err)}`)
);

async function startServer() {
    const config = { fetch: app.fetch };

    if (!sslEnabled) {
        await launchHttp(config);
        return;
    }

    const certs = await prepareSslCerts();
    await launchHttps(config, certs);
}

logger.info(`Web App URL: ${webAppUrl}`);

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
});

process.on('SIGINT', () => {
    logger.info('SIGINT signal received. Shutting down...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received. Shutting down...');
    process.exit(0);
});
