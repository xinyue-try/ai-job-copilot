const { request } = require("../../utils/api");

const memoryTypes = [
  {
    value: "interview_review",
    label: "面试复盘",
    title: "添加面试复盘",
    subtitle: "记录面试细节，让 AI 帮你沉淀经验与策略。",
    contentLabel: "复盘内容",
    meta: "支持原始实录",
    placeholder: "在此输入你的复盘草稿，支持粘贴较长的原始面试实录/ASR 转写。建议保留面试官问题、你的回答、卡住的地方和下次想补充的内容。",
    tip: "如果实录特别长，优先粘贴高价值片段：项目深挖、业务理解、数据指标、AI/RAG/Agent、到岗时间等追问。"
  },
  {
    value: "project_experience",
    label: "项目经历",
    title: "添加项目经历",
    subtitle: "把项目经历沉淀成可召回的面试证据。",
    contentLabel: "项目内容",
    meta: "背景 · 动作 · 结果",
    placeholder: "粘贴一个项目经历。建议写清项目背景、目标、你负责的部分、关键动作、结果数据、复盘收获，以及面试官可能追问的点。",
    tip: "没有面试复盘也没关系。先存一条项目经历，后续问答就能从这里召回证据。"
  },
  {
    value: "answer_material",
    label: "回答素材",
    title: "添加回答素材",
    subtitle: "沉淀自我介绍、项目介绍或常见问题回答草稿。",
    contentLabel: "素材内容",
    meta: "自我介绍 · 项目介绍 · 常见问答",
    placeholder: "粘贴一段回答素材，例如自我介绍、项目介绍、为什么做 AI 产品、RAG 怎么设计、一次失败经历等回答草稿。",
    tip: "系统会提取适合复用的问题、表达亮点、支撑证据和需要避免的夸大说法。"
  },
  {
    value: "mock_feedback",
    label: "Mock 反馈",
    title: "添加 Mock 反馈",
    subtitle: "把朋友或模拟面试反馈变成下一次练习计划。",
    contentLabel: "反馈内容",
    meta: "卡点 · 建议 · 练习方向",
    placeholder: "粘贴 Mock 面试反馈，例如哪里答得虚、哪里逻辑不清、哪些问题被追问、朋友建议你怎么改。",
    tip: "Mock 反馈会被整理成表达卡点、下次策略和练习重点。"
  },
  {
    value: "failed_question",
    label: "失败问题",
    title: "添加失败问题",
    subtitle: "记录一个答崩的问题，下次遇到相似问题时自动召回。",
    contentLabel: "问题内容",
    meta: "问题 · 当时回答 · 卡住原因",
    placeholder: "粘贴一个你答得不好的问题。建议包含：面试官怎么问、你当时怎么答、哪里卡住、后来觉得应该怎么答。",
    tip: "失败问题是很高价值的记忆，后续遇到相似追问时会优先帮助你修正表达。"
  }
];

function getMemoryType(value) {
  return memoryTypes.find((item) => item.value === value) || memoryTypes[0];
}

Page({
  data: {
    type: "interview_review",
    memoryTypes,
    pageTitle: memoryTypes[0].title,
    pageSubtitle: memoryTypes[0].subtitle,
    contentLabel: memoryTypes[0].contentLabel,
    contentMeta: memoryTypes[0].meta,
    contentPlaceholder: memoryTypes[0].placeholder,
    contentTip: memoryTypes[0].tip,
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
  selectType(event) {
    const current = getMemoryType(event.currentTarget.dataset.value);
    this.setData({
      type: current.value,
      pageTitle: current.title,
      pageSubtitle: current.subtitle,
      contentLabel: current.contentLabel,
      contentMeta: current.meta,
      contentPlaceholder: current.placeholder,
      contentTip: current.tip
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
      wx.showToast({ title: "请先填写记忆内容", icon: "none" });
      return;
    }
    wx.showLoading({ title: "保存中" });
    try {
      const payload = await request("/api/memory-cards", {
        method: "POST",
        data: {
          type: this.data.type,
          company: this.data.company,
          role: this.data.role,
          round: this.data.type === "interview_review" ? this.data.round : "",
          result: this.data.type === "interview_review" ? this.data.result : "",
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
        type: structured.type || this.data.type,
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
