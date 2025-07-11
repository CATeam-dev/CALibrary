import type { Context } from 'hono';

import crypto from 'crypto';

import { verify } from 'hono/jwt';
import { validate, parse } from '@telegram-apps/init-data-node';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'; // 明确导入 cookie 处理函数
import { HTTPException } from 'hono/http-exception';

import { Controller } from '@/decorators/controller';
import { Post, Get } from '@/decorators/http';
import { ResponseUtil } from '@/core/response';
import { jwtCreate, jwtSecret } from '@/utils/jwt';

// 环境变量配置
const BOT_TOKEN = process.env.BOT_TOKEN;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const APP_URL = process.env.APP_URL;

// 管理员用户列表
const TELEGRAM_ADMIN_USERS = (process.env.TELEGRAM_ADMIN_USERS || '').split(',');
const GITHUB_ADMIN_USERS = (process.env.GITHUB_ADMIN_USERS || '').split(',').filter((u) => u);

// JWT Token 过期时间 (7天)
const TOKEN_EXPIRE_TIME = 7 * 24 * 60 * 60;

/**
 * 设置认证Cookie
 */
function setAuthCookie(c: Context, token: string): void {
    setCookie(c, 'auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        path: '/',
        maxAge: TOKEN_EXPIRE_TIME,
    });
}

/**
 * 创建JWT token
 */
async function createJwtToken(userPayload: any): Promise<string> {
    return await jwtCreate({
        ...userPayload,
        exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRE_TIME,
    });
}

/**
 * 检查用户是否为管理员
 */
function checkAdminPermission(provider: string, username: string): boolean {
    switch (provider) {
        case 'telegram':
        case 'telegram-widget':
            return TELEGRAM_ADMIN_USERS.includes(username);
        case 'github':
            return GITHUB_ADMIN_USERS.includes(username);
        default:
            return false;
    }
}

@Controller('/auth')
export class AuthController {
    @Get('/debug-config')
    async debugConfig(c: Context) {
        return ResponseUtil.success(c, {
            telegramAdmins: TELEGRAM_ADMIN_USERS,
            githubAdmins: GITHUB_ADMIN_USERS,
            hasBotToken: !!BOT_TOKEN,
            hasGithubConfig: !!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET),
            appUrl: APP_URL,
        });
    }
    @Post('/telegram')
    async telegramAuth(c: Context) {
        try {
            const body = await c.req.json();
            const { initDataRaw } = body;

            if (!initDataRaw) {
                return ResponseUtil.error(c, 'initDataRaw is required', 400);
            }

            if (!BOT_TOKEN) {
                return ResponseUtil.error(c, 'Bot token not configured', 500);
            }

            // 验证 Telegram 初始数据
            try {
                validate(initDataRaw, BOT_TOKEN);
            } catch {
                return ResponseUtil.error(c, 'Invalid Telegram data', 401);
            }

            // 解析初始数据
            const initData = parse(initDataRaw);

            if (!initData.user) {
                return ResponseUtil.error(c, 'User data not found', 401);
            }

            const tgUserId = initData.user.id.toString();
            const user = {
                id: tgUserId,
                name: `${initData.user.first_name} ${initData.user.last_name || ''}`.trim(),
                username: initData.user.username,
                is_premium: initData.user.is_premium,
                language_code: initData.user.language_code,
            };

            if (!user.username) {
                return ResponseUtil.error(c, 'User username not found', 401);
            }

            // 检查管理员权限
            if (!checkAdminPermission('telegram', user.username)) {
                console.log(
                    `Telegram login attempt by non-admin: ${user.username}. Available admins: ${TELEGRAM_ADMIN_USERS.join(', ')}`
                );
                return ResponseUtil.error(
                    c,
                    `Access denied. User ${user.username} is not an authorized admin. Available admins: ${TELEGRAM_ADMIN_USERS.join(', ')}`,
                    403
                );
            }

            // 创建 JWT token
            const token = await createJwtToken({
                sub: tgUserId,
                userId: tgUserId,
                username: user.username,
                name: user.name,
                provider: 'telegram',
            });

            // 设置认证Cookie
            setAuthCookie(c, token);

            return ResponseUtil.success(c, {
                user,
                expires: new Date(Date.now() + TOKEN_EXPIRE_TIME * 1000).toISOString(),
            });
        } catch (error) {
            console.error('Telegram auth error:', error);
            return ResponseUtil.error(c, 'Authentication failed', 500, true, error as Error);
        }
    }

    @Post('/telegram-widget')
    async telegramWidgetAuth(c: Context) {
        try {
            const body = await c.req.json();
            const { id, first_name, last_name, username, photo_url, auth_date, hash } = body;

            if (!BOT_TOKEN) {
                return ResponseUtil.error(c, 'Bot token not configured', 500);
            }

            // 验证必需字段
            if (!id || !auth_date || !hash) {
                return ResponseUtil.error(c, 'Missing required fields', 400);
            }

            // 构建数据检查字符串
            const dataCheckArr: string[] = [];
            if (auth_date) dataCheckArr.push(`auth_date=${auth_date}`);
            if (first_name) dataCheckArr.push(`first_name=${first_name}`);
            if (id) dataCheckArr.push(`id=${id}`);
            if (last_name) dataCheckArr.push(`last_name=${last_name}`);
            if (photo_url) dataCheckArr.push(`photo_url=${photo_url}`);
            if (username) dataCheckArr.push(`username=${username}`);

            // 按字母顺序排序
            dataCheckArr.sort();
            const dataCheckString = dataCheckArr.join('\n');

            // 计算密钥
            const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();

            // 计算 HMAC-SHA256
            const calculatedHash = crypto
                .createHmac('sha256', secretKey)
                .update(dataCheckString)
                .digest('hex');

            // 验证哈希
            if (calculatedHash !== hash) {
                return ResponseUtil.error(c, 'Invalid authentication data', 401);
            }

            // 检查数据是否过期（5分钟内有效）
            const authTime = parseInt(auth_date);
            const currentTime = Math.floor(Date.now() / 1000);
            if (currentTime - authTime > 300) {
                return ResponseUtil.error(c, 'Authentication data expired', 401);
            }

            // 检查管理员权限
            if (!checkAdminPermission('telegram-widget', username)) {
                console.log(
                    `Telegram widget login attempt by non-admin: ${username}. Available admins: ${TELEGRAM_ADMIN_USERS.join(', ')}`
                );
                return ResponseUtil.error(
                    c,
                    `Access denied. User ${username} is not an authorized admin via widget. Available admins: ${TELEGRAM_ADMIN_USERS.join(', ')}`,
                    403
                );
            }

            const user = {
                id: id.toString(),
                name: `${first_name} ${last_name || ''}`.trim(),
                username,
                photo_url,
            };

            // 创建 JWT token
            const token = await createJwtToken({
                sub: id.toString(),
                userId: id.toString(),
                username,
                name: user.name,
                provider: 'telegram-widget',
            });

            // 设置认证Cookie
            setAuthCookie(c, token);

            return ResponseUtil.success(c, {
                user,
                expires: new Date(Date.now() + TOKEN_EXPIRE_TIME * 1000).toISOString(),
            });
        } catch (error) {
            console.error('Telegram widget auth error:', error);
            return ResponseUtil.error(c, 'Authentication failed', 500, true, error as Error);
        }
    }

    @Get('/github/login-url')
    async githubLoginUrl(c: Context) {
        if (!GITHUB_CLIENT_ID) {
            console.error('GitHub Client ID not configured');
            return ResponseUtil.error(c, 'GitHub authentication is not configured.', 500);
        }
        const state = crypto.randomBytes(16).toString('hex');
        // Store state in cookie to verify later
        setCookie(c, 'github_oauth_state', state, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax',
            path: '/',
            maxAge: 600, // 10 minutes
        });

        const params = new URLSearchParams({
            client_id: GITHUB_CLIENT_ID,
            redirect_uri: `${APP_URL}/api/auth/github/callback`,
            scope: 'read:user user:email', // Request user's public profile and primary email
            state: state,
        });
        const loginUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
        return ResponseUtil.success(c, { loginUrl });
    }

    @Get('/github/callback')
    async githubCallback(c: Context) {
        const query = c.req.query();
        const code = query['code'];
        const state = query['state'];
        const storedState = getCookie(c, 'github_oauth_state');

        deleteCookie(c, 'github_oauth_state', { path: '/' }); // Clean up state cookie

        if (!code || !state || state !== storedState) {
            console.error('GitHub callback error: state mismatch or missing code/state.', {
                code,
                state,
                storedState,
            });
            return ResponseUtil.error(
                c,
                'Invalid GitHub callback: State mismatch or missing parameters.',
                400
            );
        }

        if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
            console.error('GitHub OAuth credentials not configured');
            return ResponseUtil.error(
                c,
                'GitHub authentication is not properly configured on the server.',
                500
            );
        }

        try {
            // Exchange code for access token
            let tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    client_id: GITHUB_CLIENT_ID,
                    client_secret: GITHUB_CLIENT_SECRET,
                    code: code,
                    redirect_uri: `${APP_URL}/api/auth/github/callback`,
                }),
            });

            if (!tokenResponse.ok) {
                const errorBody = await tokenResponse.text();
                console.error('GitHub token exchange failed:', tokenResponse.status, errorBody);
                throw new HTTPException(tokenResponse.status as any, {
                    message: `GitHub token exchange failed: ${errorBody}`,
                });
            }
            const tokenData = (await tokenResponse.json()) as {
                access_token?: string;
                error?: string;
                error_description?: string;
            };

            if (tokenData.error || !tokenData.access_token) {
                console.error('Error obtaining GitHub access token:', tokenData);
                return ResponseUtil.error(
                    c,
                    tokenData.error_description || 'Failed to obtain GitHub access token.',
                    400
                );
            }
            const accessToken = tokenData.access_token;

            // Fetch user information from GitHub
            let userResponse = await fetch('https://api.github.com/user', {
                headers: {
                    Authorization: `token ${accessToken}`,
                    Accept: 'application/vnd.github.v3+json',
                },
            });
            if (!userResponse.ok) {
                const errorBody = await userResponse.text();
                console.error('GitHub user fetch failed:', userResponse.status, errorBody);
                throw new HTTPException(userResponse.status as any, {
                    message: `GitHub user fetch failed: ${errorBody}`,
                });
            }
            const githubUser = (await userResponse.json()) as {
                login: string;
                id: number;
                name?: string;
                email?: string;
                avatar_url?: string;
            };

            const githubUsername = githubUser.login;
            if (!githubUsername) {
                return ResponseUtil.error(c, 'Could not retrieve GitHub username.', 400);
            }

            // 检查管理员权限
            if (!checkAdminPermission('github', githubUsername)) {
                console.log(`GitHub login attempt by non-admin: ${githubUsername}`);
                return ResponseUtil.error(
                    c,
                    'Access denied. User is not an authorized GitHub admin.',
                    403
                );
            }

            const userPayload = {
                sub: githubUser.id.toString(),
                provider_user_id: githubUser.id.toString(),
                username: githubUsername,
                name: githubUser.name || githubUsername,
                email: githubUser.email,
                avatar_url: githubUser.avatar_url,
                provider: 'github',
            };

            // 创建JWT token并设置Cookie
            const jwtToken = await createJwtToken(userPayload);
            setAuthCookie(c, jwtToken);

            // For browser requests, redirect to the success page
            const userAgent = c.req.header('User-Agent') || '';
            const isApiRequest = c.req.header('Accept')?.includes('application/json');

            if (!isApiRequest && userAgent.includes('Mozilla')) {
                // Browser request - redirect to success page
                return c.redirect('/admin/auth/github/success', 302);
            }

            // API request - return JSON response
            return ResponseUtil.success(c, {
                user: userPayload,
                expires: new Date(Date.now() + TOKEN_EXPIRE_TIME * 1000).toISOString(),
            });
        } catch (error) {
            console.error('GitHub callback processing error:', error);
            if (error instanceof HTTPException) {
                return ResponseUtil.error(c, error.message, error.status);
            }
            return ResponseUtil.error(
                c,
                'GitHub authentication failed during callback processing.',
                500,
                true,
                error as Error
            );
        }
    }

    @Post('/verify')
    async verifyToken(c: Context) {
        try {
            const token = getCookie(c, 'auth_token');
            if (!token) {
                return ResponseUtil.error(c, 'No authentication token found in cookie.', 401);
            }

            const secret = jwtSecret;
            if (!secret) {
                console.error('JWT secret is not configured.');
                return ResponseUtil.error(
                    c,
                    'Server authentication mechanism is not configured.',
                    500
                );
            }

            try {
                const payload = (await verify(token, secret)) as any; // Cast to any for easier access

                if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
                    deleteCookie(c, 'auth_token', { path: '/' });
                    return ResponseUtil.error(c, 'Token expired.', 401);
                }

                // Basic check for essential payload fields
                if (!payload.sub || !payload.provider || !payload.username) {
                    console.error('Invalid token payload:', payload);
                    deleteCookie(c, 'auth_token', { path: '/' });
                    return ResponseUtil.error(c, 'Invalid token payload structure.', 401);
                }

                // Re-validate against admin lists based on provider
                if (!checkAdminPermission(payload.provider, payload.username)) {
                    deleteCookie(c, 'auth_token', { path: '/' });
                    return ResponseUtil.error(c, 'User is no longer an authorized admin.', 403);
                }

                const userContext = {
                    id: payload.sub, // This is the provider_user_id
                    provider_user_id: payload.sub,
                    username: payload.username,
                    name: payload.name,
                    provider: payload.provider,
                    email: payload.email, // if available
                    avatar_url: payload.avatar_url, // if available
                };

                // Token is valid, refresh cookie expiration (sliding session)
                setAuthCookie(c, token);

                return ResponseUtil.success(c, { valid: true, user: userContext });
            } catch (err) {
                console.warn('Token verification failed:', err);
                deleteCookie(c, 'auth_token', { path: '/' });
                return ResponseUtil.error(c, 'Invalid or malformed token.', 401);
            }
        } catch (error) {
            console.error('Verify token endpoint error:', error);
            return ResponseUtil.error(
                c,
                'Token verification process failed.',
                500,
                true,
                error as Error
            );
        }
    }

    @Post('/logout')
    async logout(c: Context) {
        try {
            // 从Cookie中获取token，如果存在则尝试验证一下，主要为了记录是哪个用户登出 (可选)
            const token = getCookie(c, 'auth_token');
            if (token) {
                try {
                    const secret = jwtSecret;
                    if (secret) {
                        const payload = (await verify(token, secret)) as any;
                        console.log(
                            `User logged out: ${payload.username} (Provider: ${payload.provider})`
                        );
                    }
                } catch (e) {
                    // Ignore if token is invalid, just proceed to delete cookie
                    console.warn(
                        'Error verifying token during logout, cookie will be cleared anyway:',
                        e
                    );
                }
            }

            deleteCookie(c, 'auth_token', {
                path: '/',
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'Lax',
            });
            return ResponseUtil.success(c, { message: 'Logged out successfully' });
        } catch (error) {
            console.error('Logout error:', error);
            return ResponseUtil.error(c, 'Logout failed', 500, true, error as Error);
        }
    }
}
