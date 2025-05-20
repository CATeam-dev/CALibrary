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
        const categories = await prisma.category.findMany({ orderBy: { index: 'asc' } });
        return c.json({ code: 0, data: categories });
    }

    @Get('/category/:id')
    async getCategoryDetail(c: Context) {
        const { id } = c.req.param();
        const category = await prisma.category.findUnique({ where: { id } });
        if (!category) {
            return c.json({ code: 1, message: 'Category not found' });
        }
        return c.json({ code: 0, data: category });
    }

    @Post('/category')
    async createCategory(c: Context) {
        const { name, path, color } = await c.req.json();
        const category = await prisma.category.create({ data: { name, path, color } });
        return c.json({ code: 0, data: category });
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
            return c.json({ code: 0, data: category });
        } catch (error: any) {
            return c.json({ code: 1, message: error.message });
        }
    }

    @Delete('/category/:id')
    async deleteCategory(c: Context) {
        const { id } = c.req.param();
        const category = await prisma.category.findUnique({ where: { id } });
        if (!category) {
            return c.json({ code: 1, message: 'Category not found' });
        }
        const books = await prisma.book.findMany({ where: { categoryId: id } });
        if (books.length > 0) {
            return c.json({ code: 1, message: 'Category has books' });
        }
        await prisma.category.delete({ where: { id } });
        return c.json({ code: 0, message: 'Category deleted' });
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
        return c.json({
            code: 0,
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
            return c.json({ code: 1, message: 'Book not found' });
        }
        return c.json({
            code: 0,
            data: {
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
            },
        });
    }

    @Post('/book')
    async createBook(c: Context) {
        const {
            title,
            author,
            cover,
            categoryId,
            description,
            public: isPublic,
            zlib,
        } = await c.req.json();
        const book = await prisma.book.create({
            data: { title, author, cover, categoryId, description, public: isPublic, zlib },
        });
        return c.json({ code: 0, data: book });
    }

    @Put('/book/:id')
    async updateBook(c: Context) {
        const { id } = c.req.param();
        const data = await c.req.json();
        try {
            const book = await prisma.book.update({ where: { id }, data });
            return c.json({ code: 0, data: book });
        } catch (error: any) {
            return c.json({ code: 1, message: error.message });
        }
    }

    @Delete('/book/:id')
    async deleteBook(c: Context) {
        const { id } = c.req.param();
        const files = await prisma.file.findMany({ where: { bookId: id } });
        if (files.length > 0) {
            return c.json({ code: 1, message: '该书籍有关联的文件，请先删除文件或解除关联' });
        }
        await prisma.book.delete({ where: { id } });
        return c.json({ code: 0, message: 'Book deleted' });
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
        return c.json({ code: 0, files, total, page: pageInt, pageSize: pageSizeInt });
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
            return c.json({ code: 1, message: '文件不存在' });
        }
        return c.json({ code: 0, data: file });
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
            return c.json({ code: 0, data: file });
        } catch (error: any) {
            return c.json({ code: 1, message: error.message });
        }
    }

    @Delete('/file/:id')
    async deleteFile(c: Context) {
        const { id } = c.req.param();
        try {
            await prisma.fileChunk.deleteMany({ where: { fileId: id } });
            await prisma.file.delete({ where: { id } });
            return c.json({ code: 0, message: 'File deleted' });
        } catch (error: any) {
            return c.json({ code: 1, message: error.message });
        }
    }
}
