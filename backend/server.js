import http from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { inflateRawSync } from "node:zlib";

const require = createRequire(import.meta.url);
const rootDir = resolve(".");
const publicDir = join(rootDir, "public");
const port = Number(process.env.PORT || 5177);
const bundledNodeModules =
  process.env.CODEX_NODE_MODULES ||
  "C:\\Users\\HONOR\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules";

let latestPage = null;
let ocrWorkerPromise = null;
let ocrQueue = Promise.resolve();
let activeOcrProgress = null;
const jobs = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-App-Token",
  });
  res.end(JSON.stringify(data));
}

function createJob(type, userId, stage = "已创建任务") {
  const now = new Date().toISOString();
  const job = {
    id: randomUUID(),
    type,
    status: "queued",
    progress: 0,
    stage,
    createdAt: now,
    updatedAt: now,
    userId: userId || "default",
    result: null,
    error: "",
  };
  jobs.set(job.id, job);
  cleanupJobs();
  return job;
}

function updateJob(job, patch = {}) {
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  if (typeof job.progress === "number") {
    job.progress = Math.max(0, Math.min(100, Math.round(job.progress)));
  }
  return job;
}

function serializeJob(job) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    result: job.result,
    error: job.error,
  };
}

function runJob(job, runner) {
  updateJob(job, { status: "running", progress: Math.max(job.progress || 0, 5), stage: job.stage || "处理中" });
  Promise.resolve()
    .then(runner)
    .then((result) => {
      updateJob(job, { status: "succeeded", progress: 100, stage: "已完成", result, error: "" });
    })
    .catch((error) => {
      updateJob(job, {
        status: "failed",
        progress: Math.max(job.progress || 0, 1),
        stage: "处理失败",
        error: error.message || "任务处理失败",
      });
    });
}

function cleanupJobs() {
  const now = Date.now();
  const maxAgeMs = 2 * 60 * 60 * 1000;
  for (const [id, job] of jobs.entries()) {
    if (now - new Date(job.createdAt).getTime() > maxAgeMs) {
      jobs.delete(id);
    }
  }
}

function requireAppToken(req, res) {
  const inviteUsers = getInviteUsers();
  if (!inviteUsers.length) {
    req.jobMemoryUserId = process.env.JOB_MEMORY_USER_ID || "default";
    return true;
  }
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const requestToken = req.headers["x-app-token"] || url.searchParams.get("access_token");
  const matched = inviteUsers.find((item) => item.token === requestToken);
  if (matched) {
    req.jobMemoryUserId = matched.userId;
    return true;
  }
  sendJson(res, 401, { error: "访问密码不正确。" });
  return false;
}

function getInviteUsers() {
  const users = [];
  const defaultUserId = process.env.JOB_MEMORY_USER_ID || "default";

  if (process.env.APP_ACCESS_TOKEN) {
    users.push({
      token: process.env.APP_ACCESS_TOKEN,
      userId: defaultUserId
    });
  }

  const raw = String(process.env.APP_INVITE_USERS || "").trim();
  if (!raw) return users;

  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      Object.keys(parsed).forEach((token) => {
        if (token && parsed[token]) {
          users.push({ token, userId: String(parsed[token]) });
        }
      });
      return users;
    } catch {
      return users;
    }
  }

  raw.split(",").forEach((pair) => {
    const parts = pair.split(":");
    const token = String(parts[0] || "").trim();
    const userId = String(parts[1] || "").trim();
    if (token && userId) users.push({ token, userId });
  });
  return users;
}

function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("文件太大，请控制在 20MB 内。"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMultipart(req, body) {
  const contentType = req.headers["content-type"] || "";
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) return {};

  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const fields = {};
  let start = body.indexOf(boundary);

  while (start >= 0) {
    start += boundary.length;
    if (body[start] === 45 && body[start + 1] === 45) break;
    if (body[start] === 13 && body[start + 1] === 10) start += 2;

    const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), start);
    if (headerEnd < 0) break;
    const header = body.slice(start, headerEnd).toString("utf8");

    let end = body.indexOf(boundary, headerEnd + 4);
    if (end < 0) break;
    if (body[end - 2] === 13 && body[end - 1] === 10) end -= 2;

    const name = header.match(/name="([^"]+)"/)?.[1];
    const filename = header.match(/filename="([^"]*)"/)?.[1];
    const type = header.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] || "application/octet-stream";
    const value = body.slice(headerEnd + 4, end);

    if (name) {
      fields[name] = filename ? { filename, type, buffer: value } : value.toString("utf8");
    }
    start = body.indexOf(boundary, end);
  }
  return fields;
}

function loadOptionalPackage(name) {
  try {
    return require(name);
  } catch {
    return require(join(bundledNodeModules, name));
  }
}

function xmlDecode(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseDocxText(buffer) {
  const eocdSignature = 0x06054b50;
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === eocdSignature) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("无法读取 Word 文件结构。");

  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralDirOffset = buffer.readUInt32LE(eocd + 16);
  let ptr = centralDirOffset;

  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(ptr + 10);
    const compressedSize = buffer.readUInt32LE(ptr + 20);
    const fileNameLength = buffer.readUInt16LE(ptr + 28);
    const extraLength = buffer.readUInt16LE(ptr + 30);
    const commentLength = buffer.readUInt16LE(ptr + 32);
    const localHeaderOffset = buffer.readUInt32LE(ptr + 42);
    const fileName = buffer.slice(ptr + 46, ptr + 46 + fileNameLength).toString("utf8");

    if (fileName === "word/document.xml") {
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.slice(dataStart, dataStart + compressedSize);
      const xml = (method === 8 ? inflateRawSync(compressed) : compressed).toString("utf8");
      return xmlDecode(
        xml
          .replace(/<w:tab\/>/g, "\t")
          .replace(/<\/w:p>/g, "\n")
          .replace(/<[^>]+>/g, "")
      ).trim();
    }
    ptr += 46 + fileNameLength + extraLength + commentLength;
  }

  throw new Error("没有在 Word 文件中找到正文。");
}

async function parsePdfText(buffer) {
  const pdfjsDist = (() => {
    try {
      return require(join(rootDir, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.js"));
    } catch {
      return require(join(bundledNodeModules, "pdfjs-dist", "legacy", "build", "pdf.js"));
    }
  })();
  const doc = await pdfjsDist.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const text = await page.getTextContent();
    pages.push(text.items.map((item) => item.str).join(" "));
  }
  return pages.join("\n\n").trim();
}

function htmlToReadableText(html) {
  return xmlDecode(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|h1|h2|h3)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n"))
    .trim();
}

function extractHtmlTitle(html) {
  const title = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  return htmlToReadableText(title).slice(0, 120);
}

async function extractJobFromUrl(rawUrl, onProgress) {
  let url;
  try {
    url = new URL(String(rawUrl || "").trim());
  } catch {
    throw new Error("链接格式不正确，请粘贴完整的 http/https 岗位链接。");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("只支持 http/https 岗位链接。");
  }

  onProgress?.(25, "正在请求岗位页面");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.LINK_FETCH_TIMEOUT_MS || 12000));
  let response;
  try {
    response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
      },
    });
  } catch {
    throw new Error("岗位链接访问失败，请复制 JD 文本或上传截图。");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`岗位链接访问失败（${response.status}），请复制 JD 文本或上传截图。`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
    throw new Error("这个链接不像岗位详情页，请复制 JD 文本或上传截图。");
  }

  onProgress?.(55, "正在清洗页面内容");
  const html = await response.text();
  const title = extractHtmlTitle(html);
  const text = htmlToReadableText(html)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 2)
    .join("\n")
    .slice(0, 30000);

  if (/登录|验证码|安全验证|访问受限|请先登录|扫码登录|人机验证|captcha/i.test(text.slice(0, 3000))) {
    throw new Error("这个岗位链接需要登录或验证，无法直接识别。请复制 JD 文本或上传截图。");
  }
  if (text.length < 120) {
    throw new Error("没有从链接中识别到足够岗位内容，请复制 JD 文本或上传截图。");
  }

  onProgress?.(85, "已提取岗位正文");
  return {
    text,
    title,
    sourceUrl: url.toString(),
  };
}

async function runOcr(buffer, onProgress) {
  const worker = await getOcrWorker();
  const timeoutMs = Number(process.env.OCR_TIMEOUT_MS || 60000);
  const recognize = async () => {
    activeOcrProgress = typeof onProgress === "function" ? onProgress : null;
    const result = await worker.recognize(buffer);
    return result.data.text.trim();
  };
  try {
    const text = await Promise.race([
      recognize(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("OCR 识别超时。请裁剪截图，只保留岗位详情区域后再试。")), timeoutMs);
      }),
    ]);
    if (!text) {
      throw new Error("OCR 没有识别到文字。请确认截图包含岗位详情文字，或直接粘贴 JD。");
    }
    return text;
  } catch (error) {
    if (/超时/.test(error.message || "")) {
      resetOcrWorker();
    }
    throw error;
  } finally {
    activeOcrProgress = null;
  }
}

function enqueueOcr(buffer, onProgress) {
  const task = ocrQueue.then(() => runOcr(buffer, onProgress));
  ocrQueue = task.catch(() => {});
  return task;
}

async function getOcrWorker() {
  const { createWorker } = loadOptionalPackage("tesseract.js");
  const cachePath = join(rootDir, ".tesseract-cache");
  const hasLocalLang = existsSync(join(rootDir, "chi_sim.traineddata")) && existsSync(join(rootDir, "eng.traineddata"));
  const langPath = hasLocalLang ? rootDir : undefined;

  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker("chi_sim+eng", 1, {
      cachePath,
      langPath,
      gzip: !hasLocalLang,
      logger: (m) => {
        if (m?.status) console.log(`OCR ${m.status} ${Math.round((m.progress || 0) * 100)}%`);
        if (activeOcrProgress && typeof m?.progress === "number") {
          activeOcrProgress(m);
        }
      },
      errorHandler: (e) => console.error("Tesseract warning:", e.message || e),
    }).then(async (worker) => {
      if (worker.setParameters) {
        await worker.setParameters({
          tessedit_pageseg_mode: "6",
          preserve_interword_spaces: "1",
        });
      }
      return worker;
    });
  }
  return ocrWorkerPromise;
}

async function resetOcrWorker() {
  const worker = await ocrWorkerPromise.catch(() => null);
  ocrWorkerPromise = null;
  if (worker) {
    await worker.terminate().catch(() => {});
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function inferGreetingContext(jobText, jobSummary = {}) {
  const text = `${jobSummary.title || ""}\n${jobSummary.jd_summary || ""}\n${asArray(jobSummary.keywords).join(" ")}\n${jobText || ""}`;
  const title = String(jobSummary.title || "").trim();
  const role = title && title !== "未识别" ? title.replace(/[（(].*?[）)]/g, "").slice(0, 14) : "产品实习";

  if (/AI|Agent|智能体|工作流|AIGC|大模型|LLM|Copilot|提示词|Prompt|自动化|RPA/i.test(text)) {
    return {
      role,
      safePoint: "做过B站AI Coding工作流落地和Soul AI Agent质检项目",
      matchedPoint: "做过B站AI Coding工作流落地，也参与过Soul AI Agent质检项目",
      shortPoint: "有AI产品项目和SQL/Python经验",
      direction: "AI产品方向",
    };
  }

  if (/数据|策略|增长|指标|分析|A\/B|AB实验|实验|SQL|Python|BI|商业分析|转化|留存|漏斗|归因/i.test(text)) {
    return {
      role,
      safePoint: "做过需求设计、策略优化和数据分析，SQL/Python也能上手",
      matchedPoint: "有需求设计、策略优化和数据分析经验，SQL/Python也能上手",
      shortPoint: "有数据分析和SQL/Python经验",
      direction: "数据策略方向",
    };
  }

  if (/用户研究|用研|市场调研|调研|竞品|访谈|问卷|洞察|画像/i.test(text)) {
    return {
      role,
      safePoint: "做过用户调研、市场调研、数据分析和产品需求设计",
      matchedPoint: "有用户调研、市场调研、数据分析和产品需求设计经验",
      shortPoint: "有调研、产品需求设计和SQL/Python经验",
      direction: "用研/调研方向",
    };
  }

  return {
    role,
    safePoint: "做过产品需求设计、产品实习和SQL/Python分析",
    matchedPoint: "有B站/Soul产品实习、产品需求设计和SQL/Python分析经验",
    shortPoint: "有B站/Soul产品实习和SQL/Python经验",
    direction: "产品方向",
  };
}

function buildGreeting(jobText, jobSummary = {}) {
  const context = inferGreetingContext(jobText, jobSummary);
  return {
    safe: `我一周内到岗，一周5天，可实习6个月，应用统计硕士，有B站/Soul产品实习和SQL/Python经验，${context.safePoint}。`,
    matched: `我一周内到岗，一周5天，可实习6个月。上海对外经贸大学应用统计硕士，有B站/Soul产品实习和SQL/Python经验，${context.matchedPoint}，和这个${context.direction}匹配。`,
    short: `一周内到岗，一周5天，可实习6个月，应用统计硕士，${context.shortPoint}，想了解下这个岗位。`,
  };
}

function resumeHasAbExperiment(resumeText = "") {
  return /A\/B|A-B|AB\s*实验|ABtest|实验组|对照组|灰度实验|增长实验/i.test(resumeText);
}

function removeUnsupportedAbClaims(greeting = {}, resumeText = "") {
  if (resumeHasAbExperiment(resumeText)) return greeting;
  const clean = (value) => String(value || "")
    .replace(/和?A\/B\s*实验经验/g, "")
    .replace(/和?AB\s*实验经验/g, "")
    .replace(/、?A\/B\s*实验/g, "")
    .replace(/、?AB\s*实验/g, "")
    .replace(/A\/B\s*实验、?/g, "")
    .replace(/AB\s*实验、?/g, "")
    .replace(/，，/g, "，")
    .replace(/，。/g, "。");
  return {
    ...greeting,
    safe: clean(greeting.safe),
    matched: clean(greeting.matched),
    short: clean(greeting.short),
  };
}

function normalizeAnalysis(raw, jobText = "", resumeText = "") {
  const jobSummary = raw.job_summary || {};
  return {
    job_summary: jobSummary,
    resume_summary: raw.resume_summary || {},
    match_score: raw.match_score || { total: 0, breakdown: {}, explanation: [] },
    interview_radar: asArray(raw.interview_radar || raw.interview_questions),
    missing_skills: asArray(raw.missing_skills),
    resume_rewrite_suggestions: asArray(raw.resume_rewrite_suggestions),
    greeting: removeUnsupportedAbClaims(raw.greeting || buildGreeting(jobText, jobSummary), resumeText),
    recommended_action: raw.recommended_action || "待判断",
  };
}

function getSupabaseConfig(userId) {
  return {
    url: (process.env.SUPABASE_URL || "").replace(/\/$/, ""),
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "",
    userId: userId || process.env.JOB_MEMORY_USER_ID || "default",
  };
}

function requireSupabaseConfig(userId) {
  const config = getSupabaseConfig(userId);
  if (!config.url || !config.key) {
    const err = new Error("缺少 Supabase 配置，请设置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY。");
    err.status = 500;
    throw err;
  }
  return config;
}

async function supabaseRequest(pathname, options = {}) {
  const config = requireSupabaseConfig();
  const response = await fetch(`${config.url}${pathname}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const err = new Error(payload?.message || payload?.error || "Supabase 请求失败。");
    err.status = response.status;
    throw err;
  }
  return payload;
}

function buildMemoryEmbeddingText(card) {
  const questions = asArray(card.questions || card.questions_json).map((item) => {
    if (typeof item === "string") return item;
    return [
      item.question,
      item.intent,
      item.weakness,
      item.next_strategy || item.nextStrategy,
    ].filter(Boolean).join(" ");
  }).join("\n");
  return [
    card.title,
    card.company,
    card.role,
    card.round,
    asArray(card.tags || card.tags_json).join(" "),
    card.summary,
    questions,
    asArray(card.reusableEvidence || card.reusable_evidence_json).join(" "),
  ].filter(Boolean).join("\n");
}

const memoryTypeLabels = {
  interview_review: "面试复盘",
  project_experience: "项目经历",
  answer_material: "回答素材",
  mock_feedback: "Mock 反馈",
  failed_question: "失败问题",
};

function normalizeMemoryType(type) {
  return memoryTypeLabels[type] ? type : "interview_review";
}

function getMemoryTypeLabel(type) {
  return memoryTypeLabels[normalizeMemoryType(type)];
}

function getMemoryTypeGuidance(type) {
  const normalizedType = normalizeMemoryType(type);
  const guidance = {
    interview_review: "重点提取面试官问题、考察意图、候选人回答卡点、下次策略和可复用证据。",
    project_experience: "重点提取项目背景、目标、用户/业务问题、候选人的动作、协作方式、结果数据、可复用项目证据和可能追问。",
    answer_material: "重点提取可复用回答素材、适合回答的问题、支撑证据、表达亮点、需要避免的夸大说法。",
    mock_feedback: "重点提取 Mock 中暴露的表达问题、能力短板、反馈建议、下次练习策略和可复用改进点。",
    failed_question: "重点提取失败问题、当时回答、卡住原因、面试官可能考察点、下次更好的回答策略和可引用证据。",
  };
  return guidance[normalizedType];
}

async function createEmbedding(input) {
  const apiKey = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error("缺少 EMBEDDING_API_KEY 或 OPENAI_API_KEY，无法生成 Job Memory 向量。");
    err.status = 500;
    throw err;
  }
  const baseUrl = (process.env.EMBEDDING_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const body = {
    model: process.env.EMBEDDING_MODEL || process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    input: String(input || "").slice(0, 12000),
  };
  const dimensions = process.env.EMBEDDING_DIMENSIONS || process.env.OPENAI_EMBEDDING_DIMENSIONS;
  if (dimensions) {
    body.dimensions = Number(dimensions);
  }
  const response = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload.error?.message || "OpenAI embedding 生成失败。");
    err.status = response.status;
    throw err;
  }
  const embedding = payload.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) throw new Error("OpenAI embedding 返回格式异常。");
  return embedding;
}

async function createOptionalEmbedding(input) {
  try {
    return await createEmbedding(input);
  } catch (error) {
    if (error.status === 500 && /EMBEDDING_API_KEY|OPENAI_API_KEY/.test(error.message || "")) {
      return null;
    }
    throw error;
  }
}

async function structureInterviewReview(input) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const err = new Error("缺少 DEEPSEEK_API_KEY，无法结构化求职记忆。");
    err.status = 401;
    throw err;
  }

  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const memoryType = normalizeMemoryType(input.type);
  const memoryTypeLabel = getMemoryTypeLabel(memoryType);
  const rawText = String(input.rawText || "").slice(0, 60000);
  const prompt = `你是一个求职记忆整理助手。用户可能粘贴的是面试复盘、项目经历、回答素材、Mock 反馈、失败问题，也可能是很长的原始实录/ASR 转写稿。

请先在心里完成清洗和归纳：
- 忽略寒暄、设备确认、口误、重复语气词和无意义断句。
- 如果是面试或 Mock 内容，尽量区分“提问方问题”和“候选人回答”；如果说话人不明确，根据语义推断。
- 不要把整段实录直接塞进 summary，要提炼成可复用的求职记忆。
- 每条记忆都要服务后续 RAG 召回：以后用户问相似面试问题时，能被检索并复用。
- 不要编造用户没写过的项目、数据、公司、结果；没有证据的内容只能写成“待补充”或“准备方向”。
- 如果文本很长，优先保留高价值内容：项目深挖、岗位理解、AI/RAG/Agent、业务指标、稳定性、实习时长、转正、地域、硬件/线下经验。

当前记忆类型：${memoryTypeLabel} (${memoryType})
整理重点：${getMemoryTypeGuidance(memoryType)}

请整理成可进入 RAG 知识库的 Memory Card。

只输出严格 JSON，不要 Markdown。

JSON 字段：
{
  "type": "${memoryType}",
  "title": "",
  "company": "",
  "role": "",
  "round": "一面|二面|HR面|其他|未知",
  "result": "通过|未通过|待定|未知",
  "summary": "",
  "questions": [
    {
      "question": "",
      "intent": "",
      "weakness": "",
      "next_strategy": "",
      "evidence_to_use": ""
    }
  ],
  "tags": [],
  "reusable_evidence": []
}

要求：
- type 必须保持为 "${memoryType}"。
- 如果用户已提供公司、岗位、轮次、结果，优先使用用户提供的信息。
- 如果文本没有明确公司、岗位、轮次、结果，不要硬编；公司/岗位可填空，轮次/结果可填“未知”。
- tags 要适合后续检索，例如 RAG、Agent、AI产品、项目真实性、指标、数据分析、用户研究、业务理解、到岗时间。
- questions 用来存“以后可能被问到/已经被问到/需要准备的问题”，保留 3-12 个关键问题。
- 每个 question 的 intent 写考察意图或材料价值；weakness 写暴露的表达/能力卡点，没有就写空字符串；next_strategy 写下次怎么答或怎么补；evidence_to_use 写可引用证据。
- summary 控制在 180 字以内，重点写这条记忆以后能帮用户回答什么、有什么风险或可复用证据。
- reusable_evidence 只写候选人以后可以复用的真实项目证据、经历证据或回答素材。

用户填写信息：
记忆类型：${memoryTypeLabel}
公司：${input.company || ""}
岗位：${input.role || ""}
轮次：${input.round || ""}
结果：${input.result || ""}

原始求职记忆内容：
${rawText}`;

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload.error?.message || "DeepSeek 结构化求职记忆失败。");
    err.status = response.status;
    throw err;
  }
  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw new Error("DeepSeek 没有返回求职记忆 JSON。");
  const card = parseJsonText(text);
  return {
    type: normalizeMemoryType(card.type || memoryType),
    title: card.title || `${input.company || memoryTypeLabel}${input.role ? ` ${input.role}` : ""}求职记忆`,
    company: card.company || input.company || "",
    role: card.role || input.role || "",
    round: card.round || input.round || "未知",
    result: card.result || input.result || "未知",
    rawText,
    summary: card.summary || "",
    questions: asArray(card.questions),
    tags: asArray(card.tags),
    reusableEvidence: asArray(card.reusable_evidence || card.reusableEvidence),
  };
}

async function structureResumeMemories(input) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const err = new Error("缺少 DEEPSEEK_API_KEY，无法生成简历求职记忆。");
    err.status = 401;
    throw err;
  }

  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const resumeText = String(input.resumeText || "").slice(0, 60000);
  const prompt = `你是求职记忆整理助手。请把用户简历拆成可进入 RAG 召回系统的求职记忆卡片。

目标：
- 让后续“问一问 AI”和“面试准备”能召回简历里的真实项目、实习经历、技能证据和回答素材。
- 不要编造简历没有的经历、公司、数据、结果。
- 优先保留能用于面试回答的项目经历和可复用证据。

只输出严格 JSON，不要 Markdown。

JSON 字段：
{
  "cards": [
    {
      "type": "project_experience|answer_material",
      "title": "",
      "company": "",
      "role": "",
      "round": "简历",
      "result": "已沉淀",
      "summary": "",
      "questions": [
        {
          "question": "",
          "intent": "",
          "weakness": "",
          "next_strategy": "",
          "evidence_to_use": ""
        }
      ],
      "tags": [],
      "reusable_evidence": []
    }
  ]
}

要求：
- 生成 3-8 条 cards。
- 每个项目/实习经历尽量单独成卡，例如“B站 AI Coding 工作流落地”“Soul AI Agent 质检项目”。
- 如果简历有可复用的自我介绍、技能组合或求职定位，可以生成 answer_material。
- title 前缀不要写“简历导入”，保持自然项目名。
- summary 控制在 160 字以内，写清这条经历能支撑什么能力。
- questions 写这条经历适合回答的面试问题，例如项目深挖、指标、协作、RAG、Agent、数据分析、产品判断。
- reusable_evidence 只写简历中能找到证据的事实。
- tags 适合后续检索。

简历文本：
${resumeText}`;

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload.error?.message || "DeepSeek 生成简历求职记忆失败。");
    err.status = response.status;
    throw err;
  }
  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw new Error("DeepSeek 没有返回简历求职记忆 JSON。");
  const parsed = parseJsonText(text);
  return asArray(parsed.cards).slice(0, 8).map((card, index) => ({
    type: normalizeMemoryType(card.type || "project_experience"),
    title: card.title || `简历经历 ${index + 1}`,
    company: card.company || "",
    role: card.role || "",
    round: card.round || "简历",
    result: card.result || "已沉淀",
    rawText: resumeText,
    summary: card.summary || "",
    questions: asArray(card.questions),
    tags: Array.from(new Set(["简历导入", ...asArray(card.tags)])),
    reusableEvidence: asArray(card.reusable_evidence || card.reusableEvidence),
  }));
}

async function saveMemoryCard(card, userId) {
  const config = requireSupabaseConfig(userId);
  const embedding = await createOptionalEmbedding(buildMemoryEmbeddingText(card));
  const rows = await supabaseRequest("/rest/v1/memory_cards", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: config.userId,
      type: card.type || "interview_review",
      company: card.company || "",
      role: card.role || "",
      round: card.round || "未知",
      result: card.result || "未知",
      title: card.title || "未命名记忆",
      raw_text: card.rawText || card.raw_text || "",
      summary: card.summary || "",
      questions_json: card.questions || card.questions_json || [],
      tags_json: card.tags || card.tags_json || [],
      reusable_evidence_json: card.reusableEvidence || card.reusable_evidence_json || [],
      embedding: embedding ? `[${embedding.join(",")}]` : null,
    }),
  });
  return rows?.[0] || null;
}

async function listMemoryCards(limit = 30, userId) {
  const config = requireSupabaseConfig(userId);
  const params = new URLSearchParams({
    select: "id,type,company,role,round,result,title,summary,questions_json,tags_json,reusable_evidence_json,created_at",
    user_id: `eq.${config.userId}`,
    order: "created_at.desc",
    limit: String(Math.max(1, Math.min(100, Number(limit) || 30))),
  });
  return supabaseRequest(`/rest/v1/memory_cards?${params.toString()}`);
}

async function listRecentMemoryCards(options = {}) {
  const config = requireSupabaseConfig(options.userId);
  const params = new URLSearchParams({
    select: "id,user_id,type,company,role,round,result,title,raw_text,summary,questions_json,tags_json,reusable_evidence_json,created_at",
    user_id: `eq.${config.userId}`,
    order: "created_at.desc",
    limit: String(Math.max(1, Math.min(10, Number(options.limit) || 5))),
  });
  if (options.round) {
    params.set("round", `eq.${options.round}`);
  }
  return supabaseRequest(`/rest/v1/memory_cards?${params.toString()}`);
}

async function deleteMemoryCard(id, userId) {
  const config = requireSupabaseConfig(userId);
  const params = new URLSearchParams({ id: `eq.${id}`, user_id: `eq.${config.userId}` });
  await supabaseRequest(`/rest/v1/memory_cards?${params.toString()}`, { method: "DELETE" });
  return { ok: true };
}

async function searchMemoryCards(query, options = {}) {
  const config = requireSupabaseConfig(options.userId);
  const embedding = await createEmbedding(query);
  return supabaseRequest("/rest/v1/rpc/match_memory_cards", {
    method: "POST",
    body: JSON.stringify({
      query_embedding: `[${embedding.join(",")}]`,
      match_count: Math.max(1, Math.min(10, Number(options.limit) || 5)),
      match_user_id: config.userId,
      match_round: options.round || null,
    }),
  });
}

function mergeMemoryCards(...groups) {
  const seen = new Set();
  const merged = [];
  groups.flat().forEach((item) => {
    if (!item) return;
    const key = item.id || `${item.title || ""}:${item.created_at || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  });
  return merged;
}

async function recallMemoryCards(query, options = {}) {
  const limit = Math.max(1, Math.min(10, Number(options.limit) || 5));
  const minUsefulCount = Math.min(3, limit);
  let merged = [];
  try {
    const scopedMemories = await searchMemoryCards(query, { ...options, limit });
    merged = asArray(scopedMemories);
    if (options.round && merged.length < minUsefulCount) {
      const broadMemories = await searchMemoryCards(query, { ...options, round: null, limit });
      merged = mergeMemoryCards(merged, asArray(broadMemories));
    }
    if (merged.length >= minUsefulCount || (!options.round && merged.length)) {
      return merged.slice(0, limit);
    }
  } catch (error) {
    if (!/EMBEDDING_API_KEY|OPENAI_API_KEY|embedding/.test(error.message || "")) throw error;
  }
  const recentMemories = await listRecentMemoryCards({ ...options, round: null, limit });
  return mergeMemoryCards(merged, asArray(recentMemories)).slice(0, limit);
}

async function prepareInterviewWithMemory(input) {
  const query = [
    input.company,
    input.role,
    input.round,
    input.jobText,
    input.focus,
  ].filter(Boolean).join("\n");
  const memories = await recallMemoryCards(query, { round: input.round, limit: 5, userId: input.userId });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const err = new Error("缺少 DEEPSEEK_API_KEY，无法生成面试准备建议。");
    err.status = 401;
    throw err;
  }
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const memoryText = asArray(memories).map((item, index) => (
    `#${index + 1} ${item.title}
类型：${getMemoryTypeLabel(item.type)}；轮次：${item.round || "未知"}；岗位：${item.role || "未知"}；相似度：${Number(item.similarity || 0).toFixed(3)}
摘要：${item.summary || ""}
问题：${JSON.stringify(item.questions_json || [])}
标签：${JSON.stringify(item.tags_json || [])}`
  )).join("\n\n");

  const prompt = `你是 AI 产品求职教练。请基于当前岗位和用户历史 Job Memory，生成本轮面试准备建议。

只输出严格 JSON，不要 Markdown：
{
  "memory_used": [],
  "round_focus": "",
  "likely_questions": [{"question": "", "why": "", "answer_strategy": "", "evidence": ""}],
  "historical_risks": [],
  "practice_plan": [],
  "one_minute_pitch": ""
}

当前公司：${input.company || ""}
当前岗位：${input.role || ""}
面试轮次：${input.round || ""}
JD/准备目标：
${input.jobText || input.focus || ""}

召回的历史 Job Memory：
${memoryText || "暂无相关历史记忆"}`;

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload.error?.message || "DeepSeek 生成面试准备失败。");
    err.status = response.status;
    throw err;
  }
  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw new Error("DeepSeek 没有返回面试准备 JSON。");
  return { preparation: parseJsonText(text), memories };
}

async function askCoachWithMemory(input) {
  const query = [
    input.question,
    input.round,
    input.style,
    input.jobText,
  ].filter(Boolean).join("\n");
  const memories = await recallMemoryCards(query, { round: input.round, limit: 5, userId: input.userId });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const err = new Error("缺少 DEEPSEEK_API_KEY，无法生成回答建议。");
    err.status = 401;
    throw err;
  }
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const memoryText = asArray(memories).map((item, index) => (
    `#${index + 1} ${item.title}
类型：${getMemoryTypeLabel(item.type)}；轮次：${item.round || "未知"}；岗位：${item.role || "未知"}；相似度：${item.similarity ? Number(item.similarity).toFixed(3) : "recent"}
摘要：${item.summary || ""}
问题：${JSON.stringify(item.questions_json || [])}
标签：${JSON.stringify(item.tags_json || [])}`
  )).join("\n\n");

  const prompt = `你是候选人的 AI 面试回答教练。用户会输入一个突然不知道怎么回答的问题。

请结合：
1. 用户输入的问题；
2. 当前 JD；
3. 召回的历史 Job Memory；
4. 候选人的真实经历边界。

生成适合面试口头表达的回答建议。不要编造候选人没有的经历。

只输出严格 JSON，不要 Markdown：
{
  "short_answer": "",
  "full_answer": "",
  "evidence_to_use": [],
  "avoid_saying": [],
  "possible_followups": [],
  "practice_tips": []
}

回答风格：${input.style || "稳妥口语化"}
回答时长：${input.timeLimit || "1分钟"}
面试轮次：${input.round || "未知"}

用户问题：
${input.question || ""}

当前 JD/上下文：
${input.jobText || ""}

召回的历史 Job Memory：
${memoryText || "暂无相关历史记忆"}`;

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload.error?.message || "DeepSeek 生成回答建议失败。");
    err.status = response.status;
    throw err;
  }
  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw new Error("DeepSeek 没有返回回答建议 JSON。");
  return { answer: parseJsonText(text), memories };
}

function parseJsonText(text) {
  const clean = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(clean);
}

async function analyzeWithDeepSeek(jobText, resumeText) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const err = new Error("缺少 DEEPSEEK_API_KEY。请先在环境变量中配置。");
    err.status = 401;
    throw err;
  }

  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const prompt = `你是中文求职预判助手。请根据岗位 JD 和候选人简历，输出严格 JSON，不要 Markdown。

产品目标：
- 帮用户判断这个岗位值不值得投。
- 预测面试官最可能追问的问题。
- 反向指出简历应该如何优化。
- 不要编造候选人没有写过的经历。
- 所有“候选人已做过/有经验”的表述必须能在候选人简历中找到证据。
- 如果 JD 要求 A/B 实验、增长实验、投放实验，但简历没有明确写，可以把它作为“岗位可能追问/能力缺口/建议准备”来分析，不能写成候选人做过。
- 不要把“数据分析、策略优化、指标分析”自动等同于“A/B 实验经验”。
- 打招呼语、匹配点、面试回答都不能出现未经简历证据支持的经历。

打分规则，总分 100：
- skills 技能硬匹配 30 分
- experience 岗位经验匹配 25 分
- industry 业务/行业匹配 15 分
- achievement 成果证明 15 分
- expression 简历表达质量 15 分

JSON 字段：
{
  "job_summary": {
    "title": "",
    "company": "",
    "city": "",
    "salary": "",
    "jd_summary": "",
    "responsibilities": [],
    "requirements": [],
    "keywords": []
  },
  "resume_summary": {
    "experience": "",
    "skills": [],
    "projects": [],
    "highlights": [],
    "risks": []
  },
  "match_score": {
    "total": 0,
    "breakdown": {
      "skills": {"score": 0, "max": 30, "reason": "", "fix": ""},
      "experience": {"score": 0, "max": 25, "reason": "", "fix": ""},
      "industry": {"score": 0, "max": 15, "reason": "", "fix": ""},
      "achievement": {"score": 0, "max": 15, "reason": "", "fix": ""},
      "expression": {"score": 0, "max": 15, "reason": "", "fix": ""}
    },
    "reason": ""
  },
  "interview_radar": [
    {
      "question": "",
      "why_ask": "",
      "risk_level": "高|中|低",
      "source": "来自JD要求|来自简历风险点|来自岗位职责",
      "follow_up": "",
      "answer_strategy": "",
      "answer_outline": [],
      "resume_evidence": "",
      "missing_evidence": ""
    }
  ],
  "missing_skills": [{"name": "", "priority": "高|中|低", "advice": ""}],
  "resume_rewrite_suggestions": [{"section": "", "suggestion": "", "example": ""}],
  "greeting": {"safe": "", "matched": "", "short": ""},
  "recommended_action": "建议投|谨慎投|先改简历|不建议投"
}

要求：
- total 必须等于 breakdown 五项 score 之和。
- interview_radar 至少返回 5 个问题，高风险问题排前面。
- greeting 只用于当前复制，不要暗示已经自动投递。
- greeting 必须基于候选人的固定开场改写，并结合当前岗位 JD 添加 1 个岗位相关匹配点。
- 固定开场信息必须尽量保留：一周内到岗、一周 5 天、可实习 6 个月、上海对外经贸大学应用统计硕士、B站/Soul 产品实习、SQL/Python。
- 如果 JD 偏 AI 产品/Agent/工作流，优先提 B站 AI Coding 工作流落地、Soul AI Agent 质检项目。
- 如果 JD 偏数据/策略/增长/产品分析，优先提需求设计、策略优化、数据分析、SQL/Python；只有简历明确写过 A/B 实验时才可以在 greeting/优势项中写“做过 A/B 实验”。
- 如果 JD 明确要求 A/B 实验但简历没有证据，请在 missing_skills、interview_radar 或 resume_rewrite_suggestions 中提醒用户准备“如何设计实验、指标口径、样本分组、结果归因”的回答思路。
- 如果 JD 偏用户研究/市场调研，优先提用户调研、市场调研、数据分析、产品需求设计。
- 每条 greeting 控制在 90 字以内，最多两句话，适合 BOSS 直聘直接发送。
- 不要写“您好，我对贵公司岗位非常感兴趣”“本人”“贵司”“十分荣幸”“附件是我的简历”。
- 不要编造简历没有的经历；不确定的岗位要求不要硬贴。
- 对于简历没有证据的能力，放到 missing_skills 或 resume_rewrite_suggestions，不要放到 greeting 或匹配优势里。
- safe：稳妥版，直接给固定开场和岗位匹配点，不要询问岗位是否还在招。
- matched：匹配版，直接突出最相关岗位匹配点。
- short：短句版，保留到岗/出勤/周期 + 1 个匹配点，尽量短。
- 示例 safe：我一周内到岗，一周5天，可实习6个月，应用统计硕士，有B站/Soul产品实习和SQL、Python分析经验。
- 示例 matched：我一周内到岗，一周5天，可实习6个月。目前在B站产品岗实习，做过AI Coding工作流落地，也参与过Soul AI Agent质检项目，和这个AI产品方向比较匹配。
- 示例 short：一周内到岗，一周5天，可实习6个月，有B站/Soul产品实习和SQL、Python经验，想了解下这个岗位。
- 如果无法识别公司/城市/薪资，填“未识别”。

岗位 JD：
${jobText}

候选人简历：
${resumeText}`;

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload.error?.message || "DeepSeek 调用失败。");
    err.status = response.status;
    throw err;
  }

  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw new Error("DeepSeek 没有返回可解析文本。");
  return normalizeAnalysis(parseJsonText(text), jobText, resumeText);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function historyToCsv(items) {
  const headers = [
    "分析时间",
    "公司",
    "岗位",
    "城市",
    "薪资",
    "匹配分",
    "AI建议",
    "JD摘要",
    "高风险面试题",
    "缺失能力",
    "简历优化建议",
    "备注",
  ];
  const rows = items.map((item) => [
    item.analyzedAt,
    item.company,
    item.title,
    item.city,
    item.salary,
    item.score,
    item.action,
    item.jdSummary,
    asArray(item.highRiskQuestions).join(" | "),
    asArray(item.missingSkills).join(" | "),
    asArray(item.resumeTips).join(" | "),
    item.note,
  ]);
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n")}`;
}

async function handleApi(req, res, pathname) {
  if (req.method === "OPTIONS") return sendJson(res, 204, {});

  try {
    if (pathname === "/api/health" && req.method === "GET") {
      return sendJson(res, 200, {
        ok: true,
        hasApiKey: Boolean(process.env.DEEPSEEK_API_KEY),
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
        accessProtected: Boolean(process.env.APP_ACCESS_TOKEN || process.env.APP_INVITE_USERS),
        userIsolationEnabled: Boolean(process.env.APP_INVITE_USERS),
        memoryEnabled: Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)),
        embeddingEnabled: Boolean(process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY),
      });
    }

    if (!requireAppToken(req, res)) return;

    if (pathname === "/api/ingest-page" && req.method === "POST") {
      const payload = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString("utf8") || "{}");
      latestPage = {
        title: String(payload.title || ""),
        url: String(payload.url || ""),
        text: String(payload.text || "").slice(0, 30000),
        capturedAt: new Date().toISOString(),
      };
      return sendJson(res, 200, { ok: true, page: latestPage });
    }

    if (pathname === "/api/latest-page" && req.method === "GET") {
      return sendJson(res, 200, { page: latestPage });
    }

    if (pathname.startsWith("/api/jobs/") && req.method === "GET") {
      const jobId = decodeURIComponent(pathname.replace("/api/jobs/", ""));
      const job = jobs.get(jobId);
      if (!job || job.userId !== req.jobMemoryUserId) {
        return sendJson(res, 404, { error: "任务不存在或已过期。" });
      }
      return sendJson(res, 200, { job: serializeJob(job) });
    }

    if (pathname === "/api/jobs/ocr-job" && req.method === "POST") {
      const fields = parseMultipart(req, await readBody(req));
      const file = fields.file;
      if (!file?.buffer) return sendJson(res, 400, { error: "请上传岗位截图。" });
      const job = createJob("ocr-job", req.jobMemoryUserId, "图片已上传，等待 OCR 识别");
      updateJob(job, { progress: 15, stage: "图片已上传，正在排队识别" });
      runJob(job, async () => {
        updateJob(job, { progress: 25, stage: "正在识别截图文字" });
        const text = await enqueueOcr(file.buffer, (message) => {
          const ocrProgress = Math.round(25 + (message.progress || 0) * 65);
          updateJob(job, {
            progress: ocrProgress,
            stage: message.status ? `OCR ${message.status}` : "正在识别截图文字",
          });
        });
        updateJob(job, { progress: 95, stage: "正在整理识别结果" });
        return { text };
      });
      return sendJson(res, 202, { jobId: job.id, job: serializeJob(job) });
    }

    if (pathname === "/api/jobs/analyze-match" && req.method === "POST") {
      const payload = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString("utf8") || "{}");
      if (!payload.jobText?.trim() || !payload.resumeText?.trim()) {
        return sendJson(res, 400, { error: "请先准备岗位文本和简历文本。" });
      }
      const job = createJob("analyze-match", req.jobMemoryUserId, "已收到分析任务");
      runJob(job, async () => {
        updateJob(job, { progress: 10, stage: "正在准备 JD 和简历文本" });
        await new Promise((resolve) => setTimeout(resolve, 120));
        updateJob(job, { progress: 30, stage: "正在整理岗位要求和候选人经历" });
        await new Promise((resolve) => setTimeout(resolve, 120));
        updateJob(job, { progress: 65, stage: "AI 正在分析匹配度和面试风险" });
        const analysis = await analyzeWithDeepSeek(String(payload.jobText).trim(), String(payload.resumeText).trim());
        updateJob(job, { progress: 90, stage: "正在解析分析结果" });
        return { analysis };
      });
      return sendJson(res, 202, { jobId: job.id, job: serializeJob(job) });
    }

    if (pathname === "/api/jobs/parse-link" && req.method === "POST") {
      const payload = JSON.parse((await readBody(req, 1024 * 1024)).toString("utf8") || "{}");
      if (!payload.url?.trim()) {
        return sendJson(res, 400, { error: "请先粘贴岗位链接。" });
      }
      const job = createJob("parse-link", req.jobMemoryUserId, "已收到岗位链接");
      runJob(job, async () => {
        updateJob(job, { progress: 10, stage: "正在校验岗位链接" });
        const result = await extractJobFromUrl(String(payload.url), (progress, stage) => {
          updateJob(job, { progress, stage });
        });
        updateJob(job, { progress: 92, stage: "正在填充岗位文本" });
        return result;
      });
      return sendJson(res, 202, { jobId: job.id, job: serializeJob(job) });
    }

    if (pathname === "/api/ocr-job" && req.method === "POST") {
      const fields = parseMultipart(req, await readBody(req));
      const file = fields.file;
      if (!file?.buffer) return sendJson(res, 400, { error: "请上传岗位截图。" });
      const text = await enqueueOcr(file.buffer);
      return sendJson(res, 200, { text });
    }

    if (pathname === "/api/parse-resume" && req.method === "POST") {
      const fields = parseMultipart(req, await readBody(req));
      const file = fields.file;
      if (!file?.buffer) return sendJson(res, 400, { error: "请上传 PDF 或 Word 简历。" });
      const filename = file.filename.toLowerCase();
      const text = filename.endsWith(".pdf")
        ? await parsePdfText(file.buffer)
        : filename.endsWith(".docx")
          ? parseDocxText(file.buffer)
          : "";
      if (!text) return sendJson(res, 400, { error: "暂时只支持 PDF 和 DOCX 简历。" });
      return sendJson(res, 200, { text });
    }

    if (pathname === "/api/analyze-match" && req.method === "POST") {
      const payload = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString("utf8") || "{}");
      if (!payload.jobText?.trim() || !payload.resumeText?.trim()) {
        return sendJson(res, 400, { error: "请先准备岗位文本和简历文本。" });
      }
      const analysis = await analyzeWithDeepSeek(payload.jobText.trim(), payload.resumeText.trim());
      return sendJson(res, 200, { analysis });
    }

    if (pathname === "/api/resume-memory" && req.method === "POST") {
      const payload = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString("utf8") || "{}");
      if (!payload.resumeText?.trim()) {
        return sendJson(res, 400, { error: "请先保存或粘贴简历文本。" });
      }
      const structuredCards = await structureResumeMemories({
        resumeText: String(payload.resumeText || ""),
      });
      if (!structuredCards.length) {
        return sendJson(res, 400, { error: "没有从简历中提取到可沉淀的求职记忆。" });
      }
      const cards = [];
      for (const structured of structuredCards) {
        const card = await saveMemoryCard(structured, req.jobMemoryUserId);
        if (card) cards.push(card);
      }
      return sendJson(res, 200, { cards, count: cards.length });
    }

    if (pathname === "/api/memory-cards" && req.method === "GET") {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      const cards = await listMemoryCards(url.searchParams.get("limit") || 30, req.jobMemoryUserId);
      return sendJson(res, 200, { cards });
    }

    if (pathname === "/api/memory-cards" && req.method === "POST") {
      const payload = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString("utf8") || "{}");
      if (!payload.rawText?.trim()) {
        return sendJson(res, 400, { error: "请先粘贴求职记忆内容。" });
      }
      const structured = await structureInterviewReview({
        type: String(payload.type || "interview_review"),
        company: String(payload.company || ""),
        role: String(payload.role || ""),
        round: String(payload.round || ""),
        result: String(payload.result || ""),
        rawText: String(payload.rawText || ""),
      });
      const card = await saveMemoryCard(structured, req.jobMemoryUserId);
      return sendJson(res, 200, { card, structured });
    }

    if (pathname === "/api/memory-cards" && req.method === "DELETE") {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      const id = url.searchParams.get("id");
      if (!id) return sendJson(res, 400, { error: "缺少 memory card id。" });
      await deleteMemoryCard(id, req.jobMemoryUserId);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === "/api/memory-search" && req.method === "POST") {
      const payload = JSON.parse((await readBody(req, 1024 * 1024)).toString("utf8") || "{}");
      if (!payload.query?.trim()) return sendJson(res, 400, { error: "请填写检索内容。" });
      const memories = await recallMemoryCards(String(payload.query), {
        round: payload.round ? String(payload.round) : null,
        limit: payload.limit || 5,
        userId: req.jobMemoryUserId,
      });
      return sendJson(res, 200, { memories });
    }

    if (pathname === "/api/interview-prepare" && req.method === "POST") {
      const payload = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString("utf8") || "{}");
      if (!payload.jobText?.trim() && !payload.focus?.trim()) {
        return sendJson(res, 400, { error: "请填写 JD 或本轮准备目标。" });
      }
      const result = await prepareInterviewWithMemory({
        company: String(payload.company || ""),
        role: String(payload.role || ""),
        round: String(payload.round || ""),
        jobText: String(payload.jobText || ""),
        focus: String(payload.focus || ""),
        userId: req.jobMemoryUserId,
      });
      return sendJson(res, 200, result);
    }

    if (pathname === "/api/ask-coach" && req.method === "POST") {
      const payload = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString("utf8") || "{}");
      if (!payload.question?.trim()) {
        return sendJson(res, 400, { error: "请先输入你想问 AI 的面试问题。" });
      }
      const result = await askCoachWithMemory({
        question: String(payload.question || ""),
        round: String(payload.round || ""),
        style: String(payload.style || ""),
        timeLimit: String(payload.timeLimit || ""),
        jobText: String(payload.jobText || ""),
        userId: req.jobMemoryUserId,
      });
      return sendJson(res, 200, result);
    }

    if ((pathname === "/api/export-csv" || pathname === "/api/export-history") && req.method === "POST") {
      const payload = JSON.parse((await readBody(req, 4 * 1024 * 1024)).toString("utf8") || "{}");
      const csv = historyToCsv(Array.isArray(payload.history) ? payload.history : payload.records || []);
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"job-analysis-history.csv\"",
      });
      return res.end(csv);
    }

    return sendJson(res, 404, { error: "接口不存在。" });
  } catch (error) {
    return sendJson(res, error.status || 500, { error: error.message || "服务异常。" });
  }
}

function serveStatic(req, res, pathname) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(publicDir, `.${cleanPath}`);
  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Not found");
  }
  res.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream" });
  res.end(readFileSync(filePath));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) return handleApi(req, res, url.pathname);
  return serveStatic(req, res, url.pathname);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`AI 求职 Copilot running at http://localhost:${port}`);
});
