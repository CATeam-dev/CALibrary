# Telegram 认证设置指南

本项目已集成 Telegram 认证功能，支持两种认证方式：
1. **Telegram Mini App 认证** - 在 Telegram 应用内使用
2. **Telegram Web OAuth 认证** - 在普通浏览器中使用

## 环境变量配置

在 `.env` 文件中添加以下配置：

```env
# Telegram Bot 配置
BOT_TOKEN=your_telegram_bot_token_here
BOT_USERNAME=your_bot_username_here

# 前端 URL 配置（用于 OAuth 回调）
FRONTEND_URL=http://localhost:3000
```

## 获取 Telegram Bot Token 和用户名

1. 在 Telegram 中找到 [@BotFather](https://t.me/BotFather)
2. 发送 `/start` 命令开始创建机器人
3. 发送 `/newbot` 命令创建新机器人
4. 按照提示设置机器人名称和用户名
5. 获取 Bot Token 并设置到 `BOT_TOKEN` 环境变量中
6. 记录机器人用户名（不包含 @），设置到 `BOT_USERNAME` 环境变量中

## 设置 Telegram Mini App（可选）

如果需要支持 Mini App 认证：

1. 向 BotFather 发送 `/newapp` 命令
2. 选择你的机器人
3. 设置 Mini App 的名称、描述和图标
4. 设置 Web App URL 为你的前端地址（如：`https://yourdomain.com/admin`）
5. 完成设置后，用户可以通过机器人菜单访问 Mini App

## 设置 Telegram Web OAuth

对于浏览器端认证，需要设置 OAuth 域名：

1. 向 BotFather 发送 `/setdomain` 命令
2. 选择你的机器人
3. 设置允许的域名（如：`yourdomain.com`）
4. 确认设置

## 认证流程

### 在 Telegram Mini App 中
1. 用户在 Telegram 中打开 Mini App
2. 系统自动获取 Telegram 初始数据（通过多种方式）
3. 后端使用 BOT_TOKEN 验证初始数据的签名
4. 生成 JWT token（使用 BOT_TOKEN 作为密钥）并返回给前端
5. 前端存储 token 并允许访问管理面板

### 在普通浏览器中
1. 用户访问 `/admin` 页面
2. 系统检测到不在 Telegram 环境中
3. 显示"使用 Telegram 登录"按钮
4. 点击按钮后跳转到 Telegram OAuth 页面
5. 用户在 Telegram OAuth 页面授权
6. Telegram 重定向回 `/auth/telegram/callback` 页面
7. 回调页面验证授权数据并生成 JWT token
8. 自动跳转到管理面板

## 技术实现

### 后端 API 端点

- `GET /auth/telegram-login-url` - 获取 Telegram OAuth 登录 URL
- `POST /auth/telegram` - Telegram Mini App 认证
- `POST /auth/telegram-web` - Telegram Web OAuth 认证
- `POST /auth/verify` - 验证 token

### 前端页面和组件

- `/admin` - 管理面板（受保护）
- `/auth/telegram/callback` - Telegram OAuth 回调页面
- `TelegramAuthGuard` - 认证守卫组件
- `TelegramWebLogin` - 浏览器登录组件

### API 调用架构

前端直接调用后端 API，不通过 Next.js API 路由代理：
- 使用 `NEXT_PUBLIC_API_URL` 环境变量配置后端 API 地址
- 所有认证相关的 API 调用都直接发送到后端
- 支持跨域请求（需要后端配置 CORS）

### 认证数据验证

两种认证方式都使用相同的验证机制：
- Mini App: 使用 `@telegram-apps/init-data-node` 验证初始数据
- Web OAuth: 使用 HMAC-SHA256 验证授权数据
- 都使用 BOT_TOKEN 作为验证密钥

### 管理员权限控制

- 在后端维护 `ADMIN_USERS` 列表
- 只有列表中的用户名可以访问管理功能
- 如果用户没有用户名，仍可以认证但可能无法访问某些功能

## 调试和测试

### 认证页面调试
在认证失败时，可以点击"显示调试信息"按钮查看详细的环境信息：
- 环境检测状态
- 初始数据获取状态
- WebApp 对象存在状态
- User Agent 信息
- 完整的环境数据

### 测试步骤

#### Mini App 测试
1. 在 Telegram 中创建 Bot 和 Mini App
2. 设置 Mini App URL 指向你的应用
3. 在 Telegram 中打开 Mini App
4. 如果认证失败，查看调试信息确认环境检测正确

#### Web OAuth 测试
1. 确保设置了 BOT_USERNAME 和 FRONTEND_URL 环境变量
2. 向 BotFather 设置允许的 OAuth 域名
3. 在浏览器中访问 `/admin` 页面
4. 点击"使用 Telegram 登录"按钮
5. 在 Telegram OAuth 页面完成授权
6. 确认能正确跳转回应用并完成认证

## 安全特性

- 使用 Telegram 官方的认证机制
- 使用 BOT_TOKEN 作为 JWT 签名密钥
- JWT token 有 24 小时过期时间
- 所有管理 API 都需要有效的认证 token
- OAuth 回调 URL 验证
- 支持自动 token 刷新和验证

## 故障排除

### 常见问题

1. **Mini App 认证失败**
   - 检查 `BOT_TOKEN` 是否正确设置
   - 确认 Mini App URL 配置正确
   - 查看认证页面的调试信息确认初始数据是否获取到

2. **Web OAuth 认证失败**
   - 检查 `BOT_TOKEN` 和 `BOT_USERNAME` 是否正确设置
   - 确认向 BotFather 设置了正确的 OAuth 域名
   - 检查 `FRONTEND_URL` 环境变量是否正确
   - 确认回调 URL 可以正常访问

3. **Token 验证失败**
   - 检查 `BOT_TOKEN` 是否设置
   - 确认系统时间同步
   - 检查 token 是否过期

4. **OAuth 重定向失败**
   - 确认 `FRONTEND_URL` 设置正确
   - 检查回调页面 `/auth/telegram/callback` 是否可访问
   - 确认域名已在 BotFather 中设置

### 环境变量检查

确保以下环境变量正确设置：

```bash
# 后端环境变量
BOT_TOKEN=1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZ
BOT_USERNAME=your_bot_username
FRONTEND_URL=https://yourdomain.com

# 前端环境变量
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

## 技术栈

- **后端**: Hono.js + Prisma + @telegram-apps/init-data-node
- **前端**: Next.js + @telegram-apps/sdk
- **认证**: JWT + Telegram 官方认证机制

## 注意事项

1. **开发环境**: 可以使用 HTTP 链接进行测试
2. **生产环境**: 必须使用 HTTPS 链接
3. **Bot Token**: 确保 Bot Token 安全，不要泄露
4. **域名设置**: 生产环境必须在 BotFather 中设置正确的 OAuth 域名
5. **回调 URL**: 确保回调 URL 可以正常访问且不被防火墙阻止

## 初始数据获取方式

系统会按以下优先级尝试获取 Telegram 初始数据：

1. **SDK 方式**: 使用 `@telegram-apps/sdk` 的 `retrieveLaunchParams()`
2. **WebApp 对象**: 从 `window.Telegram.WebApp.initData` 获取
3. **URL 参数**: 从 `?tgWebAppData=` 参数获取
4. **Hash 参数**: 从 `#tgWebAppData=` 参数获取

## 开发调试

在开发环境中，你可以：

1. 使用 Telegram Desktop Beta 版本启用 WebView 调试
2. 在 Chrome 中使用 `chrome://inspect` 调试移动端
3. 使用 Eruda 在移动端显示控制台
4. 在认证页面查看详细调试信息

## API 端点

### 认证相关
- `POST /auth/telegram` - Telegram 认证
- `POST /auth/verify` - 验证 token

### 管理 API（需要认证）
- `GET /admin/me` - 获取当前用户信息
- `GET /admin/category` - 获取分类列表
- `POST /admin/category` - 创建分类
- 其他管理 API...

## 前端组件

### TelegramAuthGuard
保护需要认证的页面组件，自动处理认证流程，包含集成的调试信息显示。

### AdminUserDropdown
显示当前登录用户信息，支持登出功能。

## 技术栈

- **后端**: Hono.js + Prisma + @telegram-apps/init-data-node
- **前端**: Next.js + @telegram-apps/sdk
- **认证**: JWT + Telegram Init Data 验证（使用 BOT_TOKEN 作为密钥）

## 注意事项

1. **开发环境**: 可以使用 HTTP 链接进行测试
2. **生产环境**: 必须使用 HTTPS 链接
3. **Bot Token**: 确保 Bot Token 安全，不要泄露
4. **调试信息**: 生产环境中建议隐藏调试信息按钮 