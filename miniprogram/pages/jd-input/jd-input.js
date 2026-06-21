const { upload, request } = require("../../utils/api");

Page({
  data: {
    jobText: "",
    resumeReady: false,
    latestTitle: ""
  },
  onShow() {
    const resumeText = wx.getStorageSync("resumeText") || "";
    const latest = wx.getStorageSync("latestAnalysis");
    this.setData({
      resumeReady: Boolean(resumeText.trim()),
      latestTitle: latest ? `${latest.title || "岗位"} @ ${latest.company || "公司"}` : ""
    });
  },
  onJobInput(event) {
    this.setData({ jobText: event.detail.value });
  },
  goProfile() {
    wx.switchTab({ url: "/pages/profile/profile" });
  },
  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      success: async (res) => {
        const filePath = res.tempFiles?.[0]?.tempFilePath;
        if (!filePath) return;
        wx.showLoading({ title: "识别中" });
        try {
          const payload = await upload("/api/ocr-job", filePath);
          this.setData({ jobText: payload.text || "" });
          wx.showToast({ title: "已识别" });
        } catch (error) {
          wx.showToast({ title: error.message, icon: "none" });
        } finally {
          wx.hideLoading();
        }
      }
    });
  },
  async analyze() {
    const resumeText = wx.getStorageSync("resumeText") || "";
    if (!this.data.jobText.trim()) {
      wx.showToast({ title: "请先粘贴 JD", icon: "none" });
      return;
    }
    if (!resumeText.trim()) {
      wx.showToast({ title: "请先在我的页面保存简历", icon: "none" });
      return;
    }
    wx.showLoading({ title: "分析中" });
    try {
      wx.setStorageSync("lastJobText", this.data.jobText);
      const payload = await request("/api/analyze-match", {
        method: "POST",
        data: { jobText: this.data.jobText, resumeText }
      });
      wx.setStorageSync("latestAnalysisFull", payload.analysis);
      const job = payload.analysis.job_summary || {};
      wx.setStorageSync("latestAnalysis", {
        title: job.title || "岗位",
        company: job.company || "",
        score: payload.analysis.match_score?.total || 0
      });
      wx.navigateTo({ url: "/pages/jd-result/jd-result" });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      wx.hideLoading();
    }
  }
});
