Page({
  data: {
    question: "",
    answer: {},
    memories: []
  },
  onLoad() {
    const payload = wx.getStorageSync("coachAnswer") || {};
    const answer = payload.answer || {};
    const memories = (payload.memories || []).slice(0, 3).map((item) => {
      const similarity = Number(item.similarity || 0);
      const meta = [item.company, item.role, item.round].filter(Boolean).join(" · ") || "历史记录";
      const similarityText = similarity ? `相似度 ${similarity.toFixed(2)}` : "";
      return {
        id: item.id || `${item.title || item.company || "memory"}-${item.created_at || ""}`,
        title: item.title || "历史面试记忆",
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
      memories
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
