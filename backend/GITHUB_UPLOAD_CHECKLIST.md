# GitHub 上传检查清单

## 不要上传

- `.env`
- API Key、Supabase service role key、邀请码
- `node_modules/`
- `.tesseract-cache/`
- `*.zip`
- `cloudflared.exe`

## 可以上传

- `server.js`
- `package.json`
- `package-lock.json`
- `public/`
- `extension/`
- `supabase-memory.sql`
- `JOB_MEMORY.md`
- `.env.example`
- `README.md`

## 上传前检查

```bash
git status --short
git diff --stat
rg -n "sk-|DEEPSEEK_API_KEY=|SUPABASE_SERVICE_ROLE_KEY=|APP_ACCESS_TOKEN=|EMBEDDING_API_KEY="
```

如果最后一条命令搜到真实密钥，不要提交，先删除或替换成示例值。
