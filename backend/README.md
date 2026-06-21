# AI Job Copilot

面向个人求职流程的 AI Copilot：投递前分析 JD，面试前/面试中生成回答思路，面试后把复盘沉淀成 Job Memory，并通过 RAG 在后续准备中复用历史经验。

核心链路：

- JD 分析：匹配分、风险点、面试雷达、打招呼语。
- 问一问 AI：结合当前 JD 和历史 Job Memory 生成回答思路。
- Job Memory：结构化保存面试复盘，生成向量并写入 Supabase pgvector。
- RAG 准备：根据当前岗位/问题召回历史复盘，再生成本轮准备建议。
- 邀请码保护：后端可通过 `APP_ACCESS_TOKEN` 限制访问。

## 文档索引

- [项目说明文档](./PROJECT_OVERVIEW.md)：项目背景、技术架构、RAG 设计和面试介绍版本。
- [需求文档](./PRODUCT_REQUIREMENTS.md)：产品定位、核心场景、功能模块和版本边界。
- [使用文档](./USER_GUIDE.md)：邀请码登录、JD 分析、问一问 AI、复盘、历史记忆和常见问题。
- [Job Memory 说明](./JOB_MEMORY.md)：复盘沉淀、向量检索和记忆召回设计。
- [GitHub 上传检查清单](./GITHUB_UPLOAD_CHECKLIST.md)：上传前的隐私和配置检查。

## 本地启动

```powershell
cd ai-job-copilot
$env:DEEPSEEK_API_KEY="你的 DeepSeek API Key"
$env:DEEPSEEK_MODEL="deepseek-chat"
npm start
```

打开 `http://localhost:5177`。

完整 RAG 能力还需要配置 Supabase 和 Embedding，参考 `.env.example`。

## 环境变量

复制 `.env.example`，在服务器或本地环境中配置真实值：

```text
PORT=5177
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
JOB_MEMORY_USER_ID=default
EMBEDDING_API_KEY=
EMBEDDING_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_MODEL=text-embedding-v4
EMBEDDING_DIMENSIONS=1536
APP_ACCESS_TOKEN=
# 可选：多邀请码用户隔离，格式为 邀请码:user_id,邀请码2:user_id2
# APP_INVITE_USERS=AJC-YOU-9Q7X:you,AJC-DEMO-2K8M:demo
```

不要把真实 `.env` 上传到 GitHub。

## 腾讯云部署概要

已验证的轻量应用服务器路径：

```bash
sudo apt update
sudo apt install -y curl git unzip nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

项目安装：

```bash
npm install --omit=optional --no-audit --no-fund
```

启动：

```bash
pm2 start server.js --name ai-job-copilot --node-args="--env-file=.env"
pm2 save
```

健康检查：

```bash
curl http://127.0.0.1:5177/api/health
```

## 邀请码与用户隔离

默认情况下，`APP_ACCESS_TOKEN` 对应 `JOB_MEMORY_USER_ID`，适合个人使用。

如果要给别人试用，可以配置 `APP_INVITE_USERS`：

```env
APP_INVITE_USERS=AJC-YOU-9Q7X:you,AJC-FRIEND-2K8M:friend,AJC-DEMO-7P3Q:demo
```

后端会根据请求头 `x-app-token` 自动识别用户空间：

- 保存复盘时写入对应 `user_id`
- 历史列表只返回对应 `user_id`
- 删除只能删除对应 `user_id` 下的数据
- RAG 召回只检索对应 `user_id` 的 Job Memory

这不是完整账号系统，但适合小范围内测，能避免不同试用者的复盘互相污染。

## 当前边界与隐私

- 不做无人值守自动投递。
- 打招呼语只用于复制，不写入历史。
- 云端会接收 JD、简历文本和面试复盘，用于 AI 分析和 Job Memory。
- Supabase service role key、DeepSeek key、Embedding key 只能放在服务端环境变量中，不能放进小程序或前端代码。
- `APP_ACCESS_TOKEN` / `APP_INVITE_USERS` 只用于轻量访问保护和内测用户隔离，不等同于完整用户系统。
