import type { MyContext } from '@/types/bot';

import path from 'path';
import { createHash } from 'crypto';

import { Bot } from 'grammy';
import fs from 'fs-extra';

import { prisma } from '../utils/db';
import logger from '../utils/logger';

// 文件块大小 (5MB)
const CHUNK_SIZE = 5 * 1024 * 1024;

// 确保存储路径存在
const storagePath = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage');
fs.ensureDirSync(storagePath);

logger.info(`文件存储路径: ${storagePath}`);

/**
 * 初始化文件处理bot
 */
export function initFileBot(bot: Bot<MyContext>) {
    // 处理文件消息
    bot.on(':document', async (ctx) => {
        try {
            if (!ctx.message) {
                logger.error('收到文档消息，但ctx.message为空');
                return;
            }

            const document = ctx.message.document;
            const fileId = document.file_id;
            const fileName = document.file_name || 'unknown_file';
            const fileSize = document.file_size || 0;

            logger.info(
                `接收到新文件: ${fileName} (${formatFileSize(fileSize)}), 文件ID: ${fileId}`
            );
            await ctx.reply(`收到文件: ${fileName} (${formatFileSize(fileSize)}), 正在处理...`);

            // 下载文件
            const fileInfo = await ctx.api.getFile(fileId);
            const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${fileInfo.file_path}`;
            logger.info(`文件下载链接: ${fileUrl}`);

            // 创建临时目录保存下载的文件
            const tempDir = path.join(storagePath, 'temp');
            fs.ensureDirSync(tempDir);

            const tempFilePath = path.join(tempDir, fileName);
            logger.info(`开始下载文件到: ${tempFilePath}`);

            // 下载文件 (使用与bot相同的代理设置)
            let response;
            if (process.env.PROXY_URL) {
                logger.info(`使用代理: ${process.env.PROXY_URL}`);
                response = await Bun.fetch(fileUrl, {
                    proxy: process.env.PROXY_URL,
                });
            } else {
                response = await fetch(fileUrl);
            }

            if (!response.ok) {
                throw new Error(`文件下载失败: ${response.status} ${response.statusText}`);
            }

            const fileBuffer = Buffer.from(await response.arrayBuffer());
            fs.writeFileSync(tempFilePath, fileBuffer);
            logger.info(`文件下载完成，大小: ${formatFileSize(fileBuffer.length)}`);

            // 计算文件哈希
            const fileHash = calculateHash(tempFilePath);
            logger.info(`文件哈希: ${fileHash}`);

            // 处理文件分块
            logger.info(`开始处理文件分块，总大小: ${formatFileSize(fileSize)}`);
            const chunks = await processFileChunks(tempFilePath, fileHash, fileSize);
            logger.info(`文件分块处理完成，共 ${chunks.length} 个分块`);

            // 保存文件信息到数据库
            const format = determineFileFormat(fileName);
            logger.info(`保存文件信息到数据库，格式: ${format}`);
            const fileRecord = await prisma.file.create({
                data: {
                    format,
                    size: fileSize,
                    desc: '',
                    hash: fileHash,
                    filename: fileName,
                    createdBy: ctx.from?.username || 'unknown',
                    bookId: null,
                    chunks: chunks.length,
                    FileChunks: {
                        create: chunks,
                    },
                },
            });
            logger.info(`文件记录创建成功，ID: ${fileRecord.id}`);

            // 删除临时文件
            fs.removeSync(tempFilePath);
            logger.info(`临时文件已删除: ${tempFilePath}`);

            await ctx.reply(`文件处理完成。文件ID: ${fileRecord.id}, 共${chunks.length}个分块`);
        } catch (error) {
            logger.error(`文件处理错误: ${error instanceof Error ? error.message : String(error)}`);
            if (error instanceof Error && error.stack) {
                logger.error(`错误堆栈: ${error.stack}`);
            }
            await ctx.reply('处理文件时出错，请稍后重试');
        }
    });

    logger.info('文件处理Bot已初始化');
}

/**
 * 从哈希值获取存储路径
 * 例如：q9eurhgkjhsxhi -> q9/eu/q9eurhgkjhsxhi.chk
 */
function getStoragePathFromHash(hash: string): string {
    // 使用前2个和3-4个字符作为目录
    const dir1 = hash.substring(0, 2);
    const dir2 = hash.substring(2, 4);
    return path.join(storagePath, dir1, dir2);
}

/**
 * 处理文件分块
 */
async function processFileChunks(filePath: string, fileHash: string, fileSize: number) {
    const chunks: { chunk: number; hash: string; size: number }[] = [];

    const fileBuffer = fs.readFileSync(filePath);
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    logger.info(`文件将被分为 ${totalChunks} 个块，每块大小约 ${formatFileSize(CHUNK_SIZE)}`);

    for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, fileSize);
        const chunkBuffer = fileBuffer.subarray(start, end);
        const chunkSize = chunkBuffer.length;

        // 计算块的哈希
        const chunkHash = createHash('sha256').update(chunkBuffer).digest('hex');

        // 获取块的存储路径
        const chunkDir = getStoragePathFromHash(chunkHash);
        fs.ensureDirSync(chunkDir);

        const chunkPath = path.join(chunkDir, `${chunkHash}.chk`);
        fs.writeFileSync(chunkPath, chunkBuffer);
        logger.debug(
            `块 ${i + 1}/${totalChunks} 已保存: ${chunkPath}, 大小: ${formatFileSize(chunkSize)}`
        );

        chunks.push({
            chunk: i,
            hash: chunkHash,
            size: chunkSize,
        });
    }

    return chunks;
}

/**
 * 计算文件哈希
 */
function calculateHash(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    return createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * 根据文件名确定文件格式
 */
function determineFileFormat(fileName: string): 'PDF' | 'EPUB' | 'TXT' {
    const ext = path.extname(fileName).toLowerCase();

    if (ext === '.pdf') return 'PDF';
    if (ext === '.epub') return 'EPUB';
    return 'TXT'; // 默认为TXT
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
