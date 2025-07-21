import type { Context } from 'hono';

import path from 'path';
import { existsSync, statSync } from 'fs';

import { Controller } from '@/decorators/controller';
import { Get } from '@/decorators/http';
import { ResponseUtil } from '@/core/response';
import { prisma } from '@/utils/db';
// Export controllers for proper registration
export { AdminController } from './admin';
export { AuthController } from './auth';
export { WebAppController } from './webapp';

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
                        books: {
                            where: {
                                public: true,
                            },
                        },
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
        const { page, pageSize } = c.req.query();
        const pageNumber = parseInt(page || '1');
        const pageSizeNumber = parseInt(pageSize || '20');

        const category = await prisma.category.findUnique({
            where: { path },
        });

        if (!category) {
            return ResponseUtil.error(c, '分类不存在');
        }

        const where = {
            categoryId: category.id,
            public: true,
        };

        // 获取总数
        const total = await prisma.book.count({ where });

        const books = await prisma.book.findMany({
            where,
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
                        size: true,
                    },
                },
                Category: {
                    select: {
                        id: true,
                        name: true,
                        path: true,
                        color: true,
                    },
                },
            },
            orderBy: {
                updatedAt: 'desc',
            },
            skip: (pageNumber - 1) * pageSizeNumber,
            take: pageSizeNumber,
        });

        return ResponseUtil.success(c, {
            books,
            total,
            page: pageNumber,
            pageSize: pageSizeNumber,
            totalPages: Math.ceil(total / pageSizeNumber),
            category: {
                id: category.id,
                name: category.name,
                path: category.path,
                color: category.color,
            },
        });
    }

    @Get('/book/:id')
    async book(c: Context) {
        const { id } = c.req.param();
        const book = await prisma.book.findUnique({
            where: { id, public: true },
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
        const pageSizeNumber = parseInt(pageSize || '20');

        const where = { public: true };

        // 获取总数
        const total = await prisma.book.count({ where });

        const books = await prisma.book.findMany({
            where,
            select: {
                id: true,
                title: true,
                author: true,
                cover: true,
                description: true,
                Category: {
                    select: {
                        id: true,
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

        return ResponseUtil.success(c, {
            books,
            total,
            page: pageNumber,
            pageSize: pageSizeNumber,
            totalPages: Math.ceil(total / pageSizeNumber),
        });
    }

    @Get('/books/random')
    async randomBook(c: Context) {
        const { limit } = c.req.query();
        const limitNumber = parseInt(limit || '1');

        try {
            const book = await prisma.book.findManyRandom(limitNumber, {
                where: { public: true },
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

    @Get('/file/:id')
    async file(c: Context) {
        const { id } = c.req.param();
        const file = await prisma.file.findUnique({
            where: { id },
            select: {
                id: true,
                format: true,
                size: true,
                chunks: true,
                hash: true,
                FileChunks: {
                    select: {
                        id: true,
                        chunk: true,
                        size: true,
                        hash: true,
                    },
                },
            },
        });
        return ResponseUtil.success(c, file);
    }

    @Get('/chunk/:id')
    async chunk(c: Context) {
        const { id } = c.req.param();
        const chunk = await prisma.fileChunk.findUnique({
            where: { id },
            select: {
                id: true,
                hash: true,
                size: true,
                chunk: true,
            },
        });

        if (!chunk) {
            return ResponseUtil.error(c, '文件块不存在');
        }

        // 获取文件块存储路径
        const hash = chunk.hash;
        const dir1 = hash.substring(0, 2);
        const dir2 = hash.substring(2, 4);
        const storagePath = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage');
        const chunkPath = path.join(storagePath, dir1, dir2, `${hash}.chk`);

        try {
            // 检查文件是否存在
            const exists = await Bun.file(chunkPath).exists();
            if (!exists) {
                return ResponseUtil.error(c, '文件块数据不存在');
            }

            // 读取文件块数据
            const fileChunk = await Bun.file(chunkPath).arrayBuffer();
            const buffer = Buffer.from(fileChunk);

            // 设置响应头
            c.header('Content-Type', 'application/octet-stream');
            c.header('Content-Disposition', `attachment; filename="chunk-${chunk.chunk}.dat"`);
            c.header('Content-Length', buffer.length.toString());

            return new Response(buffer);
        } catch (error) {
            console.error(
                `读取文件块错误: ${error instanceof Error ? error.message : String(error)}`
            );
            return ResponseUtil.error(c, '读取文件块失败');
        }
    }

    @Get('/covers/:filename')
    async covers(c: Context) {
        const { filename } = c.req.param();
        if (!filename) {
            return ResponseUtil.error(c, 'Filename not provided', 400);
        }

        const STORAGE_PATH = process.env.STORAGE_PATH || path.join(process.cwd(), 'uploads');
        const COVERS_DIR = path.join(STORAGE_PATH, 'covers');
        const imagePath = path.join(COVERS_DIR, filename);

        if (!existsSync(imagePath)) {
            return ResponseUtil.error(c, 'Image not found', 404);
        }

        try {
            const fileStream = Bun.file(imagePath);
            const stats = statSync(imagePath);
            let contentType = Bun.file(imagePath).type;

            if (!contentType) {
                const ext = filename.split('.').pop()?.toLowerCase();
                if (ext === 'png') {
                    contentType = 'image/png';
                } else if (ext === 'gif') {
                    contentType = 'image/gif';
                } else {
                    contentType = 'image/jpeg';
                }
            }

            if (stats.size === 0) {
                return ResponseUtil.error(c, 'Image not found or is empty', 404);
            }

            return new Response(fileStream, {
                headers: {
                    'Content-Type': contentType,
                    'Content-Length': stats.size.toString(),
                    'Cache-Control': 'public, max-age=604800',
                },
            });
        } catch (error) {
            console.error('Failed to serve image:', error);
            return ResponseUtil.error(c, 'Failed to serve image', 500);
        }
    }

}
