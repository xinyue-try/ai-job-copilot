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
    question: "",
    answer: {},
    memories: [],
    memoryStatusText: "暂未召回历史记忆，本次回答主要基于当前 JD 和简历。"
  },
  onLoad() {
    const payload = wx.getStorageSync("coachAnswer") || {};
    const answer = payload.answer || {};
    const memories = (payload.memories || []).slice(0, 3).map((item) => {
      const similarity = Number(item.similarity || 0);
      const meta = [getMemoryTypeLabel(item.type), item.company, item.role, item.round].filter(Boolean).join(" · ") || "求职记忆";
      const similarityText = similarity ? `相似度 ${similarity.toFixed(2)}` : "";
      return {
        id: item.id || `${item.title || item.company || "memory"}-${item.created_at || ""}`,
        title: item.title || "历史求职记忆",
        metaLine: [meta, similarityText].filter(Boolean).join(" · "),
        summary: item.summary || "",
        tags: (item.tags_json || item.tags || []).slice(0, 4)
      };
    });
    this.setData({
      question: wx.getStorageSync("coachQuestion") || "",
      answer: {
        short_answer: answer.short_answer || "",
        full_answer: answer.full_answer || "",
        evidence_to_use: answer.evidence_to_use || [],
        avoid_saying: answer.avoid_saying || [],
        possible_followups: answer.possible_followups || []
      },
      memories,
      memoryStatusText: memories.length ? "本次召回了 " + memories.length + " 条求职记忆" : "暂未召回历史记忆，本次回答主要基于当前 JD 和简历。"
    });
  },
  copy() {
    const text = [this.data.answer.short_answer, this.data.answer.full_answer].filter(Boolean).join("\n\n");
    wx.setClipboardData({ data: text });
  },
  continueWithFollowup(event) {
    const question = event.currentTarget.dataset.question;
    if (!question) return;
    wx.setStorageSync("coachPrefillQuestion", question);
    wx.navigateTo({ url: "/pages/coach/coach" });
  }
});
