# Telegram 认证设置指南

本项目已集成 Telegram Mini App 认证功能，用于保护 `/admin` 管理面板。

## 环境变量配置

在 `.env` 文件中添加以下配置：

```env
# Telegram Bot 配置
BOT_TOKEN=your_telegram_bot_token_here
```

## 获取 Telegram Bot Token

1. 在 Telegram 中找到 [@BotFather](https://t.me/BotFather)
2. 发送 `/start` 命令开始创建机器人
3. 发送 `/newbot` 命令创建新机器人
4. 按照提示设置机器人名称和用户名
5. 获取 Bot Token 并设置到环境变量中

## 设置 Telegram Mini App

1. 向 BotFather 发送 `/newapp` 命令
2. 选择你的机器人
3. 设置 Mini App 的名称、描述和图标
4. 设置 Web App URL 为你的前端地址（如：`https://yourdomain.com/admin`）
5. 完成设置后，用户可以通过机器人菜单访问 Mini App

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
3. 显示提示信息，要求用户在 Telegram Mini App 中打开

## 初始数据获取方式

系统会按以下优先级尝试获取 Telegram 初始数据：

1. **SDK 方式**: 使用 `@telegram-apps/sdk` 的 `retrieveLaunchParams()`
2. **WebApp 对象**: 从 `window.Telegram.WebApp.initData` 获取
3. **URL 参数**: 从 `?tgWebAppData=` 参数获取
4. **Hash 参数**: 从 `#tgWebAppData=` 参数获取

## 调试和测试

### 认证页面调试
在认证失败时，可以点击"显示调试信息"按钮查看详细的环境信息：
- 环境检测状态
- 初始数据获取状态
- WebApp 对象存在状态
- User Agent 信息
- 完整的环境数据

### 测试步骤
1. 在 Telegram 中创建 Bot 和 Mini App
2. 设置 Mini App URL 指向你的应用
3. 在 Telegram 中打开 Mini App
4. 如果认证失败，查看调试信息确认环境检测正确
5. 根据调试信息排查问题

## 安全特性

- 使用 Telegram 官方的初始数据验证机制
- 使用 BOT_TOKEN 作为 JWT 签名密钥
- JWT token 有 24 小时过期时间
- 所有管理 API 都需要有效的认证 token
- 支持自动 token 刷新和验证

## 开发调试

在开发环境中，你可以：

1. 使用 Telegram Desktop Beta 版本启用 WebView 调试
2. 在 Chrome 中使用 `chrome://inspect` 调试移动端
3. 使用 Eruda 在移动端显示控制台
4. 在认证页面查看详细调试信息

## 故障排除

### 常见问题

1. **认证失败**
   - 检查 `BOT_TOKEN` 是否正确设置
   - 确认 Mini App URL 配置正确
   - 查看认证页面的调试信息确认初始数据是否获取到

2. **Token 验证失败**
   - 检查 `BOT_TOKEN` 是否设置
   - 确认系统时间同步
   - 检查 token 是否过期

3. **无法访问管理面板**
   - 确认在 Telegram Mini App 中打开
   - 检查网络连接和 API 端点
   - 查看浏览器控制台错误信息

4. **环境检测失败**
   - 确认 Telegram WebApp 脚本已加载
   - 检查 URL 参数是否包含 tgWebAppData
   - 查看认证页面的调试信息

### 日志调试

后端会记录认证相关的日志，可以通过以下方式查看：

```bash
# 查看认证日志
bun run dev

# 或者在生产环境
bun run start
```

### 前端调试

在浏览器控制台中可以手动测试：

```javascript
// 检查环境
console.log('isTelegramMiniApp:', window.isTelegramMiniApp?.());
console.log('Telegram WebApp:', window.Telegram?.WebApp);

// 获取初始数据
console.log('initData:', window.getTelegramInitData?.());
```

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