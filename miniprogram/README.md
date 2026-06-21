# AI Job Copilot 小程序前端

这是 AI Job Copilot 的微信小程序前端 MVP，当前 API 默认指向本地后端：

```js
http://localhost:5177
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
- `pages/review`：面试复盘
- `pages/history`：Job Memory 历史
- `pages/profile`：我的/简历维护

## 后续上线

部署云端后，把 `utils/api.js` 中的 `API_BASE_URL` 改成 HTTPS 后端域名。
