const { request } = require("../../utils/api");

const memoryTypeLabels = {
  interview_review: "面试复盘",
  project_experience: "项目经历",
  answer_material: "回答素材",
  mock_feedback: "Mock 反馈",
  failed_question: "失败问题"
};

function getMemoryTypeLabel(type) {
  return memoryTypeLabels[type] || "求职记忆";
}

Page({
  data: {
    job: {},
    score: "--",
    action: "待判断",
    matchReasons: [],
    risks: [],
    radar: [],
    greeting: "",
    preparing: false,
    prepareButtonText: "用历史记忆准备本轮面试",
    preparation: null,
    memoryCount: 0,
    memoryStatusText: "尚未召回求职记忆"
  },
  onLoad() {
    const analysis = wx.getStorageSync("latestAnalysisFull") || {};
    const job = analysis.job_summary || {};
    const matchScore = analysis.match_score || {};
    const resumeSummary = analysis.resume_summary || {};
    const breakdown = matchScore.breakdown || {};
    const matchReasons = Object.values(breakdown).map((item) => item.reason).filter(Boolean).slice(0, 4);
    const risks = [
      ].concat(
        (analysis.missing_skills || []).map((item) => item.advice || item.name),
        resumeSummary.risks || []
      ).filter(Boolean).slice(0, 4);
    const radar = (analysis.interview_radar || []).slice(0, 4).map((item, index) => ({
      question: item.question || "面试题",
      numberText: String(index + 1) + ".",
      answerStrategy: item.answer_strategy || "暂无"
    }));
    const greeting = analysis.greeting || {};
    this.setData({
      job,
      score: typeof matchScore.total === "number" ? matchScore.total : "--",
      action: analysis.recommended_action || "待判断",
      matchReasons: matchReasons.length ? matchReasons : ["暂无明确匹配点"],
      risks: risks.length ? risks : ["暂无明显风险"],
      radar,
      greeting: greeting.matched || greeting.safe || greeting.short || "暂无"
    });
  },
  buildPreparation(payload) {
    const preparation = payload.preparation || {};
    const likelyQuestions = (preparation.likely_questions || []).slice(0, 5).map((item, index) => ({
      id: "prep-q-" + index,
      numberText: String(index + 1) + ".",
      question: item.question || "可能问题",
      why: item.why ? "为什么会问：" + item.why : "",
      strategy: item.answer_strategy ? "回答策略：" + item.answer_strategy : "",
      evidence: item.evidence ? "可用证据：" + item.evidence : ""
    }));
    const risks = (preparation.historical_risks || []).map((item, index) => ({
      id: "risk-" + index,
      text: item
    }));
    const plan = (preparation.practice_plan || []).map((item, index) => ({
      id: "plan-" + index,
      text: item
    }));
    const memories = (payload.memories || []).slice(0, 4).map((item, index) => {
      const similarity = Number(item.similarity || 0);
      return {
        id: item.id || "prep-memory-" + index,
        title: item.title || "历史求职记忆",
        metaLine: [
          getMemoryTypeLabel(item.type),
          item.company,
          item.role,
          item.round,
          similarity ? "相似度 " + similarity.toFixed(2) : ""
        ].filter(Boolean).join(" · "),
        summary: item.summary || "暂无摘要",
        tags: (item.tags_json || item.tags || []).slice(0, 4)
      };
    });

    return {
      roundFocus: preparation.round_focus || "暂无",
      likelyQuestions,
      risks,
      plan,
      pitch: preparation.one_minute_pitch || "暂无",
      memories,
      starTips: [
        { id: "s", label: "S", text: "先交代项目/业务背景，别一上来堆技术名词" },
        { id: "t", label: "T", text: "说清当时目标、约束和你负责的部分" },
        { id: "a", label: "A", text: "按步骤讲你具体做了什么、怎么判断取舍" },
        { id: "r", label: "R", text: "落到结果、指标、复盘收获或下次优化" }
      ]
    };
  },
  async prepareWithMemory() {
    if (this.data.preparing) return;
    const jobText = wx.getStorageSync("lastJobText") || "";
    if (!jobText.trim()) {
      wx.showToast({ title: "请先完成一次 JD 分析", icon: "none" });
      return;
    }

    const settings = wx.getStorageSync("coachSettings") || {};
    this.setData({
      preparing: true,
      prepareButtonText: "准备中..."
    });
    wx.showLoading({ title: "准备中" });
    try {
      const payload = await request("/api/interview-prepare", {
        method: "POST",
        data: {
          company: this.data.job.company || "",
          role: this.data.job.title || "",
          round: settings.round || "一面",
          jobText
        }
      });
      this.setData({
        preparation: this.buildPreparation(payload),
        memoryCount: (payload.memories || []).length,
        memoryStatusText: (payload.memories || []).length ? "本次召回了 " + (payload.memories || []).length + " 条求职记忆" : "暂未召回历史记忆，本次准备主要基于当前 JD 和简历。"
      });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      this.setData({
        preparing: false,
        prepareButtonText: "用历史记忆准备本轮面试"
      });
      wx.hideLoading();
    }
  },
  copyGreeting() {
    wx.setClipboardData({ data: this.data.greeting });
  },
  prepareRadarQuestion(event) {
    const question = event.currentTarget.dataset.question;
    if (!question) return;
    wx.setStorageSync("coachPrefillQuestion", question);
    wx.navigateTo({ url: "/pages/coach/coach" });
  },
  prepareLikelyQuestion(event) {
    const question = event.currentTarget.dataset.question;
    if (!question) return;
    wx.setStorageSync("coachPrefillQuestion", question);
    wx.navigateTo({ url: "/pages/coach/coach" });
  }
});
