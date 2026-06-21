Page({
  data: {
    latestAnalysisText: "暂无",
    latestMemoryText: "暂无"
  },
  onShow() {
    if (!wx.getStorageSync("appAccessToken")) {
      wx.reLaunch({ url: "/pages/invite/invite" });
      return;
    }
    const latest = wx.getStorageSync("latestAnalysis");
    const latestMemory = wx.getStorageSync("latestMemory");
    const latestAnalysisText = latest ? (latest.title || "岗位") + " · " + (latest.score || "--") + "分" : "暂无";
    const latestMemoryText = latestMemory ? (latestMemory.round || "面试") + " · " + (latestMemory.result || "待定") : "暂无";
    this.setData({
      latestAnalysisText: latestAnalysisText,
      latestMemoryText: latestMemoryText
    });
  },
  goJd() {
    wx.navigateTo({ url: "/pages/jd-input/jd-input" });
  },
  goCoach() {
    wx.navigateTo({ url: "/pages/coach/coach" });
  },
  goReview() {
    wx.navigateTo({ url: "/pages/review/review" });
  }
});
