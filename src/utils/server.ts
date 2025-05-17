import fs from 'node:fs';
import path from 'node:path';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import os from 'node:os';

import { serve } from '@hono/node-server';

import logger from './logger';

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';
const httpsPort = Number(process.env.HTTPS_PORT) || port + 1 || 3443;

export async function prepareSslCerts() {
    const sslPath = process.env.SSL_PATH;
    const homePath = os.homedir() || '';

    const keyPath = sslPath
        ? path.join(sslPath, 'key.pem')
        : path.join(homePath, '.cert/localhost+2-key.pem');

    const certPath = sslPath
        ? path.join(sslPath, 'cert.pem')
        : path.join(homePath, '.cert/localhost+2.pem');

    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
        throw new Error(`SSL certificates not found at ${keyPath} or ${certPath}`);
    }

    return {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
    };
}

export async function launchHttp(config: any) {
    serve({ ...config, hostname: host, port, createServer: createHttpServer }, () =>
        logger.info(`HTTP Server is running on http://${host}:${port}/`)
    );
}

export async function launchHttps(config: any, { key, cert }: { key: Buffer; cert: Buffer }) {
    serve({
        ...config,
        hostname: host,
        port: httpsPort,
        createServer: createHttpsServer,
        serverOptions: { key, cert },
    });

    logger.info(`HTTPS Server is running on https://${host}:${httpsPort}/`);
}
