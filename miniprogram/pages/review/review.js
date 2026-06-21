const { request } = require("../../utils/api");

Page({
  data: {
    company: "",
    role: "",
    round: "一面",
    result: "待定",
    rawText: "",
    rawTextLength: 0,
    rounds: ["一面", "二面", "HR面", "终面"],
    results: ["待定", "通过", "挂了"],
    structured: {
      title: "",
      summary: "",
      questions: [],
      tags: []
    }
  },
  onCompany(event) {
    this.setData({ company: event.detail.value });
  },
  onRole(event) {
    this.setData({ role: event.detail.value });
  },
  onRawText(event) {
    const value = event.detail.value || "";
    this.setData({
      rawText: value,
      rawTextLength: value.length
    });
  },
  selectRound(event) {
    this.setData({ round: event.currentTarget.dataset.value });
  },
  selectResult(event) {
    this.setData({ result: event.currentTarget.dataset.value });
  },
  async save() {
    if (!this.data.rawText.trim()) {
      wx.showToast({ title: "请先填写复盘内容", icon: "none" });
      return;
    }
    wx.showLoading({ title: "保存中" });
    try {
      const payload = await request("/api/memory-cards", {
        method: "POST",
        data: {
          company: this.data.company,
          role: this.data.role,
          round: this.data.round,
          result: this.data.result,
          rawText: this.data.rawText
        }
      });
      const structured = payload.structured || {};
      this.setData({
        structured: {
          title: structured.title || "已保存记忆",
          summary: structured.summary || "",
          questions: structured.questions || [],
          tags: structured.tags || []
        }
      });
      wx.setStorageSync("latestMemory", {
        round: structured.round || this.data.round,
        result: structured.result || this.data.result
      });
      wx.showToast({ title: "已保存" });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      wx.hideLoading();
    }
  }
});
