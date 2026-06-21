App({
  globalData: {
    resumeText: "",
    latestAnalysis: null
  },
  onLaunch() {
    this.globalData.resumeText = wx.getStorageSync("resumeText") || "";
    this.globalData.latestAnalysis = wx.getStorageSync("latestAnalysis") || null;
  }
});
