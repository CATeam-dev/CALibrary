import type { Context } from 'hono';

import { Controller } from '@/decorators/controller';
import { Delete, Get, Post, Put } from '@/decorators/http';
import { ResponseUtil } from '@/core/response';
import { prisma } from '@/utils/db';

@Controller('/admin')
export class AdminController {
    @Get('/me')
    async me(c: Context) {
        // 通过JWT中间件，这里已经是认证过的管理员
        return ResponseUtil.success(c, { role: 'admin' });
    }

    @Get('/category')
    async category(c: Context) {
        // 获取所有分类及其包含的书籍数量
        const categories = await prisma.category.findMany({
            orderBy: { index: 'asc' },
        });

        // 手动获取每个分类的书籍数量
        const categoriesWithBookCount = await Promise.all(
            categories.map(async (category) => {
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

    @Get('/category/:path')
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

    @Post('/category')
    async createCategory(c: Context) {
        const { name, path, color } = await c.req.json();
        const category = await prisma.category.create({ data: { name, path, color } });
        return ResponseUtil.success(c, category);
    }

    @Put('/category/:id')
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

    @Delete('/category/:id')
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

    @Get('/book')
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
            books: books.map((b) => ({
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

    @Get('/book/:id')
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

    @Post('/book')
    async createBook(c: Context) {
        const { title, author, cover, categoryId, description, zlib } = await c.req.json();
        const book = await prisma.book.create({
            data: { title, author, cover, categoryId, description, zlib },
        });
        return ResponseUtil.success(c, book);
    }

    @Put('/book/:id')
    async updateBook(c: Context) {
        const { id } = c.req.param();
        const data = await c.req.json();

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

    @Delete('/book/:id')
    async deleteBook(c: Context) {
        const { id } = c.req.param();
        const files = await prisma.file.findMany({ where: { bookId: id } });
        if (files.length > 0) {
            return ResponseUtil.error(c, 'Book has files, please delete files or unbind');
        }
        await prisma.book.delete({ where: { id } });
        return ResponseUtil.success(c, 'Book deleted');
    }

    @Get('/file')
    async getFiles(c: Context) {
        const { bookId, page, pageSize } = c.req.query();
        const pageInt = parseInt(page || '1') || 1;
        const pageSizeInt = parseInt(pageSize || '10') || 10;
        const where = bookId ? { bookId } : {};
        const total = await prisma.file.count({ where });
        const files = await prisma.file.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (pageInt - 1) * pageSizeInt,
            take: pageSizeInt,
            include: { Book: { select: { id: true, title: true } } },
        });
        return ResponseUtil.success(c, { files, total, page: pageInt, pageSize: pageSizeInt });
    }

    @Get('/file/:id')
    async getFileDetail(c: Context) {
        const { id } = c.req.param();
        const file = await prisma.file.findUnique({
            where: { id },
            include: {
                Book: { select: { id: true, title: true } },
                FileChunks: { orderBy: { chunk: 'asc' } },
            },
        });
        if (!file) {
            return ResponseUtil.error(c, 'File not found');
        }
        return ResponseUtil.success(c, file);
    }

    @Put('/file/:id')
    async updateFile(c: Context) {
        const { id } = c.req.param();
        const { bookId, desc } = await c.req.json();
        console.log(await c.req.json(), bookId);
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

    @Delete('/file/:id')
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
}
