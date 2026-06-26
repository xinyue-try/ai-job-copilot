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
    cards: []
  },
  onShow() {
    this.load();
  },
  buildCards(cards) {
    return (cards || []).map(function(card) {
      const questions = (card.questions_json || []).slice(0, 8).map(function(rawQuestion, questionIndex) {
        const question = typeof rawQuestion === "string" ? { question: rawQuestion } : (rawQuestion || {});
        return {
          id: String(card.id || "memory") + "-q-" + questionIndex,
          numberText: String(questionIndex + 1) + ".",
          questionText: question.question || "未命名问题",
          intentText: question.intent ? "考察意图：" + question.intent : "",
          weaknessText: question.weakness ? "暴露卡点：" + question.weakness : "",
          strategyText: question.next_strategy || question.nextStrategy ? "下次策略：" + (question.next_strategy || question.nextStrategy) : "",
          evidenceText: question.evidence_to_use || question.evidenceToUse ? "可用证据：" + (question.evidence_to_use || question.evidenceToUse) : ""
        };
      });
      const evidence = (card.reusable_evidence_json || []).map(function(item, evidenceIndex) {
        return {
          id: String(card.id || "memory") + "-e-" + evidenceIndex,
          text: item
        };
      });
      const metaLine = [card.company, card.role, card.round, card.result].filter(function(item) {
        return item && item !== "未知";
      }).join(" · ");

      return {
        id: card.id,
        typeLabel: getMemoryTypeLabel(card.type),
        title: card.title || "未命名记忆",
        metaLine: metaLine || "可召回的求职记忆",
        summary: card.summary || "暂无摘要",
        tags: card.tags_json || [],
        questions: questions,
        evidence: evidence,
        expanded: false,
        arrowClass: "history-arrow",
        hasDetail: questions.length > 0 || evidence.length > 0,
        noDetailText: questions.length > 0 || evidence.length > 0 ? "" : "这条记忆暂无结构化详情"
      };
    });
  },
  async load() {
    wx.showLoading({ title: "加载中" });
    try {
      const payload = await request("/api/memory-cards?limit=30");
      this.setData({ cards: this.buildCards(payload.cards || []) });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },
  toggleCard(event) {
    const id = event.currentTarget.dataset.id;
    const cards = this.data.cards.map(function(card) {
      const expanded = card.id === id ? !card.expanded : card.expanded;
      return {
        ...card,
        id: card.id,
        expanded: expanded,
        arrowClass: expanded ? "history-arrow open" : "history-arrow"
      };
    });
    this.setData({ cards: cards });
  },
  deleteCard(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: "删除记忆",
      content: "确定删除这条求职记忆吗？删除后不会再参与后续 RAG 召回。",
      confirmText: "删除",
      confirmColor: "#b42318",
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: "删除中" });
        try {
          await request("/api/memory-cards?id=" + encodeURIComponent(id), {
            method: "DELETE"
          });
          const cards = this.data.cards.filter(function(card) {
            return card.id !== id;
          });
          this.setData({ cards: cards });
          wx.showToast({ title: "已删除" });
        } catch (error) {
          wx.showToast({ title: error.message, icon: "none" });
        } finally {
          wx.hideLoading();
        }
      }
    });
  }
});
