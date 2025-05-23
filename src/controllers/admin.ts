import type { Context } from 'hono';

import { join } from 'path';
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'fs';
import { pipeline } from 'stream/promises';

import axios from 'axios';

import { Controller } from '@/decorators/controller';
import { Delete, Get, Post, Put } from '@/decorators/http';
import { ResponseUtil } from '@/core/response';
import { prisma } from '@/utils/db';
import { telegramAuthMiddleware } from '@/middleware/telegram-auth';

const DOUBAN_API_KEY = '0ac44ae016490db2204ce0a042db2916';
const COVERS_DIR = join(process.cwd(), 'uploads', 'covers');

// 确保封面目录存在
if (!existsSync(COVERS_DIR)) {
    mkdirSync(COVERS_DIR, { recursive: true });
}

@Controller('/admin')
export class AdminController {
    @Get('/me', telegramAuthMiddleware)
    async me(c: Context) {
        // 通过 Telegram 认证中间件，这里已经是认证过的管理员
        const user = c.get('user');
        return ResponseUtil.success(c, {
            role: 'admin',
            user: user,
        });
    }

    @Get('/category', telegramAuthMiddleware)
    async category(c: Context) {
        // 获取所有分类及其包含的书籍数量
        const categories = await prisma.category.findMany({
            orderBy: { index: 'asc' },
        });

        console.log(categories);

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

    @Get('/category/:path', telegramAuthMiddleware)
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

    @Post('/category', telegramAuthMiddleware)
    async createCategory(c: Context) {
        const { name, path, color } = await c.req.json();
        const category = await prisma.category.create({ data: { name, path, color } });
        return ResponseUtil.success(c, category);
    }

    @Put('/category/:id', telegramAuthMiddleware)
    async updateCategory(c: Context) {
        const { id } = c.req.param();
        const { name, path, color } = await c.req.json();
        try {
            const category = await prisma.category.update({
                where: { id },
                data: { name, path, color },
            });
            return ResponseUtil.success(c, category);
        } catch (error: any) {
            return ResponseUtil.error(c, error.message);
        }
    }

    @Delete('/category/:id', telegramAuthMiddleware)
    async deleteCategory(c: Context) {
        const { id } = c.req.param();
        const category = await prisma.category.findUnique({ where: { id } });
        if (!category) {
            return ResponseUtil.error(c, 'Category not found');
        }
        const books = await prisma.book.findMany({ where: { categoryId: id } });
        if (books.length > 0) {
            return ResponseUtil.error(c, 'Category has books');
        }
        await prisma.category.delete({ where: { id } });
        return ResponseUtil.success(c, 'Category deleted');
    }

    @Get('/book', telegramAuthMiddleware)
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
        });
    }

    @Get('/book/:id', telegramAuthMiddleware)
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

    @Post('/book', telegramAuthMiddleware)
    async createBook(c: Context) {
        const { title, author, cover, categoryId, description, doubanId } = await c.req.json();

        // 如果是豆瓣图片链接，先下载到本地
        let localCover = cover;
        if (cover?.includes('/api/admin/proxy/douban-image')) {
            const originalUrl = new URL(cover).searchParams.get('url');
            if (originalUrl) {
                localCover = await this.downloadAndSaveImage(originalUrl);
            }
        }

        const book = await prisma.book.create({
            data: {
                title,
                author,
                cover: localCover,
                categoryId,
                description,
                doubanId,
            },
        });
        return ResponseUtil.success(c, book);
    }

    @Put('/book/:id', telegramAuthMiddleware)
    async updateBook(c: Context) {
        const { id } = c.req.param();
        const data = await c.req.json();

        // 如果是豆瓣图片链接，先下载到本地
        if (data.cover?.includes('/api/admin/proxy/douban-image')) {
            const originalUrl = new URL(data.cover).searchParams.get('url');
            if (originalUrl) {
                data.cover = await this.downloadAndSaveImage(originalUrl);
            }
        }

        if (data.public) {
            // check format exists
            const file = await prisma.file.findFirst({
                where: { bookId: id },
            });
            if (!file) {
                return ResponseUtil.error(c, 'Book has no format');
            }
        }

        try {
            const book = await prisma.book.update({ where: { id }, data });
            return ResponseUtil.success(c, book);
        } catch (error: any) {
            return ResponseUtil.error(c, error.message);
        }
    }

    @Delete('/book/:id', telegramAuthMiddleware)
    async deleteBook(c: Context) {
        const { id } = c.req.param();
        const files = await prisma.file.findMany({ where: { bookId: id } });
        if (files.length > 0) {
            return ResponseUtil.error(c, 'Book has files, please delete files or unbind');
        }
        await prisma.book.delete({ where: { id } });
        return ResponseUtil.success(c, 'Book deleted');
    }

    @Get('/file', telegramAuthMiddleware)
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
        });
    }

    @Get('/file/:id', telegramAuthMiddleware)
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

    @Put('/file/:id', telegramAuthMiddleware)
    async updateFile(c: Context) {
        const { id } = c.req.param();
        const { bookId, desc } = await c.req.json();

        // 如果是解绑操作（bookId从有值变为null）
        if (bookId === null) {
            // 先查询当前文件
            const currentFile = await prisma.file.findUnique({
                where: { id },
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
                where: { id },
                data: {
                    bookId,
                    desc,
                },
            });
            return ResponseUtil.success(c, file);
        } catch (error: any) {
            return ResponseUtil.error(c, error.message);
        }
    }

    @Delete('/file/:id', telegramAuthMiddleware)
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

    // 下载并保存豆瓣图片（仅在保存图书时使用）
    private async downloadAndSaveImage(imageUrl: string): Promise<string> {
        try {
            // 验证URL
            const url = new URL(imageUrl);
            if (!url.hostname.includes('douban')) {
                throw new Error('Only Douban images are allowed');
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

            const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
            const localPath = join(COVERS_DIR, filename);

            await pipeline(response.data, createWriteStream(localPath));

            return `/api/admin/covers/${filename}`;
        } catch (error) {
            console.error('Failed to download image:', error);
            // 返回原始URL作为备选
            return imageUrl;
        }
    }

    @Get('/covers/:filename')
    async getCoverImage(c: Context) {
        const filename = c.req.param('filename');
        if (!filename) {
            return ResponseUtil.error(c, 'Filename is required', 400);
        }

        const filepath = join(COVERS_DIR, filename);

        if (!existsSync(filepath)) {
            return ResponseUtil.error(c, 'Image not found', 404);
        }

        const file = readFileSync(filepath);
        return new Response(file, {
            headers: {
                'Content-Type': 'image/jpeg',
                'Cache-Control': 'public, max-age=31536000',
            },
        });
    }

    @Get('/douban/search', telegramAuthMiddleware)
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

    @Get('/douban/book/:id', telegramAuthMiddleware)
    async getDoubanBook(c: Context) {
        const { id } = c.req.param();

        try {
            const url = `https://api.douban.com/v2/book/${id}?apikey=${DOUBAN_API_KEY}`;
            const response = await axios.get(url);

            // 处理封面图片
            if (response.data.image) {
                response.data.image = await this.downloadAndSaveImage(response.data.image);
            }

            return ResponseUtil.success(c, response.data);
        } catch (error: any) {
            return ResponseUtil.error(c, error.message || 'Failed to get Douban book');
        }
    }

    @Get('/douban/download-image')
    async downloadDoubanImage(c: Context) {
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

            const localUrl = await this.downloadAndSaveImage(imageUrl);

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
}
