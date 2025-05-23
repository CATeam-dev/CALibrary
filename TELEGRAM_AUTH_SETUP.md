# Telegram Mini App 认证设置

## 环境变量配置

在 `.env` 文件中添加以下配置：

```env
# Telegram Bot Token
BOT_TOKEN="your_telegram_bot_token_here"

# 管理员用户ID列表（逗号分隔）
TELEGRAM_ADMIN_IDS="123456789,987654321"

# JWT密钥
JWT_SECRET="your_jwt_secret_here"

# Web App URL
WEB_APP_URL="https://your-domain.com"
```

## 设置步骤

### 1. 创建Telegram Bot

1. 在Telegram中找到 @BotFather
2. 发送 `/newbot` 命令
3. 按照提示设置bot名称和用户名
4. 获取bot token并添加到 `BOT_TOKEN` 环境变量

### 2. 设置Web App

1. 向 @BotFather 发送 `/newapp` 命令
2. 选择你的bot
3. 设置Web App的名称、描述和URL
4. 上传图标（可选）

### 3. 获取管理员用户ID

1. 在Telegram中向你的bot发送任意消息
2. 查看服务器日志，找到用户ID
3. 将管理员用户ID添加到 `TELEGRAM_ADMIN_IDS` 环境变量

### 4. 配置Web App URL

在bot设置中，将Web App URL设置为你的域名，例如：
- 开发环境: `https://your-ngrok-url.ngrok.io`
- 生产环境: `https://your-domain.com`

## 功能说明

### 认证流程

1. 用户在Telegram中打开Web App
2. 前端获取Telegram WebApp初始化数据
3. 发送到后端进行验证
4. 后端验证数据签名和用户权限
5. 返回JWT token用于后续请求

### 权限控制

- 只有在 `TELEGRAM_ADMIN_IDS` 中配置的用户才能访问admin面板
- Bot的文件上传功能也只对管理员开放
- 所有admin路由都需要JWT认证

### 安全特性

- 使用Telegram官方的WebApp数据验证算法
- JWT token有24小时过期时间
- 初始化数据有5分钟有效期
- 使用HttpOnly cookies存储JWT token

## 测试

1. 启动服务器
2. 在Telegram中打开你的Web App
3. 如果是管理员用户，应该能够正常访问admin面板
4. 非管理员用户会看到权限拒绝页面 