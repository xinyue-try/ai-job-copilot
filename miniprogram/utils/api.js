const API_BASE_URL = "https://your-domain.example.com";
const ACCESS_TOKEN_KEY = "appAccessToken";

function getApiEnvironment() {
  const isHttps = API_BASE_URL.indexOf("https://") === 0;
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(API_BASE_URL);
  const hasPort = /^https?:\/\/[^/]+:\d+/i.test(API_BASE_URL);
  const isIpAddress = /^https?:\/\/\d+\.\d+\.\d+\.\d+/i.test(API_BASE_URL);
  const canUseInRelease = isHttps && !hasPort && !isIpAddress;

  let label = "体验版可用配置";
  let tip = "当前后端地址符合体验版要求，请确认已在微信公众平台配置 request 合法域名。";

  if (isLocalhost) {
    label = "本地调试配置";
    tip = "仅适合微信开发者工具调试，真机体验版不能访问 localhost。";
  } else if (!isHttps) {
    label = "HTTP 调试配置";
    tip = "体验版会拦截 HTTP 请求，需要改为不带端口的 HTTPS 域名。";
  } else if (hasPort) {
    label = "HTTPS 端口配置";
    tip = "体验版 request 合法域名应使用标准 HTTPS 域名，不要在 API_BASE_URL 中带端口。";
  } else if (isIpAddress) {
    label = "HTTPS IP 配置";
    tip = "体验版 request 合法域名应使用已备案域名，不建议直接使用 IP。";
  }

  return {
    apiBaseUrl: API_BASE_URL,
    canUseInRelease,
    isHttps,
    isLocalhost,
    hasPort,
    isIpAddress,
    label,
    tip
  };
}

function getAccessToken() {
  return wx.getStorageSync(ACCESS_TOKEN_KEY) || "";
}

function setAccessToken(token) {
  wx.setStorageSync(ACCESS_TOKEN_KEY, token);
}

function clearAccessToken() {
  wx.removeStorageSync(ACCESS_TOKEN_KEY);
}

function authHeader() {
  const token = getAccessToken();
  return token ? { "x-app-token": token } : {};
}

function request(path, options = {}) {
  const method = options.method || "GET";
  const data = options.data || {};
  const header = authHeader();
  header["content-type"] = "application/json";
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE_URL + path,
      method,
      data,
      header,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(new Error(res.data?.error || `请求失败：${res.statusCode}`));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || "网络请求失败"));
      }
    });
  });
}

function upload(path, filePath, name = "file", options = {}) {
  return new Promise((resolve, reject) => {
    const uploadTask = wx.uploadFile({
      url: API_BASE_URL + path,
      filePath,
      name,
      header: authHeader(),
      success(res) {
        let data = {};
        try {
          data = JSON.parse(res.data || "{}");
        } catch {
          data = {};
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(data.error || `上传失败：${res.statusCode}`));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || "上传失败"));
      }
    });
    if (uploadTask && typeof uploadTask.onProgressUpdate === "function" && typeof options.onProgress === "function") {
      uploadTask.onProgressUpdate(options.onProgress);
    }
  });
}

module.exports = {
  API_BASE_URL,
  ACCESS_TOKEN_KEY,
  getApiEnvironment,
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  request,
  upload
};
