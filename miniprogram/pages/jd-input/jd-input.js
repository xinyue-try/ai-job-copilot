const { upload, request } = require("../../utils/api");

const ACTIVE_JOB_KEY = "activeJdInputJob";

Page({
  data: {
    jobText: "",
    jobTextLength: 0,
    jobLink: "",
    resumeReady: false,
    latestTitle: "",
    taskActive: false,
    taskType: "",
    taskTitle: "",
    taskStage: "",
    taskProgress: 0,
    taskError: "",
    taskCanRetry: false
  },
  pollTimer: null,
  onShow() {
    const resumeText = wx.getStorageSync("resumeText") || "";
    const latest = wx.getStorageSync("latestAnalysis");
    this.setData({
      resumeReady: Boolean(resumeText.trim()),
      latestTitle: latest ? `${latest.title || "岗位"} @ ${latest.company || "公司"}` : ""
    });
    this.resumeActiveJob();
  },
  onHide() {
    this.stopPolling();
  },
  onUnload() {
    this.stopPolling();
  },
  onJobInput(event) {
    const jobText = event.detail.value || "";
    this.setData({
      jobText,
      jobTextLength: jobText.length
    });
  },
  onLinkInput(event) {
    this.setData({ jobLink: event.detail.value || "" });
  },
  goProfile() {
    wx.switchTab({ url: "/pages/profile/profile" });
  },
  setActiveJob(jobId, type, title) {
    const activeJob = {
      jobId,
      type,
      title,
      createdAt: Date.now()
    };
    wx.setStorageSync(ACTIVE_JOB_KEY, activeJob);
    this.setData({
      taskActive: true,
      taskType: type,
      taskTitle: title,
      taskStage: "任务已创建",
      taskProgress: Math.max(this.data.taskProgress || 0, 1),
      taskError: "",
      taskCanRetry: false
    });
    this.startPolling(activeJob);
  },
  resumeActiveJob() {
    const activeJob = wx.getStorageSync(ACTIVE_JOB_KEY);
    if (!activeJob || !activeJob.jobId) return;
    this.setData({
      taskActive: true,
      taskType: activeJob.type || "",
      taskTitle: activeJob.title || "处理中",
      taskStage: "正在恢复任务进度",
      taskProgress: this.data.taskProgress || 1,
      taskError: "",
      taskCanRetry: false
    });
    this.startPolling(activeJob);
  },
  clearActiveJob() {
    wx.removeStorageSync(ACTIVE_JOB_KEY);
    this.stopPolling();
  },
  stopPolling() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  },
  startPolling(activeJob) {
    this.stopPolling();
    const poll = async () => {
      try {
        const payload = await request("/api/jobs/" + encodeURIComponent(activeJob.jobId));
        const job = payload.job || {};
        this.setData({
          taskActive: job.status === "queued" || job.status === "running",
          taskStage: job.stage || "处理中",
          taskProgress: Number(job.progress || 0),
          taskError: job.error || "",
          taskCanRetry: job.status === "failed"
        });

        if (job.status === "succeeded") {
          this.handleJobResult(activeJob, job.result || {});
          return;
        }
        if (job.status === "failed") {
          this.clearActiveJob();
          this.setData({
            taskActive: false,
            taskError: job.error || "任务处理失败",
            taskCanRetry: true
          });
          wx.showToast({ title: job.error || "任务处理失败", icon: "none" });
          return;
        }
        this.pollTimer = setTimeout(poll, 1500);
      } catch (error) {
        this.setData({
          taskStage: "暂时无法获取进度，稍后自动重试",
          taskError: error.message || ""
        });
        this.pollTimer = setTimeout(poll, 2500);
      }
    };
    poll();
  },
  handleJobResult(activeJob, result) {
    this.clearActiveJob();
    this.setData({
      taskActive: false,
      taskProgress: 100,
      taskStage: "已完成",
      taskError: "",
      taskCanRetry: false
    });

    if (activeJob.type === "ocr-job" || activeJob.type === "parse-link") {
      const jobText = result.text || "";
      this.setData({
        jobText,
        jobTextLength: jobText.length
      });
      wx.showToast({ title: activeJob.type === "parse-link" ? "链接已识别" : "已识别" });
      return;
    }

    if (activeJob.type === "analyze-match") {
      const analysis = result.analysis || {};
      wx.setStorageSync("latestAnalysisFull", analysis);
      const job = analysis.job_summary || {};
      wx.setStorageSync("latestAnalysis", {
        title: job.title || "岗位",
        company: job.company || "",
        score: analysis.match_score?.total || 0
      });
      wx.navigateTo({ url: "/pages/jd-result/jd-result" });
    }
  },
  retryTask() {
    this.setData({
      taskError: "",
      taskCanRetry: false
    });
  },
  chooseImage() {
    if (this.data.taskActive) {
      wx.showToast({ title: "当前任务处理中", icon: "none" });
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      success: async (res) => {
        const filePath = res.tempFiles?.[0]?.tempFilePath;
        if (!filePath) return;
        this.setData({
          taskActive: true,
          taskType: "ocr-job",
          taskTitle: "识别岗位截图",
          taskStage: "正在上传截图",
          taskProgress: 1,
          taskError: "",
          taskCanRetry: false
        });
        try {
          const payload = await upload("/api/jobs/ocr-job", filePath, "file", {
            onProgress: (progress) => {
              const uploadProgress = Math.min(24, Math.max(1, Math.round((progress.progress || 0) * 0.24)));
              this.setData({
                taskStage: "正在上传截图 " + (progress.progress || 0) + "%",
                taskProgress: uploadProgress
              });
            }
          });
          this.setActiveJob(payload.jobId, "ocr-job", "识别岗位截图");
        } catch (error) {
          this.clearActiveJob();
          this.setData({
            taskActive: false,
            taskError: error.message || "上传失败",
            taskCanRetry: true
          });
          wx.showToast({ title: error.message, icon: "none" });
        }
      }
    });
  },
  async parseLink() {
    if (this.data.taskActive) {
      wx.showToast({ title: "当前任务处理中", icon: "none" });
      return;
    }
    const url = this.data.jobLink.trim();
    if (!url) {
      wx.showToast({ title: "请先粘贴岗位链接", icon: "none" });
      return;
    }
    this.setData({
      taskActive: true,
      taskType: "parse-link",
      taskTitle: "识别岗位链接",
      taskStage: "正在提交链接",
      taskProgress: 1,
      taskError: "",
      taskCanRetry: false
    });
    try {
      const payload = await request("/api/jobs/parse-link", {
        method: "POST",
        data: { url }
      });
      this.setActiveJob(payload.jobId, "parse-link", "识别岗位链接");
    } catch (error) {
      this.clearActiveJob();
      this.setData({
        taskActive: false,
        taskError: error.message || "链接识别失败",
        taskCanRetry: true
      });
      wx.showToast({ title: error.message, icon: "none" });
    }
  },
  async analyze() {
    const resumeText = wx.getStorageSync("resumeText") || "";
    if (this.data.taskActive) {
      wx.showToast({ title: "当前任务处理中", icon: "none" });
      return;
    }
    if (!this.data.jobText.trim()) {
      wx.showToast({ title: "请先粘贴 JD", icon: "none" });
      return;
    }
    if (!resumeText.trim()) {
      wx.showToast({ title: "请先在我的页面保存简历", icon: "none" });
      return;
    }

    this.setData({
      taskActive: true,
      taskType: "analyze-match",
      taskTitle: "分析岗位匹配",
      taskStage: "正在提交分析任务",
      taskProgress: 1,
      taskError: "",
      taskCanRetry: false
    });
    try {
      wx.setStorageSync("lastJobText", this.data.jobText);
      const payload = await request("/api/jobs/analyze-match", {
        method: "POST",
        data: { jobText: this.data.jobText, resumeText }
      });
      this.setActiveJob(payload.jobId, "analyze-match", "分析岗位匹配");
    } catch (error) {
      this.clearActiveJob();
      this.setData({
        taskActive: false,
        taskError: error.message || "分析失败",
        taskCanRetry: true
      });
      wx.showToast({ title: error.message, icon: "none" });
    }
  }
});
