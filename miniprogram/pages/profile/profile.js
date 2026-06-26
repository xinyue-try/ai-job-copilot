const { API_BASE_URL, clearAccessToken, getAccessToken, getApiEnvironment, request } = require("../../utils/api");

const apiEnvironment = getApiEnvironment();

Page({
  data: {
    apiBaseUrl: API_BASE_URL,
    apiEnvLabel: apiEnvironment.label,
    apiEnvTip: apiEnvironment.tip,
    apiEnvClass: apiEnvironment.canUseInRelease ? "env-pill ok" : "env-pill warn",
    accessLine: "未验证",
    resumeText: "",
    resumeTextLength: 0,
    importingResumeMemory: false,
    resumeMemoryText: "写入召回系统",
    resumeMemoryLine: "把简历里的项目、实习和技能证据生成求职记忆，后续问答可召回。",
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
    const resumeText = wx.getStorageSync("resumeText") || "";
    this.setData({
      resumeText,
      resumeTextLength: resumeText.length,
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
    const resumeText = event.detail.value || "";
    this.setData({
      resumeText,
      resumeTextLength: resumeText.length
    });
  },
  saveResume() {
    wx.setStorageSync("resumeText", this.data.resumeText);
    wx.showToast({ title: "已保存 " + this.data.resumeTextLength + " 字", icon: "none" });
  },
  async importResumeMemory() {
    const resumeText = this.data.resumeText.trim();
    if (!resumeText) {
      wx.showToast({ title: "请先粘贴简历文本", icon: "none" });
      return;
    }
    if (this.data.importingResumeMemory) return;
    wx.setStorageSync("resumeText", this.data.resumeText);
    this.setData({
      importingResumeMemory: true,
      resumeMemoryText: "生成中...",
      resumeMemoryLine: "AI 正在从简历中提取项目经历和可复用证据。"
    });
    wx.showLoading({ title: "生成中" });
    try {
      const payload = await request("/api/resume-memory", {
        method: "POST",
        data: { resumeText }
      });
      const count = payload.count || 0;
      this.setData({
        resumeMemoryLine: "已写入 " + count + " 条求职记忆，可在历史页查看。"
      });
      wx.showToast({ title: "已写入 " + count + " 条", icon: "none" });
    } catch (error) {
      this.setData({
        resumeMemoryLine: error.message || "写入失败，请稍后重试。"
      });
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      this.setData({
        importingResumeMemory: false,
        resumeMemoryText: "写入召回系统"
      });
      wx.hideLoading();
    }
  },
  clearInvite() {
    clearAccessToken();
    this.setData({ accessLine: "未验证" });
    wx.showToast({ title: "已清除" });
    wx.reLaunch({ url: "/pages/invite/invite" });
  }
});
