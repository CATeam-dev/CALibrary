import type { Context } from 'hono';

import { Controller } from '@/decorators/controller';
import { Get } from '@/decorators/http';
import { ResponseUtil } from '@/core/response';
import { prisma } from '@/utils/db';

@Controller('/')
export class IndexController {
    @Get('/')
    async index(c: Context) {
        return ResponseUtil.success(c, 'Hello World');
    }

    @Get('/categories')
    async categories(c: Context) {
        const categories = await prisma.category.findMany({
            orderBy: {
                index: 'asc',
            },
        });
        return ResponseUtil.success(c, categories);
    }
}
