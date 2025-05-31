 # 使用官方的 Bun 镜像作为基础
FROM oven/bun:latest

# 设置工作目录
WORKDIR /app

# 定义存储路径环境变量，并创建目录
# 您可以在 docker run 时使用 -e STORAGE_PATH=/your/custom/path 来覆盖容器内的默认路径
# 或者在 docker build 时使用 --build-arg STORAGE_PATH_ARG=/your/custom/path
RUN mkdir -p ${STORAGE_PATH} && chown bun:bun ${STORAGE_PATH}

# 将 bun 用户设置为默认用户
USER bun

# 复制 package.json 和 bun.lock
COPY --chown=bun:bun package.json bun.lock ./

# 安装依赖
# 使用 --frozen-lockfile 确保使用锁文件中的版本
RUN bun install --frozen-lockfile

# 复制项目其余文件到工作目录
# 注意：.dockerignore 文件会控制哪些文件被复制
COPY --chown=bun:bun . .

# （可选）如果您的应用需要暴露端口，请取消注释并修改以下行
# 例如，如果您的应用在 3000 端口监听:
# EXPOSE 3000

# 定义容器启动时执行的命令
# 请根据您的 package.json 中的 "scripts" 或您的项目入口文件来修改此命令
# 例如:
# CMD ["bun", "run", "start"]
# CMD ["bun", "run", "dev"]
# CMD ["bun", "src/index.ts"]
# 如果您的 package.json 中有 "start" 脚本，这个默认命令应该可以工作
CMD ["bun", "start"]

# 将 STORAGE_PATH 声明为一个卷，以便外部映射和持久化数据
VOLUME ${STORAGE_PATH}