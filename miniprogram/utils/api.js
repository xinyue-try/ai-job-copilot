const API_BASE_URL = "https://your-domain.example.com";
const ACCESS_TOKEN_KEY = "appAccessToken";

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

function upload(path, filePath, name = "file") {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
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
  });
}

module.exports = {
  API_BASE_URL,
  ACCESS_TOKEN_KEY,
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  request,
  upload
};
