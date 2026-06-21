# AI Job Copilot 项目说明文档

## 1. 项目一句话介绍

AI Job Copilot 是一个面向个人求职流程的 AI 面试辅助工具。它把 JD 分析、面试问答、面试复盘和 RAG 记忆检索串成闭环，帮助候选人在下一次面试中复用自己的真实经验。

## 2. 为什么做这个项目

传统求职准备通常有几个问题：

- JD 分析靠人工阅读，效率低。
- 面试准备容易泛泛而谈，缺少针对岗位的风险预判。
- 面试复盘没有沉淀机制，下次面试很难复用。
- 大模型直接问答容易给出通用建议，甚至编造候选人没有的经历。

这个项目的核心思路是：

> 不让 AI 替用户编经历，而是让 AI 帮用户组织、检索和复用自己的真实经历。

## 3. 产品闭环

```text
投递前
  -> JD 分析
  -> 匹配分 / 风险点 / 面试雷达

面试前
  -> 基于历史 Job Memory 准备本轮面试
  -> STAR 回答提醒 / 练习计划 / 一分钟 Pitch

面试中或面试前
  -> 问一问 AI
  -> 结合当前 JD 和历史记忆生成回答思路

面试后
  -> 粘贴复盘或实录
  -> 结构化为 Job Memory
  -> 向量化存入 Supabase

下一次面试
  -> RAG 召回历史经验
  -> 生成更贴近个人经历的回答
```

## 4. 技术架构

### 前端

- 微信小程序
- H5 页面

小程序页面包括：

- `index`：工作台
- `jd-input`：JD 输入
- `jd-result`：JD 分析结果
- `coach`：问一问 AI
- `coach-result`：回答结果
- `review`：面试复盘
- `history`：Job Memory 历史
- `profile`：系统状态和简历
- `invite`：邀请码验证

### 后端

- Node.js 原生 HTTP 服务
- PM2 常驻运行
- 腾讯云轻量应用服务器部署

主要接口：

- `GET /api/health`
- `POST /api/analyze-match`
- `POST /api/ocr-job`
- `POST /api/ask-coach`
- `POST /api/memory-cards`
- `GET /api/memory-cards`
- `DELETE /api/memory-cards`
- `POST /api/memory-search`
- `POST /api/interview-prepare`

### AI 能力

- DeepSeek：用于 JD 分析、复盘结构化、回答生成。
- DashScope/OpenAI-compatible Embedding：用于生成向量。
- Supabase Postgres + pgvector：用于存储和检索 Job Memory。

## 5. RAG 如何体现

项目里的 RAG 不是传统知识库问答，而是个人面试记忆检索。

### 写入阶段

1. 用户粘贴面试复盘。
2. LLM 将复盘结构化为 Memory Card。
3. 后端提取标题、问题、卡点、策略、证据等文本。
4. Embedding 模型生成向量。
5. 写入 Supabase `memory_cards` 表。

### 检索阶段

1. 用户问一个面试问题，或请求准备本轮面试。
2. 后端根据问题、JD、轮次构造 query。
3. 生成 query embedding。
4. 调用 Supabase RPC `match_memory_cards`。
5. 召回相似历史复盘。

### 生成阶段

1. 后端将召回的 Job Memory 拼入 prompt。
2. DeepSeek 基于当前问题和历史经验生成回答。
3. 小程序展示回答以及“本次参考记忆”。

## 6. 数据库设计

核心表：`memory_cards`

主要字段：

- `id`
- `user_id`
- `company`
- `role`
- `round`
- `result`
- `title`
- `raw_text`
- `summary`
- `questions_json`
- `tags_json`
- `reusable_evidence_json`
- `embedding`
- `created_at`

检索函数：

- `match_memory_cards`

向量维度：

- `1536`

## 7. 部署状态

当前已经完成：

- 腾讯云轻量服务器部署
- Node.js 20
- PM2 常驻
- DeepSeek API 配置
- Supabase 配置
- Embedding 配置
- 邀请码访问保护
- 多邀请码用户隔离
- 外网健康检查

健康检查接口：

```text
GET /api/health
```

返回示例：

```json
{
  "ok": true,
  "hasApiKey": true,
  "model": "deepseek-chat",
  "accessProtected": true,
  "userIsolationEnabled": true,
  "memoryEnabled": true,
  "embeddingEnabled": true
}
```

## 8. 项目亮点

### 不是普通大模型套壳

项目没有停留在“输入问题 -> 大模型回答”，而是加入了：

- JD 分析
- 面试风险预测
- 结构化复盘
- 向量检索
- 历史经验复用
- 邀请码保护
- 云端部署

### RAG 有明确业务价值

RAG 不是为了炫技术，而是解决真实问题：

> 每一次面试复盘都能变成下一次面试准备的材料。

### 产品闭环完整

从投递前到面试后，形成完整循环：

```text
分析岗位 -> 准备面试 -> 生成回答 -> 复盘沉淀 -> 下次复用
```

### 控制 AI 幻觉

Prompt 中明确要求：

- 不编造简历没有的经历。
- 如果没有证据，不把能力写成用户已经具备。
- A/B 实验等经历必须有简历证据。
- 缺失能力放到风险点或准备建议中。

## 9. 面试介绍版本

可以这样介绍：

> 我做了一个面向自己求职流程的 AI Job Copilot。它不是单纯调用大模型接口，而是把 JD 分析、面试即时问答、面试复盘沉淀和 RAG 记忆检索串成闭环。投递前它会分析岗位匹配度和面试风险；面试前可以基于历史复盘生成准备方案；面试中遇到问题可以让 AI 结合 JD 和历史记忆生成回答思路；面试后复盘会被结构化成 Job Memory，并通过向量检索在下一次面试中复用。这个项目的重点是让 AI 基于我的真实经历辅助表达，而不是编造经历。

## 10. 当前限制

- 邀请码只是轻量访问保护，不是完整用户系统。
- 小程序正式体验版仍需要 HTTPS 域名和微信后台合法域名配置。
- 长文本复盘质量依赖 ASR 文本质量和模型上下文窗口。
- 当前主要服务个人求职，不适合作为开放平台直接使用。

## 11. 后续优化方向

- HTTPS 域名和小程序体验版。
- 复盘重复检测和合并。
- 按公司/岗位/轮次聚合 Job Memory。
- 更细粒度的数据删除和隐私控制。
- 更完整的 STAR 回答模板。
- 面试进度和投递看板。
