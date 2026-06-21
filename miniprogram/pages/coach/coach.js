const { request } = require("../../utils/api");

Page({
  data: {
    question: "",
    round: "一面",
    timeLimit: "1分钟",
    style: "产品感强",
    rounds: ["一面", "二面", "HR面"],
    times: ["30秒", "1分钟", "2分钟"],
    styles: ["稳妥口语化", "产品感强", "数据感强", "真诚自然"],
    suggestions: [
      "RAG 和普通 Prompt 怎么讲？",
      "多 Agent 会不会过度设计？",
      "怎么证明项目不是玩具？",
      "没有硬件 AI 经验怎么回答？"
    ]
  },
  onLoad() {
    const settings = wx.getStorageSync("coachSettings") || {};
    const prefillQuestion = wx.getStorageSync("coachPrefillQuestion") || "";
    const nextData = {};

    if (settings.round) nextData.round = settings.round;
    if (settings.timeLimit) nextData.timeLimit = settings.timeLimit;
    if (settings.style) nextData.style = settings.style;
    if (prefillQuestion) {
      nextData.question = prefillQuestion;
      wx.removeStorageSync("coachPrefillQuestion");
    }

    if (Object.keys(nextData).length) {
      this.setData(nextData);
    }
  },
  saveSettings() {
    wx.setStorageSync("coachSettings", {
      round: this.data.round,
      timeLimit: this.data.timeLimit,
      style: this.data.style
    });
  },
  onQuestionInput(event) {
    this.setData({ question: event.detail.value });
  },
  useSuggestion(event) {
    this.setData({ question: event.currentTarget.dataset.text });
  },
  selectRound(event) {
    this.setData({ round: event.currentTarget.dataset.value }, () => this.saveSettings());
  },
  selectTime(event) {
    this.setData({ timeLimit: event.currentTarget.dataset.value }, () => this.saveSettings());
  },
  selectStyle(event) {
    this.setData({ style: event.currentTarget.dataset.value }, () => this.saveSettings());
  },
  async ask() {
    if (!this.data.question.trim()) {
      wx.showToast({ title: "请先输入问题", icon: "none" });
      return;
    }
    wx.showLoading({ title: "生成中" });
    try {
      wx.setStorageSync("coachQuestion", this.data.question);
      this.saveSettings();
      const payload = await request("/api/ask-coach", {
        method: "POST",
        data: {
          question: this.data.question,
          round: this.data.round,
          timeLimit: this.data.timeLimit,
          style: this.data.style,
          jobText: wx.getStorageSync("lastJobText") || ""
        }
      });
      wx.setStorageSync("coachAnswer", payload);
      wx.navigateTo({ url: "/pages/coach-result/coach-result" });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      wx.hideLoading();
    }
  }
});
