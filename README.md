# AI Job Copilot

AI Job Copilot 是一个面向个人求职流程的 AI 面试 Copilot。它把 JD 分析、面试问答、面试复盘和 RAG 记忆检索串成闭环，帮助候选人在下一次面试中复用自己的真实经历。

## 项目结构

```text
ai-job-copilot-showcase/
├── backend/       Node.js 后端、H5 页面、RAG/Job Memory 逻辑
└── miniprogram/   微信小程序端
```

## 核心能力

- JD 分析：解析岗位要求，输出匹配点、风险点、高风险面试问题和打招呼语。
- 问一问 AI：针对具体面试问题生成短答、完整答法、证据和可能追问。
- Job Memory：将面试复盘结构化为可检索记忆。
- RAG 召回：基于历史复盘召回相关经验，辅助下一轮面试准备。
- 邀请码内测：通过轻量邀请码控制访问，并支持不同试用者的数据隔离。

## 文档入口

- [项目说明文档](./backend/PROJECT_OVERVIEW.md)
- [需求文档](./backend/PRODUCT_REQUIREMENTS.md)
- [使用文档](./backend/USER_GUIDE.md)
- [Job Memory 说明](./backend/JOB_MEMORY.md)
- [GitHub 上传检查清单](./backend/GITHUB_UPLOAD_CHECKLIST.md)

## 后端启动

```bash
cd backend
npm install --omit=optional --no-audit --no-fund
npm start
```

完整 RAG 能力需要配置 `.env`。请复制 `backend/.env.example`，并在本地或服务器上填入真实环境变量。

注意：真实 `.env`、API Key、Supabase service role key、邀请码不要提交到 GitHub。

## 小程序配置

小程序接口地址位于：

```text
miniprogram/utils/api.js
```

公开仓库中使用的是占位地址。实际运行时需要改成自己的后端地址，例如：

```js
const API_BASE_URL = "https://your-domain.com";
```

微信小程序正式体验需要配置 HTTPS 域名和 request 合法域名。开发阶段可使用微信开发者工具的真机调试或“不校验合法域名”选项。

## 项目亮点

这个项目不是简单的大模型问答，而是围绕真实求职流程做了闭环：

```text
分析岗位 -> 准备面试 -> 生成回答 -> 复盘沉淀 -> 下次复用
```

RAG 的价值体现在：每一次面试复盘都会成为下一次面试准备的材料。

