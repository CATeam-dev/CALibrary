import { prisma } from '@/utils/db';

export async function init() {
    const categories = await prisma.category.findMany();
    if (categories.length === 0) {
        await prisma.category.create({
            data: { name: '未分类', path: 'uncategorized', color: '#cccccc' },
        });
    }
}
