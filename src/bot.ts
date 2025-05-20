import type { MyContext } from '@/types/bot';

import { Bot } from 'grammy';

import { initFileBot } from './tasks/file';

if (!process.env.BOT_TOKEN) {
    throw new Error('BOT_TOKEN is not set');
}

const bot = new Bot<MyContext>(process.env.BOT_TOKEN, {
    client: {
        baseFetchConfig: {
            proxy: process.env.PROXY_URL,
            compress: true,
        },
    },
});

// 初始化文件处理Bot
initFileBot(bot);

bot.start();

const me = await bot.api.getMe();

console.log(`Hello, ${me.username}`);

export default bot;
