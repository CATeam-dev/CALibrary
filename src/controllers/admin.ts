import type { Context } from 'hono';

import { Controller } from '@/decorators/controller';
import { Get } from '@/decorators/http';
import { ResponseUtil } from '@/core/response';

@Controller('/admin')
export class AdminController {
    @Get('/')
    async index(c: Context) {
        return ResponseUtil.success(c, 'Hello World');
    }
}
