import type { Context } from 'hono';

import { join } from 'path';
import { createWriteStream, existsSync, mkdirSync, statSync } from 'fs';
import { pipeline } from 'stream/promises';
import { createHash } from 'crypto';

import axios from 'axios';
import { z } from 'zod';
import { FileFormat } from '@generated/prisma';

import { Controller } from '@/decorators/controller';
import { Delete, Get, Post, Put } from '@/decorators/http';
import { ResponseUtil } from '@/core/response';
import { prisma } from '@/utils/db';
import { authMiddleware } from '@/middleware/auth';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { validator } from 'hono/validator';

const DOUBAN_API_KEY = '0ac44ae016490db2204ce0a042db2916';
const STORAGE_PATH = process.env.STORAGE_PATH || join(process.cwd(), 'uploads');
const COVERS_DIR = join(STORAGE_PATH, 'covers');

// 确保封面目录存在
if (!existsSync(COVERS_DIR)) {
    mkdirSync(COVERS_DIR, { recursive: true });
}

@Controller('/admin')
export class AdminController {
    @Get('/me', authMiddleware)
    async me(c: Context) {
        // 通过 Telegram 认证中间件，这里已经是认证过的管理员
        const user = c.get('user');
        return ResponseUtil.success(c, {
            role: 'admin',
            user: user,
        });
    }

    @Get('/category', authMiddleware)
    async category(c: Context) {
        // 获取所有分类及其包含的书籍数量
        const categories = await prisma.category.findMany({
            orderBy: { index: 'asc' },
        });

        // 手动获取每个分类的书籍数量
        const categoriesWithBookCount = await Promise.all(
            categories.map(async (category: any) => {
                const bookCount = await prisma.book.count({
                    where: { categoryId: category.id },
                });
                return {
                    ...category,
                    bookCount,
                };
            })
        );

        return ResponseUtil.success(c, categoriesWithBookCount);
    }

    @Get('/category/:path', authMiddleware)
    async getCategoryById(c: Context) {
        const { path } = c.req.param();
        const category = await prisma.category.findFirst({
            where: { path },
        });

        if (!category) {
            return ResponseUtil.error(c, 'Category not found');
        }

        // 获取该分类下的书籍数量
        const bookCount = await prisma.book.count({
            where: { categoryId: category.id },
        });

        return ResponseUtil.success(c, {
            ...category,
            bookCount,
        });
    }

    @Post(
        '/category',
        authMiddleware,
        validator('json', (value, c) => {
            const categorySchema = z.object({
                name: z.string().min(1),
                path: z
                    .string()
                    .min(1)
                    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
                        message:
                            'Path can only contain lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.',
                    }),
                color: z
                    .string()
                    .startsWith('#')
                    .length(7)
                    .regex(/^#[0-9a-fA-F]{6}$/, { message: 'Invalid hex color format.' }),
                index: z.number().int().optional(),
            });
            const parsed = categorySchema.safeParse(value);
            if (!parsed.success) {
                // Return a Hono JSON response directly for errors
                return c.json(
                    { error: 'Invalid input', issues: parsed.error.flatten().fieldErrors },
                    400
                );
            }
            return parsed.data;
        })
    )
    async createCategory(c: Context) {
        const data = c.req.valid('json');

        try {
            // 检查path是否已存在
            if (data.path) {
                const existingCategory = await prisma.category.findFirst({
                    where: { path: data.path },
                });

                if (existingCategory) {
                    return ResponseUtil.error(c, 'Path already exists', 400);
                }
            }

            // 获取当前最大的index值
            const maxIndexCategory = await prisma.category.findFirst({
                orderBy: { index: 'desc' },
                select: { index: true },
            });

            const nextIndex = (maxIndexCategory?.index ?? -1) + 1;

            const category = await prisma.category.create({
                data: {
                    name: data.name,
                    path: data.path,
                    color: data.color,
                    index: nextIndex,
                },
            });

            return ResponseUtil.success(c, category);
        } catch (error: any) {
            console.error('Create category error:', error);
            return ResponseUtil.error(c, error.message || 'Failed to create category');
        }
    }

    @Put(
        '/category/:path',
        authMiddleware,
        validator('json', (value, c) => {
            const categoryUpdateSchema = z.object({
                name: z.string().min(1).optional(),
                path: z
                    .string()
                    .min(1)
                    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
                        message:
                            'Path can only contain lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.',
                    })
                    .optional(),
                color: z
                    .string()
                    .startsWith('#')
                    .length(7)
                    .regex(/^#[0-9a-fA-F]{6}$/, { message: 'Invalid hex color format.' })
                    .optional(),
                index: z.number().int().optional(),
            });
            const parsed = categoryUpdateSchema.safeParse(value);
            if (!parsed.success) {
                return c.json(
                    { error: 'Invalid input', issues: parsed.error.flatten().fieldErrors },
                    400
                );
            }
            return parsed.data;
        })
    )
    async updateCategory(c: Context) {
        const currentPath = c.req.param('path');
        const data = c.req.valid('json');

        try {
            // 先检查分类是否存在
            const existingCategory = await prisma.category.findFirst({
                where: { path: currentPath },
            });

            if (!existingCategory) {
                return ResponseUtil.error(c, 'Category not found', 404);
            }

            // 如果更新path，检查新path是否已被其他分类使用
            if (data.path && data.path !== existingCategory.path) {
                const pathExists = await prisma.category.findFirst({
                    where: {
                        path: data.path,
                        id: { not: existingCategory.id }, // 排除当前分类
                    },
                });

                if (pathExists) {
                    return ResponseUtil.error(c, 'Path already exists', 400);
                }
            }

            const category = await prisma.category.update({
                where: { id: existingCategory.id },
                data: {
                    name: data.name,
                    path: data.path,
                    color: data.color,
                    index: data.index,
                },
            });

            return ResponseUtil.success(c, category);
        } catch (error: any) {
            console.error('Update category error:', error);
            return ResponseUtil.error(c, error.message || 'Failed to update category');
        }
    }

    @Delete('/category/:path', authMiddleware)
    async deleteCategory(c: Context) {
        const { path } = c.req.param();
        const category = await prisma.category.findFirst({ where: { path } });
        if (!category) {
            return ResponseUtil.error(c, 'Category not found');
        }
        const books = await prisma.book.findMany({ where: { categoryId: category.id } });
        if (books.length > 0) {
            return ResponseUtil.error(c, 'Category has books');
        }
        await prisma.category.delete({ where: { id: category.id } });
        return ResponseUtil.success(c, 'Category deleted');
    }

    @Put(
        '/category/reorder',
        authMiddleware,
        validator('json', (value, c) => {
            console.log('Received raw value in validator:', JSON.stringify(value, null, 2));
            console.log('Value type:', typeof value);
            console.log('Is array:', Array.isArray(value));
            
            const reorderSchema = z
                .array(
                    z.object({
                        id: z.string().min(1),
                        index: z.number().int().min(0),
                    })
                )
                .min(1);
            const parsed = reorderSchema.safeParse(value);
            if (!parsed.success) {
                console.error('Reorder validation failed:', parsed.error);
                console.error('Failed value:', JSON.stringify(value, null, 2));
                return c.json(
                    { 
                        error: 'Invalid input', 
                        issues: parsed.error.flatten().fieldErrors,
                        details: parsed.error.issues
                    },
                    400
                );
            }
            console.log('Validation passed, returning:', parsed.data);
            return parsed.data;
        })
    )
    async reorderCategories(c: Context) {
        const categoriesToReorder = c.req.valid('json');
        
        console.log('Received reorder payload:', JSON.stringify(categoriesToReorder, null, 2));

        if (!Array.isArray(categoriesToReorder)) {
            console.error('categoriesToReorder is not an array:', typeof categoriesToReorder);
            return ResponseUtil.error(c, 'categoriesToReorder must be an array');
        }

        if (categoriesToReorder.length === 0) {
            console.error('categoriesToReorder array is empty');
            return ResponseUtil.error(c, 'categoriesToReorder array cannot be empty');
        }

        try {
            // 先验证所有分类ID是否存在
            const existingCategories = await prisma.category.findMany({
                where: { id: { in: categoriesToReorder.map((c) => c.id) } },
                select: { id: true },
            });

            if (existingCategories.length !== categoriesToReorder.length) {
                const existingIds = existingCategories.map((c) => c.id);
                const missingIds = categoriesToReorder
                    .filter((c) => !existingIds.includes(c.id))
                    .map((c) => c.id);
                return ResponseUtil.error(c, `Categories not found: ${missingIds.join(', ')}`, 404);
            }

            // 使用事务来确保数据一致性
            await prisma.$transaction(async (tx: any) => {
                // 更新每个分类的index
                for (const category of categoriesToReorder) {
                    await tx.category.update({
                        where: { id: category.id },
                        data: { index: category.index },
                    });
                }
            });

            return ResponseUtil.success(c, 'Categories reordered successfully');
        } catch (error: any) {
            console.error('Reorder categories error:', error);
            return ResponseUtil.error(c, error.message || 'Failed to reorder categories');
        }
    }

    @Get('/book', authMiddleware)
    async book(c: Context) {
        let { categoryId, page, pageSize } = c.req.query();
        const pageInt = parseInt(page || '1') || 1;
        const pageSizeInt = parseInt(pageSize || '10') || 10;
        const where = categoryId ? { categoryId } : {};
        const total = await prisma.book.count({ where });
        const books = await prisma.book.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (pageInt - 1) * pageSizeInt,
            take: pageSizeInt,
            include: { Category: true, File: true },
        });
        return ResponseUtil.success(c, {
            books: books.map((b: any) => ({
                ...b,
                category: b.Category
                    ? {
                          id: b.Category.id,
                          name: b.Category.name,
                          path: b.Category.path,
                          color: b.Category.color,
                      }
                    : null,
                formats: b.File ? b.File.map((f: any) => f.format) : [],
            })),
            total,
            page: pageInt,
            pageSize: pageSizeInt,
            totalPages: Math.ceil(total / pageSizeInt),
        });
    }

    @Get('/book/:id', authMiddleware)
    async bookDetail(c: Context) {
        const { id } = c.req.param();
        const book = await prisma.book.findUnique({
            where: { id },
            include: { Category: true, File: true },
        });
        if (!book) {
            return ResponseUtil.error(c, 'Book not found');
        }
        return ResponseUtil.success(c, {
            ...book,
            category: book.Category,
            formats: book.File ? book.File.map((f: any) => f.format) : [],
        });
    }

    @Post(
        '/book',
        authMiddleware,
        validator('json', (value, c) => {
            const bookSchema = z.object({
                title: z.string().min(1),
                author: z.string().min(1),
                description: z.string().optional().default(''),
                public: z.boolean().optional().default(false),
                categoryId: z.string().cuid(),
                cover: z
                    .string()
                    .min(1, 'Cover image URL is required')
                    .refine((val) => {
                        // Allow relative URLs starting with /
                        if (val.startsWith('/')) return true;
                        // Allow absolute URLs
                        return z.string().url().safeParse(val).success;
                    }, {
                        message: 'Invalid URL for cover image'
                    }),
                doubanId: z.string().optional().nullable(),
            });
            const parsed = bookSchema.safeParse(value);
            if (!parsed.success) {
                return c.json(
                    { error: 'Invalid input', issues: parsed.error.flatten().fieldErrors },
                    400
                );
            }
            return parsed.data;
        })
    )
    async createBook(c: Context) {
        const data = c.req.valid('json');

        // 如果是豆瓣图片链接，先下载到本地
        let localCover = data.cover;
        if (data.cover?.includes('/api/admin/proxy/douban-image')) {
            const originalUrl = new URL(data.cover).searchParams.get('url');
            if (originalUrl && data.doubanId) {
                localCover = await this.downloadAndSaveImage(originalUrl, data.doubanId);
            }
        }

        const book = await prisma.book.create({
            data: {
                title: data.title,
                author: data.author,
                cover: localCover,
                categoryId: data.categoryId,
                description: data.description,
                doubanId: data.doubanId,
                public: data.public,
            },
        });
        return ResponseUtil.success(c, book);
    }

    @Put(
        '/book/:id',
        authMiddleware,
        validator('json', (value, c) => {
            const bookUpdateSchema = z.object({
                title: z.string().min(1).optional(),
                author: z.string().min(1).optional(),
                description: z.string().optional(),
                public: z.boolean().optional(),
                categoryId: z.string().cuid().optional(),
                cover: z
                    .string()
                    .min(1, 'Cover image URL is required')
                    .optional()
                    .refine((val) => {
                        if (!val) return true;
                        // Allow relative URLs starting with /
                        if (val.startsWith('/')) return true;
                        // Allow absolute URLs
                        return z.string().url().safeParse(val).success;
                    }, {
                        message: 'Invalid URL for cover image'
                    }),
                doubanId: z.string().optional().nullable(),
            });
            const parsed = bookUpdateSchema.safeParse(value);
            if (!parsed.success) {
                return c.json(
                    { error: 'Invalid input', issues: parsed.error.flatten().fieldErrors },
                    400
                );
            }
            return parsed.data;
        })
    )
    async updateBook(c: Context) {
        const id = c.req.param('id');
        const data = c.req.valid('json');

        // 如果是豆瓣图片链接，先下载到本地
        if (data.cover?.includes('/api/admin/proxy/douban-image')) {
            const originalUrl = new URL(data.cover).searchParams.get('url');
            if (originalUrl && data.doubanId) {
                data.cover = await this.downloadAndSaveImage(originalUrl, data.doubanId);
            }
        }

        try {
            const book = await prisma.book.update({ where: { id }, data });
            return ResponseUtil.success(c, book);
        } catch (error: any) {
            return ResponseUtil.error(c, error.message);
        }
    }

    @Delete('/book/:id', authMiddleware)
    async deleteBook(c: Context) {
        const { id } = c.req.param();
        const files = await prisma.file.findMany({ where: { bookId: id } });
        if (files.length > 0) {
            return ResponseUtil.error(c, 'Book has files, please delete files or unbind');
        }
        await prisma.book.delete({ where: { id } });
        return ResponseUtil.success(c, 'Book deleted');
    }

    @Get('/file', authMiddleware)
    async getFiles(c: Context) {
        let { bookId, page, pageSize } = c.req.query();
        const pageInt = parseInt(page || '1') || 1;
        const pageSizeInt = parseInt(pageSize || '10') || 10;
        const where = bookId ? { bookId } : {};
        const total = await prisma.file.count({ where });
        const files = await prisma.file.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (pageInt - 1) * pageSizeInt,
            take: pageSizeInt,
            include: { Book: true },
        });
        return ResponseUtil.success(c, {
            files,
            total,
            page: pageInt,
            pageSize: pageSizeInt,
            totalPages: Math.ceil(total / pageSizeInt),
        });
    }

    @Get('/file/:id', authMiddleware)
    async getFileDetail(c: Context) {
        const { id } = c.req.param();
        const file = await prisma.file.findUnique({
            where: { id },
            include: { Book: true },
        });
        if (!file) {
            return ResponseUtil.error(c, 'File not found');
        }
        return ResponseUtil.success(c, file);
    }

    @Put(
        '/file/:id',
        authMiddleware,
        validator('json', (value, c) => {
            const fileUpdateSchema = z.object({
                format: z.nativeEnum(FileFormat).optional(),
                desc: z.string().optional().nullable(),
                bookId: z.string().cuid().optional().nullable(),
                filename: z.string().min(1).optional(),
            });
            const parsed = fileUpdateSchema.safeParse(value);
            if (!parsed.success) {
                return c.json(
                    { error: 'Invalid input', issues: parsed.error.flatten().fieldErrors },
                    400
                );
            }
            return parsed.data;
        })
    )
    async updateFileMeta(c: Context) {
        const fileId = c.req.param('id');
        const data = c.req.valid('json');

        // 如果是解绑操作（bookId从有值变为null）
        if (data.bookId === null) {
            // 先查询当前文件
            const currentFile = await prisma.file.findUnique({
                where: { id: fileId },
                include: { Book: true },
            });

            // 如果文件存在且当前有关联的书籍
            if (currentFile && currentFile.bookId) {
                // 检查书籍是否为public
                const book = await prisma.book.findUnique({
                    where: { id: currentFile.bookId },
                });

                if (book && book.public) {
                    // 检查这本书关联的文件数量
                    const fileCount = await prisma.file.count({
                        where: { bookId: currentFile.bookId },
                    });

                    // 如果这是最后一个文件，阻止解绑
                    if (fileCount <= 1) {
                        return ResponseUtil.error(
                            c,
                            'Cannot unbind the last file from a public book. Please unpublish the book first.'
                        );
                    }
                }
            }
        }

        try {
            const file = await prisma.file.update({
                where: { id: fileId },
                data: {
                    bookId: data.bookId,
                    desc: data.desc,
                },
            });
            return ResponseUtil.success(c, file);
        } catch (error: any) {
            return ResponseUtil.error(c, error.message);
        }
    }

    @Delete('/file/:id', authMiddleware)
    async deleteFile(c: Context) {
        const { id } = c.req.param();
        try {
            await prisma.fileChunk.deleteMany({ where: { fileId: id } });
            await prisma.file.delete({ where: { id } });
            return ResponseUtil.success(c, 'File deleted');
        } catch (error: any) {
            return ResponseUtil.error(c, error.message);
        }
    }

    @Get('/book/random')
    async getRandomBook(c: Context) {
        const count = await prisma.book.count({ where: { public: true } });
        const skip = Math.floor(Math.random() * count);
        const book = await prisma.book.findFirst({
            where: { public: true },
            skip,
            include: { Category: true, File: true },
        });

        if (!book) {
            return ResponseUtil.error(c, 'No books found');
        }

        return ResponseUtil.success(c, {
            ...book,
            category: book.Category
                ? {
                      id: book.Category.id,
                      name: book.Category.name,
                      path: book.Category.path,
                      color: book.Category.color,
                  }
                : null,
            formats: book.File ? book.File.map((f: any) => f.format) : [],
        });
    }

    // 下载并保存豆瓣图片
    private async downloadAndSaveImage(imageUrl: string, doubanId: string): Promise<string> {
        try {
            // 验证URL
            const url = new URL(imageUrl);
            if (!url.hostname.includes('douban')) {
                throw new Error('Only Douban images are allowed');
            }

            // 使用豆瓣ID生成MD5
            const hash = createHash('md5').update(doubanId).digest('hex');
            const filename = `${hash.substring(0, 8)}`;
            const localPath = join(COVERS_DIR, filename);

            // 如果文件已存在，直接返回 API 路径
            if (existsSync(localPath)) {
                return `/api/covers/${filename}`; // 返回 API 相对路径
            }

            const response = await axios.get(imageUrl, {
                responseType: 'stream',
                timeout: 5000,
                maxContentLength: 5 * 1024 * 1024, // 5MB
            });

            // 验证内容类型
            const contentType = response.headers['content-type'];
            if (!contentType?.startsWith('image/')) {
                throw new Error('Invalid content type');
            }

            await pipeline(response.data, createWriteStream(localPath));

            return `/api/covers/${filename}`; // 返回 API 相对路径
        } catch (error) {
            console.error('Failed to download image:', error);
            // 返回原始URL作为备选
            return imageUrl;
        }
    }

    @Get('/douban/search', authMiddleware)
    async searchDoubanBooks(c: Context) {
        const { query, count = '20' } = c.req.query();

        if (!query) {
            return ResponseUtil.error(c, 'Search query is required');
        }

        try {
            const url = `https://api.douban.com/v2/book/search?apikey=${DOUBAN_API_KEY}&q=${encodeURIComponent(query)}&count=${count}`;
            const response = await axios.get(url);

            // 修改图片URL为代理URL
            const books = response.data.books.map((book: any) => ({
                ...book,
                image: book.image
                    ? `/api/admin/proxy/douban-image?url=${encodeURIComponent(book.image)}`
                    : null,
            }));

            return ResponseUtil.success(c, { books });
        } catch (error: any) {
            return ResponseUtil.error(c, error.message || 'Failed to search Douban books');
        }
    }

    @Get('/douban/book/:id', authMiddleware)
    async getDoubanBook(c: Context) {
        const { id } = c.req.param();
        if (!id) {
            return ResponseUtil.error(c, 'Book ID is required', 400);
        }

        try {
            const url = `https://api.douban.com/v2/book/${id}?apikey=${DOUBAN_API_KEY}`;
            const response = await axios.get(url);

            // 处理封面图片
            if (response.data.image) {
                response.data.image = await this.downloadAndSaveImage(response.data.image, id);
            }

            return ResponseUtil.success(c, response.data);
        } catch (error: any) {
            return ResponseUtil.error(c, error.message || 'Failed to get Douban book');
        }
    }

    @Get('/douban/download-image')
    async downloadDoubanImage(c: Context) {
        const imageUrl = c.req.query('url');
        const doubanId = c.req.query('doubanId');

        if (!imageUrl || !doubanId) {
            return ResponseUtil.error(c, 'Image URL and Douban ID are required', 400);
        }

        try {
            // 验证URL
            const url = new URL(imageUrl);
            if (!url.hostname.includes('douban')) {
                return ResponseUtil.error(c, 'Only Douban images are allowed', 400);
            }

            const localUrl = await this.downloadAndSaveImage(imageUrl, doubanId);

            // 如果返回的URL与输入相同，说明下载失败
            if (localUrl === imageUrl) {
                return ResponseUtil.error(c, 'Failed to download image', 500);
            }

            return ResponseUtil.success(c, { url: localUrl });
        } catch (error) {
            console.error('Error downloading image:', error);
            return ResponseUtil.error(c, 'Invalid image URL', 400);
        }
    }

    @Get('/proxy/douban-image')
    async proxyDoubanImage(c: Context) {
        const imageUrl = c.req.query('url');
        if (!imageUrl) {
            return ResponseUtil.error(c, 'Image URL is required', 400);
        }

        try {
            // 验证URL
            const url = new URL(imageUrl);
            if (!url.hostname.includes('douban')) {
                return ResponseUtil.error(c, 'Only Douban images are allowed', 400);
            }

            const response = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 5000,
                maxContentLength: 5 * 1024 * 1024, // 5MB
            });

            // 验证内容类型
            const contentType = response.headers['content-type'];
            if (!contentType?.startsWith('image/')) {
                return ResponseUtil.error(c, 'Invalid content type', 400);
            }

            return new Response(response.data, {
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=3600',
                },
            });
        } catch (error) {
            console.error('Failed to proxy image:', error);
            return ResponseUtil.error(c, 'Failed to proxy image', 500);
        }
    }


    // 统计功能相关的API
    @Get('/stats/overview', authMiddleware)
    async getStatsOverview(c: Context) {
        try {
            // 并行获取所有统计数据
            const [totalBooks, totalViews, totalDownloads, totalFileChunkSize, totalFileCount] = await Promise.all([
                // 总书籍数
                prisma.book.count(),
                // 总浏览量
                prisma.book.aggregate({
                    _sum: {
                        viewCount: true,
                    },
                }),
                // 总下载量
                prisma.book.aggregate({
                    _sum: {
                        downloadCount: true,
                    },
                }),
                // 从文件分块获取准确的总大小
                prisma.fileChunk.aggregate({
                    _sum: {
                        size: true,
                    },
                }),
                // 总文件数
                prisma.file.count(),
            ]);

            const totalViews_value = totalViews._sum.viewCount || 0;
            const totalDownloads_value = totalDownloads._sum.downloadCount || 0;
            const totalFileSizeBytes = totalFileChunkSize._sum.size || 0;

            // 计算流量（下载总大小）= 平均每次下载的文件大小 * 总下载次数
            // 假设平均每次下载一个完整文件
            const avgFileSizePerDownload = totalFileCount > 0 ? totalFileSizeBytes / totalFileCount : 0;
            const estimatedTrafficBytes = avgFileSizePerDownload * totalDownloads_value;

            console.log('Stats calculation:', {
                totalBooks,
                totalViews_value,
                totalDownloads_value,
                totalFileSizeBytes,
                totalFileCount,
                avgFileSizePerDownload,
                estimatedTrafficBytes
            });

            return ResponseUtil.success(c, {
                totalBooks,
                totalViews: totalViews_value,
                totalDownloads: totalDownloads_value,
                totalFileSize: totalFileSizeBytes,
                totalTraffic: estimatedTrafficBytes,
            });
        } catch (error: any) {
            console.error('Get stats overview error:', error);
            return ResponseUtil.error(c, error.message || 'Failed to get stats overview');
        }
    }

    @Get('/stats/top-books', authMiddleware)
    async getTopBooks(c: Context) {
        const { limit = '10', sortBy = 'views' } = c.req.query();
        const limitInt = parseInt(limit) || 10;
        
        try {
            const orderBy = sortBy === 'downloads' 
                ? { downloadCount: 'desc' as const }
                : { viewCount: 'desc' as const };

            const topBooks = await prisma.book.findMany({
                orderBy,
                take: limitInt,
                include: {
                    Category: {
                        select: {
                            name: true,
                            path: true,
                            color: true,
                        },
                    },
                },
            });

            return ResponseUtil.success(c, topBooks.map(book => ({
                id: book.id,
                title: book.title,
                author: book.author,
                viewCount: book.viewCount,
                downloadCount: book.downloadCount,
                category: book.Category,
                createdAt: book.createdAt,
            })));
        } catch (error: any) {
            console.error('Get top books error:', error);
            return ResponseUtil.error(c, error.message || 'Failed to get top books');
        }
    }

    @Get('/stats/category-stats', authMiddleware)
    async getCategoryStats(c: Context) {
        try {
            const categories = await prisma.category.findMany({
                orderBy: { index: 'asc' },
                include: {
                    books: {
                        select: {
                            viewCount: true,
                            downloadCount: true,
                            public: true,
                        },
                    },
                },
            });

            const categoryStats = categories.map(category => {
                const totalBooks = category.books.length;
                const publicBooks = category.books.filter(book => book.public).length;
                const totalViews = category.books.reduce((sum, book) => sum + book.viewCount, 0);
                const totalDownloads = category.books.reduce((sum, book) => sum + book.downloadCount, 0);

                return {
                    id: category.id,
                    name: category.name,
                    path: category.path,
                    color: category.color,
                    totalBooks,
                    publicBooks,
                    totalViews,
                    totalDownloads,
                };
            });

            return ResponseUtil.success(c, categoryStats);
        } catch (error: any) {
            console.error('Get category stats error:', error);
            return ResponseUtil.error(c, error.message || 'Failed to get category stats');
        }
    }

    @Get('/stats/recent-activity', authMiddleware)
    async getRecentActivity(c: Context) {
        const { limit = '20' } = c.req.query();
        const limitInt = parseInt(limit) || 20;
        
        try {
            // 获取最近有活动的书籍（有浏览或下载记录的）
            const recentBooks = await prisma.book.findMany({
                where: {
                    OR: [
                        { viewCount: { gt: 0 } },
                        { downloadCount: { gt: 0 } },
                    ],
                },
                orderBy: { updatedAt: 'desc' },
                take: limitInt,
                include: {
                    Category: {
                        select: {
                            name: true,
                            path: true,
                            color: true,
                        },
                    },
                    File: {
                        select: {
                            format: true,
                        },
                        take: 1, // 只取第一个文件格式作为示例
                    },
                },
            });

            // 构造活动列表，混合view和download活动
            const activities: any[] = [];
            
            recentBooks.forEach(book => {
                // 如果有下载记录，添加下载活动
                if (book.downloadCount > 0) {
                    activities.push({
                        id: `${book.id}-download`,
                        type: 'download',
                        bookTitle: book.title,
                        bookId: book.id,
                        format: book.File.length > 0 ? book.File[0].format : null,
                        category: book.Category,
                        timestamp: book.updatedAt,
                        count: book.downloadCount,
                    });
                }
                
                // 如果有浏览记录，添加浏览活动
                if (book.viewCount > 0) {
                    activities.push({
                        id: `${book.id}-view`,
                        type: 'view',
                        bookTitle: book.title,
                        bookId: book.id,
                        format: null,
                        category: book.Category,
                        timestamp: book.updatedAt,
                        count: book.viewCount,
                    });
                }
            });

            // 按时间排序并限制数量
            const sortedActivities = activities
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, limitInt);

            return ResponseUtil.success(c, sortedActivities);
        } catch (error: any) {
            console.error('Get recent activity error:', error);
            return ResponseUtil.error(c, error.message || 'Failed to get recent activity');
        }
    }

}
