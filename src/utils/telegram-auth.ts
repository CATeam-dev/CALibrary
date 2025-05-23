import { createHash, createHmac } from 'crypto';

export interface TelegramUser {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
    photo_url?: string;
}

export interface TelegramWebAppInitData {
    user?: TelegramUser;
    chat_instance?: string;
    chat_type?: string;
    auth_date: number;
    hash: string;
}

/**
 * 验证Telegram WebApp初始化数据
 */
export function validateTelegramWebAppData(
    initData: string,
    botToken: string
): TelegramWebAppInitData | null {
    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');

        if (!hash) {
            return null;
        }

        // 移除hash参数
        urlParams.delete('hash');

        // 按字母顺序排序参数
        const sortedParams = Array.from(urlParams.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        // 创建密钥
        const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();

        // 计算期望的hash
        const expectedHash = createHmac('sha256', secretKey).update(sortedParams).digest('hex');

        // 验证hash
        if (hash !== expectedHash) {
            return null;
        }

        // 解析数据
        const result: TelegramWebAppInitData = {
            auth_date: parseInt(urlParams.get('auth_date') || '0'),
            hash,
        };

        const userStr = urlParams.get('user');
        if (userStr) {
            result.user = JSON.parse(decodeURIComponent(userStr));
        }

        const chatInstance = urlParams.get('chat_instance');
        if (chatInstance) {
            result.chat_instance = chatInstance;
        }

        const chatType = urlParams.get('chat_type');
        if (chatType) {
            result.chat_type = chatType;
        }

        // 检查数据是否过期（5分钟内有效）
        const now = Math.floor(Date.now() / 1000);
        if (now - result.auth_date > 300) {
            return null;
        }

        return result;
    } catch (error) {
        console.error('Telegram WebApp data validation error:', error);
        return null;
    }
}

/**
 * 检查用户是否为管理员
 */
export function isAdminUser(userId: number): boolean {
    const adminIds =
        process.env.TELEGRAM_ADMIN_IDS?.split(',').map((id) => parseInt(id.trim())) || [];
    return adminIds.includes(userId);
}
