import prismaRandom from 'prisma-extension-random';

import { PrismaClient } from '../../generated/prisma';

const client = new PrismaClient().$extends(prismaRandom());

declare global {
    var __prisma: typeof client | undefined;
}

export const prisma = global.__prisma || client;

if (process.env.NODE_ENV !== 'production') {
    global.__prisma = prisma;
}
