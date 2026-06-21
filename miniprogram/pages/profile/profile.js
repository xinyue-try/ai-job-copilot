const { API_BASE_URL, clearAccessToken, getAccessToken, request } = require("../../utils/api");

Page({
  data: {
    apiBaseUrl: API_BASE_URL,
    accessLine: "未验证",
    resumeText: "",
    checkingHealth: false,
    healthMessage: "未检测",
    healthUpdatedAt: "",
    healthLine: "未检测",
    refreshText: "刷新",
    statusItems: [
      { key: "api", label: "后端服务", value: "未检测", dotClass: "status-dot" },
      { key: "ai", label: "AI 模型", value: "未检测", dotClass: "status-dot" },
      { key: "memory", label: "Job Memory", value: "未检测", dotClass: "status-dot" },
      { key: "embedding", label: "Embedding", value: "未检测", dotClass: "status-dot" }
    ]
  },
  onShow() {
    this.setData({
      resumeText: wx.getStorageSync("resumeText") || "",
      accessLine: getAccessToken() ? "已通过邀请码验证" : "未验证"
    });
    this.checkHealth();
  },
  formatTime(date) {
    const pad = function(value) {
      return String(value).padStart(2, "0");
    };
    return pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
  },
  buildStatusItems(payload) {
    return [
      { key: "api", label: "后端服务", value: payload.ok ? "已连接" : "异常", dotClass: payload.ok ? "status-dot ok" : "status-dot" },
      { key: "ai", label: "AI 模型", value: payload.hasApiKey ? "已就绪 · " + (payload.model || "DeepSeek") : "缺少 API Key", dotClass: payload.hasApiKey ? "status-dot ok" : "status-dot" },
      { key: "memory", label: "Job Memory", value: payload.memoryEnabled ? "已连接" : "未开启", dotClass: payload.memoryEnabled ? "status-dot ok" : "status-dot" },
      { key: "embedding", label: "Embedding", value: payload.embeddingEnabled ? "已开启" : "未开启", dotClass: payload.embeddingEnabled ? "status-dot ok" : "status-dot" }
    ];
  },
  async checkHealth() {
    if (this.data.checkingHealth) return;
    this.setData({
      checkingHealth: true,
      healthMessage: "检测中...",
      healthLine: "检测中...",
      refreshText: "检测中"
    });
    try {
      const payload = await request("/api/health");
      const updatedAt = this.formatTime(new Date());
      const message = payload.ok ? "系统状态已更新" : "后端返回异常";
      this.setData({
        statusItems: this.buildStatusItems(payload),
        healthMessage: message,
        healthUpdatedAt: updatedAt,
        healthLine: message + " · " + updatedAt
      });
    } catch (error) {
      const updatedAt = this.formatTime(new Date());
      const message = error.message || "检测失败";
      this.setData({
        statusItems: [
          { key: "api", label: "后端服务", value: "连接失败", dotClass: "status-dot" },
          { key: "ai", label: "AI 模型", value: "未检测", dotClass: "status-dot" },
          { key: "memory", label: "Job Memory", value: "未检测", dotClass: "status-dot" },
          { key: "embedding", label: "Embedding", value: "未检测", dotClass: "status-dot" }
        ],
        healthMessage: message,
        healthUpdatedAt: updatedAt,
        healthLine: message + " · " + updatedAt
      });
    } finally {
      this.setData({
        checkingHealth: false,
        refreshText: "刷新"
      });
    }
  },
  onResumeInput(event) {
    this.setData({ resumeText: event.detail.value });
  },
  saveResume() {
    wx.setStorageSync("resumeText", this.data.resumeText);
    wx.showToast({ title: "已保存" });
  },
  clearInvite() {
    clearAccessToken();
    this.setData({ accessLine: "未验证" });
    wx.showToast({ title: "已清除" });
    wx.reLaunch({ url: "/pages/invite/invite" });
  }
});
