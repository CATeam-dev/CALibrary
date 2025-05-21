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
            select: {
                id: true,
                name: true,
                path: true,
                color: true,
                _count: {
                    select: {
                        books: true,
                    },
                },
            },
            orderBy: {
                index: 'asc',
            },
        });

        const categoriesWithBookCount = categories.map((category) => ({
            ...category,
            bookCount: category._count.books,
            _count: undefined,
        }));

        return ResponseUtil.success(c, categoriesWithBookCount);
    }

    @Get('/category/:path')
    async categoryBooks(c: Context) {
        const { path } = c.req.param();

        const category = await prisma.category.findUnique({
            where: { path },
        });

        if (!category) {
            return ResponseUtil.error(c, '分类不存在');
        }

        const books = await prisma.book.findMany({
            where: { categoryId: category.id },
            select: {
                id: true,
                title: true,
                author: true,
                cover: true,
                description: true,
                File: {
                    select: {
                        id: true,
                        format: true,
                        desc: true,
                        size: true,
                    },
                },
            },
            orderBy: {
                updatedAt: 'desc',
            },
        });

        return ResponseUtil.success(c, books);
    }

    @Get('/book/:id')
    async book(c: Context) {
        const { id } = c.req.param();
        const book = await prisma.book.findUnique({
            where: { id },
            select: {
                id: true,
                title: true,
                author: true,
                cover: true,
                description: true,
                Category: {
                    select: {
                        name: true,
                        path: true,
                        color: true,
                    },
                },
                File: {
                    select: {
                        id: true,
                        format: true,
                        desc: true,
                        size: true,
                    },
                },
            },
        });

        if (!book) {
            return ResponseUtil.error(c, '书籍不存在');
        }

        return ResponseUtil.success(c, book);
    }

    @Get('/books')
    async books(c: Context) {
        const { page, pageSize } = c.req.query();
        const pageNumber = parseInt(page || '1');
        const pageSizeNumber = parseInt(pageSize || '10');
        const books = await prisma.book.findMany({
            select: {
                id: true,
                title: true,
                author: true,
                cover: true,
                description: true,
                Category: {
                    select: {
                        path: true,
                        name: true,
                        color: true,
                    },
                },
                File: {
                    select: {
                        id: true,
                        format: true,
                        size: true,
                    },
                },
            },
            orderBy: {
                updatedAt: 'desc',
            },
            skip: (pageNumber - 1) * pageSizeNumber,
            take: pageSizeNumber,
        });

        return ResponseUtil.success(c, books);
    }

    @Get('/books/random')
    async randomBook(c: Context) {
        const { limit } = c.req.query();
        const limitNumber = parseInt(limit || '1');

        try {
            const book = await prisma.book.findManyRandom(limitNumber, {
                select: {
                    id: true,
                    title: true,
                    author: true,
                    cover: true,
                    description: true,
                    Category: {
                        select: {
                            path: true,
                            color: true,
                        },
                    },
                    File: {
                        select: {
                            id: true,
                            format: true,
                            size: true,
                        },
                    },
                },
            });
            return ResponseUtil.success(c, book);
        } catch {
            return ResponseUtil.error(c, '获取随机书籍失败');
        }
    }
}
