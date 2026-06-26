# AI Job Copilot 小程序前端

这是 AI Job Copilot 的微信小程序前端 MVP。当前真实开发项目的 API 地址在：

```js
D:\ai-job-copilot-miniprogram\utils\api.js
```

体验版/正式版需要把 `API_BASE_URL` 配置为不带端口的 HTTPS 域名，例如：

```js
const API_BASE_URL = "https://api.your-domain.com";
```

## 打开方式

1. 打开微信开发者工具。
2. 点击 `导入`。
3. 项目目录选择：

```text
D:\ai-job-copilot-miniprogram
```

4. AppID 可以先使用测试号或无 AppID。
5. 如果本地调试请求被拦截，请在开发者工具里勾选：

```text
不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书
```

## 本地联调

先启动 H5/后端项目：

```powershell
cd C:\Users\HONOR\Documents\工具探索\ai-job-copilot
npm.cmd start
```

再在微信开发者工具中编译小程序。

## 页面结构

- `pages/index`：工作台
- `pages/jd-input`：JD 分析输入
- `pages/jd-result`：JD 分析结果
- `pages/coach`：问一问 AI
- `pages/coach-result`：回答思路
- `pages/review`：添加求职记忆（面试复盘、项目经历、回答素材、Mock 反馈、失败问题）
- `pages/history`：求职记忆历史
- `pages/profile`：我的/简历维护

## 体验版上线

体验版要完整请求云端后端，需要完成：

1. HTTPS 域名。
2. Nginx 反向代理到 `127.0.0.1:5177`。
3. 微信公众平台配置 `request 合法域名`。
4. `utils/api.js` 中的 `API_BASE_URL` 改成 HTTPS 域名。
5. 重新上传并设为体验版。

详细步骤见：

```text
D:\ai-job-copilot-miniprogram\DEPLOYMENT_CHECKLIST.md
```
