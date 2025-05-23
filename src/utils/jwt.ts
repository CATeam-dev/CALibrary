import { sign } from 'hono/jwt';

export const jwtSecret = process.env.BOT_TOKEN || 'default_secret';

export const jwtCreate = async (data: { [key: string]: any }): Promise<string> => {
    const token = await sign(data, jwtSecret);
    return token;
};
