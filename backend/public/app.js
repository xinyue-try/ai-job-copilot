const state = {
  analysis: null,
  history: JSON.parse(localStorage.getItem("jobCopilotHistory") || "[]"),
  analysisCache: JSON.parse(localStorage.getItem("jobCopilotAnalysisCache") || "{}"),
  accessToken: localStorage.getItem("jobCopilotAccessToken") || "",
};

const $ = (selector) => document.querySelector(selector);
const jobText = $("#jobText");
const resumeText = $("#resumeText");
const message = $("#message");

function apiUrl(url) {
  const token = String(state.accessToken || "").trim();
  if (!token) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}access_token=${encodeURIComponent(token)}`;
}

function apiHeaders(extra = {}) {
  return extra;
}

function setMessage(text, type = "") {
  message.textContent = text;
  message.style.color = type === "error" ? "#c2410c" : "#667085";
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stableHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function analysisKey() {
  return stableHash(`${normalizeText(jobText.value)}\n---resume---\n${normalizeText(resumeText.value)}`);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function list(values) {
  return Array.isArray(values) && values.length ? values.join("、") : "未识别";
}

function scoreValue(item) {
  return typeof item === "object" && item ? Number(item.score || 0) : Number(item || 0);
}

function scoreMax(item, fallback) {
  return typeof item === "object" && item ? Number(item.max || fallback) : fallback;
}

function renderSummary(container, fields) {
  container.className = "kv-grid";
  container.innerHTML = fields
    .map(([label, value]) => `<div><strong>${label}</strong>：${escapeHtml(value || "未识别")}</div>`)
    .join("");
}

function renderScoreBreakdown(breakdown = {}) {
  const labels = [
    ["skills", "技能硬匹配", 30],
    ["experience", "岗位经验", 25],
    ["industry", "业务/行业", 15],
    ["achievement", "成果证明", 15],
    ["expression", "表达质量", 15],
  ];
  $("#scoreBreakdown").className = "score-breakdown";
  $("#scoreBreakdown").innerHTML = labels
    .map(([key, label, max]) => {
      const item = breakdown[key] || {};
      const score = scoreValue(item);
      const total = scoreMax(item, max);
      const percent = total ? Math.max(0, Math.min(100, (score / total) * 100)) : 0;
      return `
        <article class="score-row">
          <div>
            <strong>${label}</strong>
            <span>${score}/${total}</span>
          </div>
          <div class="score-track"><i style="width:${percent}%"></i></div>
          <p>${escapeHtml(item.reason || "暂无扣分说明")}</p>
          <em>${escapeHtml(item.fix || "暂无补分建议")}</em>
        </article>
      `;
    })
    .join("");
}

function riskClass(level) {
  if (level === "高") return "high";
  if (level === "中") return "mid";
  return "low";
}

function renderInterviewRadar(items = []) {
  $("#interviewRadar").className = "radar-list";
  $("#interviewRadar").innerHTML = items.length
    ? items.map((item) => `
      <article class="radar-card ${riskClass(item.risk_level)}">
        <div class="radar-title">
          <span>${escapeHtml(item.risk_level || "中")}风险</span>
          <strong>${escapeHtml(item.question || "面试题")}</strong>
        </div>
        <p><b>为什么会问：</b>${escapeHtml(item.why_ask || "")}</p>
        <p><b>可能追问：</b>${escapeHtml(item.follow_up || "无")}</p>
        <p><b>回答策略：</b>${escapeHtml(item.answer_strategy || "")}</p>
        <p><b>回答框架：</b>${escapeHtml(list(item.answer_outline))}</p>
        <p><b>简历证据：</b>${escapeHtml(item.resume_evidence || "未识别")}</p>
        <p><b>缺失证据：</b>${escapeHtml(item.missing_evidence || "暂无")}</p>
      </article>
    `).join("")
    : "暂无";
}

function renderList(container, items, renderItem) {
  container.className = "list";
  container.innerHTML = items.length ? items.map(renderItem).join("") : "暂无";
}

function renderAnalysis(analysis, options = {}) {
  state.analysis = analysis;
  const job = analysis.job_summary || {};
  $("#totalScore").textContent = analysis.match_score?.total ?? "--";
  $("#recommendedAction").textContent = analysis.recommended_action || "待判断";

  renderSummary($("#jobSummary"), [
    ["岗位", job.title],
    ["公司", job.company],
    ["城市", job.city],
    ["薪资", job.salary],
    ["JD 摘要", job.jd_summary],
    ["关键词", list(job.keywords)],
  ]);
  renderScoreBreakdown(analysis.match_score?.breakdown || {});
  renderInterviewRadar(analysis.interview_radar || analysis.interview_questions || []);

  renderList($("#missingSkills"), analysis.missing_skills || [], (item) => `
    <article class="list-item">
      <strong>${escapeHtml(item.name || "能力缺口")} · ${escapeHtml(item.priority || "中")}</strong>
      <p>${escapeHtml(item.advice || "")}</p>
    </article>
  `);

  renderList($("#resumeTips"), analysis.resume_rewrite_suggestions || [], (item) => `
    <article class="list-item">
      <strong>${escapeHtml(item.section || "简历优化")}</strong>
      <p>${escapeHtml(item.suggestion || "")}</p>
      <em>${escapeHtml(item.example || "")}</em>
    </article>
  `);

  const greetings = [
    ["稳妥版", analysis.greeting?.safe || analysis.greeting?.steady],
    ["匹配版", analysis.greeting?.matched || analysis.greeting?.direct],
    ["短句版", analysis.greeting?.short || analysis.greeting?.warm],
  ].filter(([, text]) => text);

  $("#greetings").className = "greeting-grid";
  $("#greetings").innerHTML = greetings.length
    ? greetings.map(([label, text]) => `
      <article class="greeting-card">
        <strong>${label}</strong>
        <p>${escapeHtml(text)}</p>
        <button class="ghost-button" data-copy="${encodeURIComponent(text)}" type="button">复制</button>
      </article>
    `).join("")
    : "暂无";

  addHistoryFromAnalysis(analysis, options.key || analysisKey());
}

function addHistoryFromAnalysis(analysis, key) {
  const job = analysis.job_summary || {};
  const radar = analysis.interview_radar || analysis.interview_questions || [];
  const record = {
    id: crypto.randomUUID(),
    key,
    analyzedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    company: job.company || "未识别",
    title: job.title || "未识别岗位",
    city: job.city || "未识别",
    salary: job.salary || "未识别",
    jdSummary: job.jd_summary || "",
    score: analysis.match_score?.total ?? 0,
    action: analysis.recommended_action || "待判断",
    highRiskQuestions: radar.filter((item) => item.risk_level === "高").map((item) => item.question).slice(0, 3),
    missingSkills: (analysis.missing_skills || []).map((item) => item.name).slice(0, 5),
    resumeTips: (analysis.resume_rewrite_suggestions || []).map((item) => item.suggestion).slice(0, 3),
    note: "",
  };
  state.history = [record, ...state.history.filter((item) => {
    if (item.key && record.key) return item.key !== record.key;
    return !(item.company === record.company && item.title === record.title);
  })].slice(0, 100);
  saveHistory();
}

function saveHistory() {
  localStorage.setItem("jobCopilotHistory", JSON.stringify(state.history));
  renderHistory();
}

function renderHistory() {
  const total = state.history.length;
  const avg = total ? Math.round(state.history.reduce((sum, item) => sum + Number(item.score || 0), 0) / total) : 0;
  const good = state.history.filter((item) => item.action === "建议投").length;
  const risks = state.history.reduce((sum, item) => sum + (item.highRiskQuestions?.length || 0), 0);

  $("#statTotal").textContent = total;
  $("#statAvg").textContent = avg;
  $("#statGood").textContent = good;
  $("#statRisk").textContent = risks;

  $("#history").className = total ? "history-list" : "history-list empty";
  $("#history").innerHTML = total
    ? state.history.map((item) => `
      <article class="history-card" data-id="${item.id}">
        <div>
          <strong>${escapeHtml(item.company)} · ${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.city)}｜${escapeHtml(item.salary)}｜${item.score} 分｜${escapeHtml(item.action)}</p>
          <p>高风险题：${escapeHtml(list(item.highRiskQuestions))}</p>
          <p>缺失能力：${escapeHtml(list(item.missingSkills))}</p>
          <textarea data-note placeholder="备注">${escapeHtml(item.note || "")}</textarea>
        </div>
        <button class="ghost-button" data-delete type="button">删除</button>
      </article>
    `).join("")
    : "暂无分析历史";
}

async function uploadFile(url, file, timeoutMs = 100000) {
  const form = new FormData();
  form.append("file", file);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(apiUrl(url), {
    method: "POST",
    headers: apiHeaders(),
    body: form,
    signal: controller.signal,
  });
  try {
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "处理失败。");
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function blobFromCanvas(canvas, type = "image/jpeg", quality = 0.9) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("图片压缩失败，请直接粘贴 JD。"));
    }, type, quality);
  });
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片读取失败，请换一张截图或直接粘贴 JD。"));
    };
    image.src = url;
  });
}

async function prepareOcrImage(file) {
  if (!file.type.startsWith("image/")) return file;
  const image = await loadImageFile(file);
  const maxWidth = 1400;
  const maxHeight = 2600;
  const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const blob = await blobFromCanvas(canvas);
  const name = `${file.name.replace(/\.[^.]+$/, "") || "boss-jd"}-ocr.jpg`;
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}

async function refreshHealth() {
  const response = await fetch("/api/health");
  const payload = await response.json();
  $("#apiStatus").textContent = payload.hasApiKey ? `AI 已就绪 · ${payload.model}` : "缺少 API Key";
  $("#apiStatus").className = `api-pill ${payload.hasApiKey ? "ok" : "warn"}`;
  $("#accessPanel").hidden = !payload.accessProtected;
}

$("#saveAccessTokenBtn").addEventListener("click", () => {
  state.accessToken = $("#accessTokenInput").value.trim();
  localStorage.setItem("jobCopilotAccessToken", state.accessToken);
  setMessage("访问密码已保存在当前浏览器。");
});

$("#jobImageInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const input = event.target;
  input.disabled = true;
  setMessage(`已选择图片：${file.name || "手机图片"}，正在 OCR 识别...`);
  try {
    let ocrFile = file;
    let compressed = false;
    try {
      ocrFile = await prepareOcrImage(file);
      compressed = ocrFile !== file;
    } catch {
      setMessage("图片压缩失败，改用原图 OCR 识别...");
    }
    const sizeKb = Math.max(1, Math.round(ocrFile.size / 1024));
    setMessage(`${compressed ? "图片已压缩到" : "图片大小"} ${sizeKb}KB，正在 OCR 识别...`);
    const payload = await uploadFile("/api/ocr-job", ocrFile, 70000);
    jobText.value = payload.text;
    setMessage("岗位截图识别完成，可以手动修正后分析。");
  } catch (error) {
    setMessage(error.name === "AbortError" ? "OCR 等待超时。请裁剪截图或直接粘贴 JD。" : error.message, "error");
  } finally {
    input.disabled = false;
    input.value = "";
  }
});

$("#resumeInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  setMessage("正在解析简历...");
  try {
    const payload = await uploadFile("/api/parse-resume", file);
    resumeText.value = payload.text;
    localStorage.setItem("jobCopilotResume", payload.text);
    setMessage("简历解析完成，已保存在当前浏览器。");
  } catch (error) {
    setMessage(error.message, "error");
  }
});

$("#saveResumeBtn").addEventListener("click", () => {
  localStorage.setItem("jobCopilotResume", resumeText.value);
  setMessage("简历已保存。");
});

$("#analyzeBtn").addEventListener("click", async () => {
  if (!jobText.value.trim() || !resumeText.value.trim()) {
    setMessage("请先准备岗位文本和简历文本。", "error");
    return;
  }
  setMessage("AI 正在生成求职预判和面试雷达...");
  try {
    const key = analysisKey();
    if (state.analysisCache[key]) {
      renderAnalysis(state.analysisCache[key], { key });
      setMessage("已使用同一 JD + 简历的缓存结果，分数保持一致。");
      return;
    }

    const response = await fetch(apiUrl("/api/analyze-match"), {
      method: "POST",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ jobText: jobText.value, resumeText: resumeText.value }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "分析失败。");
    state.analysisCache[key] = payload.analysis;
    localStorage.setItem("jobCopilotAnalysisCache", JSON.stringify(state.analysisCache));
    renderAnalysis(payload.analysis, { key });
    setMessage("分析完成，已加入岗位分析历史。");
  } catch (error) {
    setMessage(error.message, "error");
  }
});

$("#clearBtn").addEventListener("click", () => {
  jobText.value = "";
  state.analysis = null;
  setMessage("已清空当前岗位。");
});

$("#greetings").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy]");
  if (!button) return;
  await navigator.clipboard.writeText(decodeURIComponent(button.dataset.copy));
  setMessage("话术已复制，可以回到 BOSS 手动发送。");
});

$("#history").addEventListener("input", (event) => {
  if (!event.target.matches("[data-note]")) return;
  const card = event.target.closest(".history-card");
  const item = state.history.find((entry) => entry.id === card?.dataset.id);
  if (!item) return;
  item.note = event.target.value;
  localStorage.setItem("jobCopilotHistory", JSON.stringify(state.history));
});

$("#history").addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;
  const card = event.target.closest(".history-card");
  state.history = state.history.filter((item) => item.id !== card.dataset.id);
  saveHistory();
});

$("#exportBtn").addEventListener("click", async () => {
  const response = await fetch(apiUrl("/api/export-history"), {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ history: state.history }),
  });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `job-analysis-history-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
});

function renderMemoryCards(cards = []) {
  const container = $("#memoryCards");
  if (!container) return;
  container.className = cards.length ? "memory-list" : "memory-list empty";
  container.innerHTML = cards.length
    ? cards.map((card) => {
      const tags = Array.isArray(card.tags_json) ? card.tags_json : [];
      const questions = Array.isArray(card.questions_json) ? card.questions_json : [];
      return `
        <article class="memory-card" data-memory-id="${escapeHtml(card.id)}">
          <header>
            <strong>${escapeHtml(card.title || "未命名记忆")}</strong>
            <button class="ghost-button" data-delete-memory type="button">删除</button>
          </header>
          <p>${escapeHtml([card.company, card.role, card.round, card.result].filter(Boolean).join(" · "))}</p>
          <p>${escapeHtml(card.summary || "")}</p>
          <p>问题：${escapeHtml(questions.map((item) => item.question || item).slice(0, 3).join(" / ") || "暂无")}</p>
          <div class="memory-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
        </article>
      `;
    }).join("")
    : "暂无云端记忆";
}

function renderMemoryPreparation(payload) {
  const box = $("#memoryResultBox");
  const prep = payload.preparation || {};
  const questions = Array.isArray(prep.likely_questions) ? prep.likely_questions : [];
  const risks = Array.isArray(prep.historical_risks) ? prep.historical_risks : [];
  const plan = Array.isArray(prep.practice_plan) ? prep.practice_plan : [];
  box.className = "memory-result";
  box.innerHTML = `
    <article class="memory-card">
      <strong>本轮重点：${escapeHtml(prep.round_focus || "暂无")}</strong>
      <p><b>历史风险：</b>${escapeHtml(risks.join(" / ") || "暂无")}</p>
      <p><b>练习计划：</b>${escapeHtml(plan.join(" / ") || "暂无")}</p>
      <p><b>一分钟讲法：</b>${escapeHtml(prep.one_minute_pitch || "暂无")}</p>
      ${questions.map((item) => `
        <p><b>${escapeHtml(item.question || "可能问题")}</b><br>
        ${escapeHtml(item.why || "")}<br>
        策略：${escapeHtml(item.answer_strategy || "")}<br>
        证据：${escapeHtml(item.evidence || "")}</p>
      `).join("")}
    </article>
  `;
}

function renderCoachAnswer(payload) {
  const box = $("#coachResult");
  if (!box) return;
  const answer = payload.answer || {};
  const evidence = Array.isArray(answer.evidence_to_use) ? answer.evidence_to_use : [];
  const avoid = Array.isArray(answer.avoid_saying) ? answer.avoid_saying : [];
  const followups = Array.isArray(answer.possible_followups) ? answer.possible_followups : [];
  const tips = Array.isArray(answer.practice_tips) ? answer.practice_tips : [];
  box.className = "memory-result";
  box.innerHTML = `
    <article class="memory-card">
      <strong>短答版</strong>
      <p>${escapeHtml(answer.short_answer || "暂无")}</p>
      <strong>完整答法</strong>
      <p>${escapeHtml(answer.full_answer || "暂无")}</p>
      <p><b>可引用证据：</b>${escapeHtml(evidence.join(" / ") || "暂无")}</p>
      <p><b>可能追问：</b>${escapeHtml(followups.join(" / ") || "暂无")}</p>
      <p><b>不要这样说：</b>${escapeHtml(avoid.join(" / ") || "暂无")}</p>
      <p><b>练习提醒：</b>${escapeHtml(tips.join(" / ") || "暂无")}</p>
    </article>
  `;
}

async function loadMemoryCards() {
  const container = $("#memoryCards");
  if (!container) return;
  try {
    const response = await fetch(apiUrl("/api/memory-cards?limit=20"));
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "读取 Job Memory 失败。");
    renderMemoryCards(payload.cards || []);
  } catch (error) {
    container.className = "memory-list empty";
    container.textContent = error.message;
  }
}

$("#refreshMemoryBtn")?.addEventListener("click", loadMemoryCards);

$("#saveMemoryBtn")?.addEventListener("click", async () => {
  const rawText = $("#memoryRawText").value.trim();
  if (!rawText) {
    setMessage("请先粘贴面试复盘文本。", "error");
    return;
  }
  setMessage("正在结构化复盘，并写入云端 Job Memory...");
  $("#memoryResultBox").className = "memory-result";
  $("#memoryResultBox").textContent = "正在结构化复盘，并写入云端 Job Memory...";
  try {
    const response = await fetch(apiUrl("/api/memory-cards"), {
      method: "POST",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        company: $("#memoryCompany").value.trim(),
        role: $("#memoryRole").value.trim(),
        round: $("#memoryRound").value,
        result: $("#memoryResult").value,
        rawText,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "保存 Job Memory 失败。");
    $("#memoryResultBox").className = "memory-result";
    $("#memoryResultBox").innerHTML = `
      <article class="memory-card">
        <strong>${escapeHtml(payload.structured?.title || "已保存记忆")}</strong>
        <p>${escapeHtml(payload.structured?.summary || "")}</p>
        <div class="memory-tags">${(payload.structured?.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      </article>
    `;
    $("#memoryRawText").value = "";
    await loadMemoryCards();
    setMessage("Job Memory 已保存到云端，并生成向量。");
  } catch (error) {
    $("#memoryResultBox").className = "memory-result empty";
    $("#memoryResultBox").textContent = error.message;
    setMessage(error.message, "error");
  }
});

$("#prepareInterviewBtn")?.addEventListener("click", async () => {
  const focus = $("#memoryRawText").value.trim();
  if (!jobText.value.trim() && !focus) {
    setMessage("请填写当前 JD，或在复盘文本框里写本轮准备目标。", "error");
    return;
  }
  setMessage("正在检索历史 Job Memory，并生成本轮面试准备建议...");
  $("#memoryResultBox").className = "memory-result";
  $("#memoryResultBox").textContent = "正在检索历史 Job Memory，并生成本轮面试准备建议...";
  try {
    const response = await fetch(apiUrl("/api/interview-prepare"), {
      method: "POST",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        company: $("#memoryCompany").value.trim(),
        role: $("#memoryRole").value.trim(),
        round: $("#memoryRound").value,
        jobText: jobText.value,
        focus,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "生成面试准备失败。");
    renderMemoryPreparation(payload);
    setMessage(`已召回 ${payload.memories?.length || 0} 条历史记忆。`);
  } catch (error) {
    $("#memoryResultBox").className = "memory-result empty";
    $("#memoryResultBox").textContent = error.message;
    setMessage(error.message, "error");
  }
});

$("#askCoachBtn")?.addEventListener("click", async () => {
  const question = $("#coachQuestion").value.trim();
  if (!question) {
    setMessage("请先输入你想问 AI 的面试问题。", "error");
    return;
  }
  setMessage("AI 正在结合 JD 和历史记忆生成回答思路...");
  $("#coachResult").className = "memory-result";
  $("#coachResult").textContent = "AI 正在结合 JD 和历史记忆生成回答思路...";
  try {
    const response = await fetch(apiUrl("/api/ask-coach"), {
      method: "POST",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        question,
        round: $("#coachRound").value,
        style: $("#coachStyle").value,
        timeLimit: $("#coachTimeLimit").value,
        jobText: jobText.value,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "生成回答思路失败。");
    renderCoachAnswer(payload);
    setMessage(`问一问已生成，参考了 ${payload.memories?.length || 0} 条历史记忆。`);
  } catch (error) {
    $("#coachResult").className = "memory-result empty";
    $("#coachResult").textContent = error.message;
    setMessage(error.message, "error");
  }
});

$("#memoryCards")?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-memory]");
  if (!button) return;
  const card = event.target.closest("[data-memory-id]");
  const id = card?.dataset.memoryId;
  if (!id) return;
  try {
    const response = await fetch(apiUrl(`/api/memory-cards?id=${encodeURIComponent(id)}`), { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "删除记忆失败。");
    await loadMemoryCards();
    setMessage("已删除这条 Job Memory。");
  } catch (error) {
    setMessage(error.message, "error");
  }
});

resumeText.value = localStorage.getItem("jobCopilotResume") || "";
$("#accessTokenInput").value = state.accessToken;
refreshHealth();
renderHistory();
loadMemoryCards();
