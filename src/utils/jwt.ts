import { sign } from 'hono/jwt';

export const jwtSecret = process.env.JWT_SECRET || 'default_secret';

export const jwtCreate = (data: { [key: string]: any }) => {
    const token = sign(data, jwtSecret);

    return token;
};
