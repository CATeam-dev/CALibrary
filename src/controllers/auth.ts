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

const BOT_TOKEN = process.env.BOT_TOKEN;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || 'http://localhost:3000'; // 用于构建回调URL

const TELEGRAM_ADMIN_USERS = (process.env.TELEGRAM_ADMIN_USERS || 'codyee,Ancker_0').split(',');
const GITHUB_ADMIN_USERS = (process.env.GITHUB_ADMIN_USERS || '').split(',').filter((u) => u); // 从环境变量读取，默认为空

@Controller('/auth')
export class AuthController {
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

            if (!TELEGRAM_ADMIN_USERS.includes(user.username)) {
                console.log(`Telegram login attempt by non-admin: ${user.username}`);
                return ResponseUtil.error(
                    c,
                    'Access denied. User is not an authorized admin.',
                    403
                );
            }

            // 创建 JWT token
            const token = await jwtCreate({
                userId: tgUserId,
                username: user.username,
                name: user.name,
                provider: 'telegram',
                exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7天过期
            });

            // 设置HttpOnly和Secure的Cookie
            setCookie(c, 'auth_token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production', // 仅在生产环境中使用Secure
                sameSite: 'Lax',
                path: '/',
                maxAge: 7 * 24 * 60 * 60, // Cookie过期时间与JWT一致
            });

            return ResponseUtil.success(c, {
                user,
                expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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

            // 检查用户名是否在管理员列表中
            if (!username || !TELEGRAM_ADMIN_USERS.includes(username)) {
                console.log(`Telegram widget login attempt by non-admin: ${username}`);
                return ResponseUtil.error(
                    c,
                    'Access denied. User is not an authorized admin via widget.',
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
            const token = await jwtCreate({
                userId: id.toString(),
                username,
                name: user.name,
                provider: 'telegram-widget',
                exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7天过期
            });

            // 设置HttpOnly和Secure的Cookie
            setCookie(c, 'auth_token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production', // 仅在生产环境中使用Secure
                sameSite: 'Lax',
                path: '/',
                maxAge: 7 * 24 * 60 * 60, // Cookie过期时间与JWT一致
            });

            return ResponseUtil.success(c, {
                user,
                expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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

            // Check if the GitHub user is an admin
            if (!GITHUB_ADMIN_USERS.includes(githubUsername)) {
                console.log(`GitHub login attempt by non-admin: ${githubUsername}`);
                return ResponseUtil.error(
                    c,
                    'Access denied. User is not an authorized GitHub admin.',
                    403
                );
            }

            const userPayload = {
                provider_user_id: githubUser.id.toString(),
                username: githubUsername,
                name: githubUser.name || githubUsername,
                email: githubUser.email, // May be null if not public
                avatar_url: githubUser.avatar_url,
                provider: 'github',
            };

            const jwtToken = await jwtCreate({
                sub: githubUser.id.toString(),
                ...userPayload,
                exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7天过期
            });

            setCookie(c, 'auth_token', jwtToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'Lax',
                path: '/',
                maxAge: 7 * 24 * 60 * 60,
            });

            // Redirect to frontend admin page or a success page
            // For SPA, it's often better to return user data and let frontend handle redirect.
            // Here, we redirect to the admin dashboard as an example.
            // return c.redirect('/admin', 302); // Or return user data
            return ResponseUtil.success(c, {
                user: userPayload,
                expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                // message: 'GitHub authentication successful. Redirecting...' // Optional message
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
                if (payload.provider === 'telegram' || payload.provider === 'telegram-widget') {
                    if (!payload.username || !TELEGRAM_ADMIN_USERS.includes(payload.username)) {
                        deleteCookie(c, 'auth_token', { path: '/' });
                        return ResponseUtil.error(
                            c,
                            'User is no longer an authorized Telegram admin.',
                            403
                        );
                    }
                } else if (payload.provider === 'github') {
                    if (!payload.username || !GITHUB_ADMIN_USERS.includes(payload.username)) {
                        deleteCookie(c, 'auth_token', { path: '/' });
                        return ResponseUtil.error(
                            c,
                            'User is no longer an authorized GitHub admin.',
                            403
                        );
                    }
                } else {
                    deleteCookie(c, 'auth_token', { path: '/' });
                    return ResponseUtil.error(c, 'Unknown authentication provider in token.', 401);
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
                setCookie(c, 'auth_token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'Lax',
                    path: '/',
                    maxAge: 7 * 24 * 60 * 60,
                });

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
