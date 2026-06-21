const { API_BASE_URL, getAccessToken, setAccessToken } = require("../../utils/api");

Page({
  data: {
    inviteCode: "",
    verifying: false,
    buttonText: "进入 AI Job Copilot",
    message: "请输入邀请码，验证通过后即可使用。"
  },
  onLoad() {
    if (getAccessToken()) {
      wx.switchTab({ url: "/pages/index/index" });
    }
  },
  onCodeInput(event) {
    this.setData({ inviteCode: event.detail.value });
  },
  verifyCode() {
    const token = this.data.inviteCode.trim();
    if (!token) {
      wx.showToast({ title: "请输入邀请码", icon: "none" });
      return;
    }
    if (this.data.verifying) return;

    this.setData({
      verifying: true,
      buttonText: "验证中...",
      message: "正在连接云端后端"
    });

    wx.request({
      url: API_BASE_URL + "/api/latest-page",
      method: "GET",
      header: {
        "x-app-token": token
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          setAccessToken(token);
          wx.showToast({ title: "验证通过" });
          wx.switchTab({ url: "/pages/index/index" });
          return;
        }
        wx.showToast({ title: "邀请码不正确", icon: "none" });
        this.setData({ message: "邀请码不正确，请重新输入。" });
      },
      fail: (err) => {
        wx.showToast({ title: "连接后端失败", icon: "none" });
        this.setData({ message: err.errMsg || "连接后端失败" });
      },
      complete: () => {
        this.setData({
          verifying: false,
          buttonText: "进入 AI Job Copilot"
        });
      }
    });
  }
});
