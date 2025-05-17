import pc from 'picocolors';

function processLine(line: string): string {
    // 保留注释和空行
    if (line.trim().startsWith('#') || line.trim() === '') {
        return line;
    }

    if (line.trim().startsWith('JWT_SECRET=')) {
        return '';
    }

    // 处理配置行
    const match = line.match(/^([^=]+)=/);

    if (match) {
        return `${match[1]}=`;
    }

    return line;
}

async function main() {
    const envFile = Bun.file('.env');

    if (!(await envFile.exists())) {
        console.error(pc.red('❌ .env file does not exist!'));
        console.log(pc.gray('Please create .env file first'));
        process.exit(1);
    }

    try {
        // 读取.env文件内容
        const envContent = await envFile.text();

        // 处理每一行
        const processedContent = envContent
            .split('\n')
            .map((line) => processLine(line))
            .join('\n');

        // 添加警告注释
        const finalContent = `# This is an example environment configuration file

${processedContent}`;

        // 写入.env.example文件
        await Bun.write('.env.example', finalContent);
        console.log(pc.green('✨ Successfully generated .env.example file from .env!'));
    } catch (error) {
        console.error(pc.red('❌ Error generating .env.example file:'));
        console.error(pc.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(pc.red('❌ Unexpected error:'));
    console.error(pc.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
});
