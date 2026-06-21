# Job Memory 云端记忆库实验版

这一版支持把面试复盘文本结构化成 Memory Card，保存到 Supabase Postgres，并用 pgvector 做相似记忆召回。

## 1. 初始化 Supabase

1. 新建 Supabase Project。
2. 打开 SQL Editor。
3. 复制并执行 `supabase-memory.sql`。

## 2. 配置环境变量

```powershell
$env:SUPABASE_URL="https://你的项目.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="你的 service role key"
$env:JOB_MEMORY_USER_ID="default"
$env:OPENAI_API_KEY="你的 OpenAI API Key"
$env:OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
$env:DEEPSEEK_API_KEY="你的 DeepSeek API Key"
$env:DEEPSEEK_MODEL="deepseek-chat"
npm start
```

如果想使用国产 embedding，优先选择支持 OpenAI-compatible embeddings 接口的服务，例如阿里百炼/DashScope。保持数据库里的 `embedding vector(1536)` 不变时，embedding 输出维度也要配置成 1536：

```powershell
$env:SUPABASE_URL="https://你的项目.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="你的 service role key"
$env:JOB_MEMORY_USER_ID="default"
$env:EMBEDDING_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
$env:EMBEDDING_API_KEY="你的百炼/DashScope API Key"
$env:EMBEDDING_MODEL="text-embedding-v4"
$env:EMBEDDING_DIMENSIONS="1536"
$env:DEEPSEEK_API_KEY="你的 DeepSeek API Key"
$env:DEEPSEEK_MODEL="deepseek-chat"
npm start
```

如果你选择的国产 embedding 模型不支持 1536 维，需要把 `supabase-memory.sql` 里的 `vector(1536)` 和 `match_memory_cards(query_embedding vector(1536), ...)` 改成对应维度后重新建表。

## 3. 使用方式

1. 打开 `http://localhost:5177`。
2. 在 `Job Memory 求职记忆库` 区域填写公司、岗位、轮次、结果。
3. 粘贴你已经复盘好的面试文本。
4. 点击 `结构化并保存`，系统会用 DeepSeek 提取问题、意图、卡点、下次策略，用 OpenAI embedding 生成向量，并写入 Supabase 的 `memory_cards` 表。
5. 下次准备相似岗位时，填写 JD 或准备目标，点击 `基于记忆准备本轮面试`。

## 4. 面试讲法

大模型 API 本身是无状态的，所以本项目没有依赖模型记忆，而是设计了独立的 Job Memory 存储层。每次面试复盘会被结构化成 Memory Card，并持久化到 Supabase Postgres。下次准备相似岗位时，系统通过 pgvector 做语义检索，召回历史复盘，再把相关记忆作为上下文交给 DeepSeek 生成个性化面试策略。
