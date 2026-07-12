const state = {
  userId: "",
  user: null,
  models: [],
  modelChoices: [],
  defaults: {},
  allowedModels: [],
  modelModes: {},
  provisionKeys: [],
  activeMode: "codex",
  suggestions: {},
  skills: [],
  files: [],
  maskFile: null,
  activeSkill: "codex_workspace",
  activeAssistant: null,
  activeAssistantBubble: null,
  activeTrace: null,
  activeStatus: null,
  activeTraceLines: 0,
  scrollFrame: 0,
  renderFrame: 0,
  pendingAssistantText: "",
  activeContent: "",
  activeUserQuery: "",
  chatHistory: [],
  pendingSkillFileName: "",
  isRunning: false,
  activeView: "home",
  reasoningEffort: "",
};

const roleOrder = [
  "chat_main",
  "small_fast",
  "web_search",
  "image_generation",
  "video_generation",
  "code_review",
];

const mediaModelHints = ["image", "imagine", "seedance", "video", "veo", "sora"];
const fallbackModelModes = {
  codex: {
    label: "对话 / 代码",
    description: "普通对话、代码审查、文件分析和 Skill 工作区。",
    models: ["gpt-5.4-mini", "gpt-5.4", "gpt-5.5"],
    billing: "按文本 Token 计费，适合日常任务和代码任务。",
  },
  claude: {
    label: "高阶创作",
    description: "高质量长文、剧本、复杂推理和高级创作。",
    models: ["claude-fable-5", "claude-opus-4-6", "claude-opus-4-7", "claude-opus-4-8"],
    billing: "按高阶模型输入/输出 Token 计费，价格高于普通对话。",
  },
  image: {
    label: "图像生成",
    description: "Image 2、高速图像、通用图像和高质量图像是独立模型，请按任务明确选择。",
    models: ["gpt-image-2-4K", "geek2api-image-2", "grok-imagine-image", "banana-2", "gemini-3-pro-image-preview"],
    billing: "按张计费。Image 2：1K ¥0.03 / 2K ¥0.06 / 4K ¥0.10。",
  },
  video: {
    label: "视频生成",
    description: "文生视频、图生视频和多素材视频。参考图视频只接收图片参考，轻量图生视频可接 1 个视频参考。",
    models: ["seedance-2.0", "seedance-2.0-dj-fast", "seedance-2.0-ld-17", "seedance-2.0-kz-fast", "seedance-2.0-cl-fast", "seedance-2.0-cl", "seedance-2.0-cl-mini", "grok-video-super-720p"],
    billing: "按秒或按次计费。扩展视频模型支持 4-15 秒；参考图视频 ¥0.162/秒，支持 5/10/15 秒；多素材视频 ¥6.48/次，支持 5-15 秒、9图3视频3音频。",
  },
};
const imageUrlPattern = /^https?:\/\/\S+\.(png|jpe?g|webp|gif)(\?\S*)?$/i;
const videoUrlPattern = /^https?:\/\/\S+\.(mp4|webm|mov|m4v)(\?\S*)?$/i;
const renderableLinkPattern = /^(https?:\/\/\S+|\/(?:codex\/)?api\/tasks\/\S+)$/i;
const agentLogoImg = `<img src="/codex/assets/xingren-logo.png" alt="星人 Codex" />`;

const $ = (id) => document.getElementById(id);

function apiPath(path) {
  const base = window.location.pathname.startsWith("/codex") ? "/codex" : "";
  return `${base}${path}`;
}

function newApiUserId() {
  try {
    const direct = localStorage.getItem("uid");
    if (direct) return direct;
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    return user?.id ? String(user.id) : "";
  } catch {
    return "";
  }
}

function requestHeaders(extra = {}) {
  const headers = { "Content-Type": "application/json", ...extra };
  if (state.userId) headers["X-New-Api-User"] = state.userId;
  return headers;
}

async function request(path, options = {}) {
  const res = await fetch(apiPath(path), {
    credentials: "include",
    ...options,
    headers: {
      ...requestHeaders(),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { detail: text };
  }
  if (!res.ok) throw new Error(data.detail || data.message || `HTTP ${res.status}`);
  return data;
}

async function bootstrap() {
  seedFallbackDefaults();
  state.userId = newApiUserId();
  if (!state.userId) {
    setNotice("请先在 api.aiphui.top 登录 New API，然后再打开 Codex。", "bad");
    setAccount("未登录");
    setBalance("未登录");
    renderModelChoices();
    return;
  }
  setAccount("同步中");
  setBalance("余额同步中");
  try {
    const data = await request("/api/bootstrap");
    state.user = data.user || {};
    state.defaults = data.defaults || {};
    state.suggestions = data.suggestions || {};
    state.skills = data.skills || [];
    state.models = data.models?.models || [];
    state.allowedModels = data.allowed_models || [];
    state.modelModes = data.model_modes || fallbackModelModes;
    setAccount(`已同步 · ${state.user.username || `用户 ${state.user.id || state.userId}`}`);
    setBalanceFromUser(state.user);
    setNotice("账户和额度已同步。你可以直接发送任务。", "ok");
    renderSkills();
    renderModelChoices();
    renderModeConsole();
    if (state.activeView === "home" && !$("messages")?.children.length) {
      showHome();
    }
    provisionAccountKeys(false).catch((error) => {
      state.provisionKeys = [];
      console.warn("provision failed", error);
    });
  } catch (error) {
    setAccount("同步失败");
    setBalance("同步失败");
    setNotice(`同步失败：${error.message}`, "bad");
  }
}

function seedFallbackDefaults() {
  state.defaults = {
    chat_main: state.defaults.chat_main || "gpt-5.4-mini",
    small_fast: state.defaults.small_fast || "gpt-5.4-mini",
    web_search: state.defaults.web_search || "gpt-5.4",
    image_generation: state.defaults.image_generation || "gpt-image-2-4K",
    video_generation: state.defaults.video_generation || "seedance-2.0",
    code_review: state.defaults.code_review || "gpt-5.4-mini",
  };
  state.modelModes = state.modelModes && Object.keys(state.modelModes).length ? state.modelModes : fallbackModelModes;
}

function setAccount(text) {
  $("accountState").textContent = text;
}

function setBalance(text) {
  const pill = $("balanceState");
  if (pill) pill.textContent = text;
}

function setBalanceFromUser(user) {
  const balance = pickBalanceValue(user);
  if (!balance) {
    setBalance("余额未返回");
    return;
  }
  setBalance(`余额 ${formatBalance(balance.value, balance.kind)}`);
}

function pickBalanceValue(user = {}) {
  const displayKeys = ["display_quota", "displayQuota", "quota_text", "quotaText", "balance_text", "balanceText"];
  for (const key of displayKeys) {
    const value = user[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return { value: String(value).trim(), kind: "text" };
    }
  }
  const numericKeys = [
    "remain_quota",
    "remainQuota",
    "quota",
    "balance",
    "credit",
    "credits",
    "money",
    "amount",
  ];
  for (const key of numericKeys) {
    const value = user[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return { value, kind: key };
    }
  }
  return null;
}

function formatBalance(value, kind = "") {
  if (kind === "text") return String(value);
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const compact = new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: Math.abs(number) < 100 ? 2 : 1,
  }).format(number);
  const lower = String(kind).toLowerCase();
  if (["balance", "credit", "credits", "money", "amount"].some((item) => lower.includes(item))) {
    return `¥${compact}`;
  }
  return `${compact} 额度`;
}

function setNotice(text, tone = "") {
  const notice = $("notice");
  notice.textContent = text;
  notice.className = `notice ${tone}`;
  notice.setAttribute("aria-label", text);
}

async function provisionAccountKeys(showNotice = true) {
  if (!state.userId) return;
  const data = await request("/api/provision", { method: "POST" });
  state.provisionKeys = Array.isArray(data.keys) ? data.keys : [];
  if (showNotice) setNotice("四类系统 Key 已同步，可直接用于 Codex、媒体工坊和第三方客户端。", "ok");
  if (state.activeView === "integrations") {
    showIntegrations(false);
  }
}

function renderSkills() {
  const select = $("skillSelect");
  select.innerHTML = "";
  for (const skill of state.skills) {
    const option = document.createElement("option");
    option.value = skill.name;
    option.textContent = skill.display_name || skill.name;
    select.appendChild(option);
  }
  if (!state.skills.some((skill) => skill.name === state.activeSkill) && state.skills[0]) {
    state.activeSkill = state.skills[0].name;
  }
  select.value = state.activeSkill;
  if (state.activeView === "explore") {
    showExplore(false);
  }
  renderInstalledSkillDock();
}

function renderInstalledSkillDock() {
  const list = $("installedSkillList");
  const count = $("skillCount");
  if (!list) return;
  const skills = state.skills.length
    ? state.skills
    : [{ name: "codex_workspace", display_name: "Codex 云工作台", description: "通用工作区", scope: "system" }];
  if (count) count.textContent = String(skills.length);
  list.innerHTML = skills
    .map((skill) => {
      const scope = skillScopeLabel(skill.scope);
      const active = skill.name === state.activeSkill ? " active" : "";
      const publishButton = skill.scope === "user"
        ? `<button type="button" class="publish-skill" data-publish-skill="${escapeHtml(skill.name)}">提交审核</button>`
        : "";
      return `
        <div class="installed-skill-row${active}">
          <button type="button" class="installed-skill${active}" data-skill="${escapeHtml(skill.name)}" title="${escapeHtml(skill.description || "")}">
            <span>${escapeHtml(scope)}</span>
            <strong>${escapeHtml(skill.display_name || skill.name)}</strong>
          </button>
          ${publishButton}
        </div>
      `;
    })
    .join("");
}

function skillScopeLabel(scope) {
  if (scope === "user") return "已安装";
  if (scope === "community") return "社区";
  return "系统";
}

function renderModelSelector() {
  const current = $("modelSelect").value || state.defaults.chat_main || "";
  const mode = currentMode();
  const role = roleForModel(current, mode);
  renderReasoningControl(current, mode);
  const effort = selectedReasoningEffort(current, mode);
  const reasoningLabel = effort ? ` · 思考：${reasoningEffortLabel(effort)}` : "";
  $("modelChip").textContent = `${roleLabel(role)} · ${modeLabel(mode)}${reasoningLabel}`;
}

function reasoningCapability(model, mode = currentMode()) {
  const capabilities = modeConfig(mode).reasoning || {};
  return capabilities[model] || null;
}

function selectedReasoningEffort(model, mode = currentMode()) {
  const capability = reasoningCapability(model, mode);
  if (!capability) return "";
  const efforts = Array.isArray(capability.efforts) ? capability.efforts : [];
  const fallback = capability.default || "medium";
  return efforts.includes(state.reasoningEffort) ? state.reasoningEffort : fallback;
}

function reasoningEffortLabel(effort) {
  return {
    none: "无",
    low: "低",
    medium: "标准",
    high: "高",
    xhigh: "极高",
  }[effort] || effort;
}

function renderReasoningControl(model, mode = currentMode()) {
  const control = $("reasoningControl");
  const select = $("reasoningEffortSelect");
  const capability = reasoningCapability(model, mode);
  if (!control || !select || !capability) {
    if (control) control.hidden = true;
    state.reasoningEffort = "";
    return;
  }
  const efforts = Array.isArray(capability.efforts) ? capability.efforts : [];
  if (!efforts.length) {
    control.hidden = true;
    state.reasoningEffort = "";
    return;
  }
  state.reasoningEffort = selectedReasoningEffort(model, mode);
  select.innerHTML = "";
  for (const effort of efforts) {
    const option = document.createElement("option");
    option.value = effort;
    option.textContent = `思考：${reasoningEffortLabel(effort)}`;
    select.appendChild(option);
  }
  select.value = state.reasoningEffort;
  control.hidden = false;
}

function renderModelChoices() {
  const select = $("modelSelect");
  const mode = currentMode();
  const preferred = modelsForMode(mode);
  const choices = Array.from(new Set(preferred));
  state.modelChoices = choices;
  select.innerHTML = "";
  for (const model of choices) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = modelLabel(model);
    select.appendChild(option);
  }
  select.value = defaultModelForMode(mode, choices);
  renderModeConsole();
  renderModelSelector();
}

function roleLabel(role) {
  return state.suggestions[role]?.label || {
    chat_main: "对话主模型",
    small_fast: "快速模型",
    web_search: "联网检索",
    image_generation: "图像生成",
    video_generation: "视频生成",
    code_review: "代码任务",
  }[role] || role;
}

function collectModelConfig() {
  const config = {};
  for (const role of roleOrder) {
    config[role] = state.defaults[role] || state.suggestions[role]?.recommended || "";
  }
  return config;
}

function roleForModel(model, mode = currentMode()) {
  if (mode === "claude") return "web_search";
  if (mode === "image") return "image_generation";
  if (mode === "video") return "video_generation";
  if (model && model === state.defaults.small_fast) return "small_fast";
  if (model && model === state.defaults.web_search) return "web_search";
  return "chat_main";
}

function isCodexTextModel(model) {
  const lower = String(model || "").toLowerCase();
  if (!lower) return false;
  return !mediaModelHints.some((hint) => lower.includes(hint));
}

function isCodexAllowedTextModel(model) {
  if (!isCodexTextModel(model)) return false;
  if (!state.allowedModels?.length) return ["gpt-5.4-mini", "gpt-5.4", "gpt-5.5"].includes(model);
  return state.allowedModels.includes(model);
}

function normalizeCodexModel(model) {
  const mode = currentMode();
  const choices = modelsForMode(mode);
  if (choices.includes(model)) return model;
  return choices[0] || "gpt-5.4-mini";
}

function currentMode() {
  return state.activeMode || "codex";
}

function modeConfig(mode = currentMode()) {
  return state.modelModes?.[mode] || fallbackModelModes[mode] || fallbackModelModes.codex;
}

function modeLabel(mode = currentMode()) {
  return modeConfig(mode).label || mode;
}

function modelsForMode(mode = currentMode()) {
  const configured = modeConfig(mode).models || [];
  const models = configured.length ? configured : fallbackModelModes[mode]?.models || [];
  if (mode === "codex") {
    return models.filter((model) => isCodexTextModel(model));
  }
  return models.filter(Boolean);
}

function defaultModelForMode(mode, choices) {
  if (!choices.length) return "";
  if (mode === "codex" && choices.includes(state.defaults.small_fast)) return state.defaults.small_fast;
  if (mode === "claude" && choices.includes("claude-opus-4-6")) return "claude-opus-4-6";
  if (mode === "image" && choices.includes(state.defaults.image_generation)) return state.defaults.image_generation;
  if (mode === "video" && choices.includes(state.defaults.video_generation)) return state.defaults.video_generation;
  return choices[0];
}

function modelLabel(model) {
  if (model === "gpt-image-2-4K") return "星人 Image 2 4K · 生图 / 局部编辑";
  if (model === "geek2api-image-2") return "Image 2 · 1K ¥0.03 / 2K ¥0.06 / 4K ¥0.10";
  if (model === "grok-imagine-image") return "高速图像 · 快速编辑 / mask";
  if (model === "banana-2") return "通用图像 · 图像生成 / 图像编辑";
  if (model === "gemini-3-pro-image-preview") return "高质量图像 · 精细生成";
  if (model === "seedance-2.0") return "视频生成 · 标准";
  if (model === "seedance-2.0-dj-fast") return "参考图视频 · 5/10/15 秒";
  if (model === "seedance-2.0-ld-17") return "多素材视频 · 图片/视频/音频参考";
  if (model === "seedance-2.0-kz-fast") return "高速视频 · 4-15 秒";
  if (model === "seedance-2.0-cl-fast") return "轻量图生视频 · 4-15 秒";
  if (model === "seedance-2.0-cl") return "标准图生视频 · 4-15 秒";
  if (model === "seedance-2.0-cl-mini") return "轻量图生视频 · 支持视频参考";
  if (model === "grok-video-super-720p") return "高质量视频 · 720p";
  return model;
}

function hasImageEditInputs() {
  return Boolean(state.maskFile) || state.files.some((file) => file.kind === "image");
}

function syncImageEditModelHint() {
  if (currentMode() !== "image" || !hasImageEditInputs()) return;
  setNotice("已检测到参考图或蒙版。请确认当前选择的图像模型支持该编辑方式。", "ok");
}

function renderModeConsole() {
  const mode = currentMode();
  document.querySelectorAll("[data-mode]").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  const config = modeConfig(mode);
  if ($("modeTitle")) $("modeTitle").textContent = config.label || mode;
  if ($("modeDescription")) $("modeDescription").textContent = config.description || "";
  const model = $("modelSelect")?.value || "";
  const reasoningBilling = selectedReasoningEffort(model, mode) ? config.reasoning_billing || "" : "";
  if ($("billingHint")) {
    $("billingHint").textContent = [config.billing || "", reasoningBilling]
      .filter(Boolean)
      .join(" ");
  }
  if ($("taskInput")) $("taskInput").placeholder = placeholderForMode(mode);
  if ($("maskAttach")) $("maskAttach").style.display = mode === "image" ? "inline-flex" : "none";
}

function placeholderForMode(mode) {
  if (mode === "claude") return "描述你的高阶创作或复杂推理任务，高阶模型会按高阶价格计费";
  if (mode === "image") return "描述要生成或修改的图片。局部编辑请上传原图和蒙版 PNG，透明区域会被重画";
  if (mode === "video") return "描述视频内容，可上传首帧/参考图；按秒或按次计费";
  return "给 Codex 发消息，Enter 发送，Shift + Enter 换行";
}

async function handleFiles(fileList) {
  const files = Array.from(fileList || []);
  const accepted = [];
  for (const file of files) {
    const isImage = file.type.startsWith("image/");
    if (isImage) {
      if (file.size > 6000000) {
        accepted.push({ path: file.name, content: `[图片过大，未上传：${file.size} bytes]` });
        continue;
      }
      const dataUrl = await readAsDataUrl(file);
      accepted.push({ path: file.name, content: dataUrl, preview: dataUrl, kind: "image" });
    } else {
      if (file.size > 120000) {
        accepted.push({ path: file.name, content: `[文件过大，未上传：${file.size} bytes]` });
        continue;
      }
      accepted.push({ path: file.name, content: await file.text(), kind: "file" });
    }
  }
  state.files = [...state.files, ...accepted].slice(0, 20);
  renderFiles();
  syncImageEditModelHint();
}

async function handleMaskFile(file) {
  if (!file) return;
  const isPng = file.type === "image/png" || /\.png$/i.test(file.name || "");
  if (!isPng) {
    setNotice("蒙版必须是 PNG。透明区域会被重画，不透明区域会尽量保留。", "bad");
    return;
  }
  if (file.size > 4000000) {
    setNotice("蒙版 PNG 不能超过 4MB。", "bad");
    return;
  }
  const dataUrl = await readAsDataUrl(file);
  state.maskFile = { path: `__mask__/${file.name || "mask.png"}`, content: dataUrl, preview: dataUrl, kind: "mask" };
  renderFiles();
  syncImageEditModelHint();
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderFiles() {
  const list = $("fileList");
  list.innerHTML = "";
  for (const file of state.files) {
    const pill = document.createElement("span");
    pill.className = "file-pill";
    if (file.preview) {
      pill.innerHTML = `<img src="${file.preview}" alt="" /><span>${escapeHtml(file.path)}</span>`;
    } else {
      pill.textContent = file.path;
    }
    list.appendChild(pill);
  }
  if (state.maskFile) {
    const pill = document.createElement("span");
    pill.className = "file-pill mask-pill";
    pill.innerHTML = `<img src="${state.maskFile.preview}" alt="" /><span>蒙版 PNG · ${escapeHtml(state.maskFile.path.replace("__mask__/", ""))}</span>`;
    list.appendChild(pill);
  }
}

function setActiveNav(id) {
  state.activeView = id.replace(/^nav/, "").toLowerCase() || "home";
  ["navHome", "navExplore", "navKnowledge", "navPlugins", "navIntegrations"].forEach((item) => {
    $(item)?.classList.toggle("active", item === id);
  });
}

function resetMessagesWithAssistant(html) {
  const messages = $("messages");
  messages.innerHTML = "";
  const content = appendMessage("assistant", "", false);
  content.innerHTML = html;
  enhanceCodeBlocks(content);
  requestAnimationFrame(() => {
    messages.scrollTop = 0;
  });
}

function showHome() {
  setActiveNav("navHome");
  resetMessagesWithAssistant(`
    <div class="welcome-panel">
      <div class="welcome-hero">
        <span class="panel-kicker">Codex Workspace</span>
        <h2>把创作、代码和媒体任务交给云端 Codex</h2>
        <p>账户、模型、余额和社区 Skill 会自动同步。你只需要描述任务，必要时上传文件或图片，Codex 会在隔离工作区里处理。</p>
      </div>
      <div class="workspace-stats" aria-label="工作台能力">
        <span><strong>Auto</strong> 账户同步</span>
        <span><strong>Live</strong> 流式事件</span>
        <span><strong>Safe</strong> 独立工作区</span>
      </div>
      <div class="quick-grid">
        <button type="button" data-prompt="帮我审查这段代码，并指出潜在风险。">代码审查</button>
        <button type="button" data-prompt="帮我把这个需求拆成可执行的开发步骤。">需求拆解</button>
        <button type="button" data-prompt="根据我上传的文件，总结重点并给出行动建议。">文件分析</button>
      </div>
    </div>
  `);
}

function showExplore(activate = true) {
  if (activate) setActiveNav("navExplore");
  const skills = state.skills.length
    ? state.skills
    : [{ name: "codex_workspace", display_name: "Codex Workspace", description: "通用代码与任务工作区", scope: "system" }];
  resetMessagesWithAssistant(`
    <div class="welcome-panel">
      <span class="panel-kicker">Explore</span>
      <h2>探索广场</h2>
      <p>这里展示当前可用的系统 Skill 和社区共享 Skill。选择后，它会成为本次会话的工作方式。</p>
      <div class="explore-grid">
        ${skills
          .map(
            (skill) => `
              <button type="button" class="explore-card ${skill.name === state.activeSkill ? "active" : ""}" data-skill="${escapeHtml(skill.name)}">
                <span>${escapeHtml(skill.scope === "community" ? "社区插件" : "系统能力")}</span>
                <strong>${escapeHtml(skill.display_name || skill.name)}</strong>
                <em>${escapeHtml(skill.description || "社区共享 Skill")}</em>
              </button>
            `,
          )
          .join("")}
      </div>
    </div>
  `);
}

function showKnowledge() {
  setActiveNav("navKnowledge");
  resetMessagesWithAssistant(`
    <div class="welcome-panel">
      <div class="welcome-hero">
        <span class="panel-kicker">Knowledge</span>
        <h2>把文件变成本轮任务上下文</h2>
        <p>把本轮任务需要的 Markdown、代码、文本或图片拖到下方输入区，也可以点击加号上传。文件只进入当前隔离会话，不会展示给其他用户。</p>
      </div>
      <div class="knowledge-actions">
        <button type="button" id="knowledgeUpload">上传知识文件</button>
        <button type="button" data-prompt="请基于我上传的资料建立任务上下文，并先总结你读到的重点。">让 Codex 先读资料</button>
      </div>
    </div>
  `);
}

function showIntegrations(activate = true) {
  if (activate) setActiveNav("navIntegrations");
  const cards = provisionCardsHtml();
  resetMessagesWithAssistant(`
    <div class="welcome-panel integration-panel">
      <div class="welcome-hero">
        <span class="panel-kicker">Integrations</span>
        <h2>第三方客户端接入</h2>
        <p>系统已经为你的账户自动准备四类 Key。Codex、图像工坊和视频工坊会自动使用；需要接入 Dify、Cherry Studio、Claude Code 或其他客户端时，只复制对应用途的 Key。</p>
      </div>
      <div class="integration-actions">
        <button type="button" id="refreshProvisionKeys">刷新四类 Key</button>
        <a href="/codex/docs/third-party-api-keys" target="_blank" rel="noopener noreferrer">打开详细教程</a>
        <a href="https://github.com/BigPizzaV3/CodexPlusPlus/releases/latest" target="_blank" rel="noopener noreferrer">下载 Codex++</a>
      </div>
      <div class="integration-grid">${cards}</div>
      ${codexPlusPlusGuideHtml()}
      <div class="integration-help">
        <strong>常见错误</strong>
        <p>401 通常是 Key 错；403 通常是余额不足或模型无权限；模型暂不可用时请切换已开放模型；请求超时可换低延迟模型或稍后重试。</p>
      </div>
    </div>
  `);
}

function codexPlusPlusGuideHtml() {
  return `
    <section class="integration-doc">
      <div class="integration-doc-head">
        <span>Codex++</span>
        <h3>把 Codex 桌面版接入星人 API</h3>
        <p>Codex++ 是第三方增强工具，提供静默启动器和管理面板。星人 API 提供可填写进去的 Base URL、Key 和模型，帮助普通用户把 Codex App 或 Codex CLI 接到第三方 API。</p>
      </div>

      <div class="codexpp-split">
        <article>
          <span>日常启动</span>
          <h4>Codex++</h4>
          <p>静默启动 Codex App，并通过外部 CDP 注入增强功能。不显示管理界面，不修改 Codex App 原始安装文件。</p>
        </article>
        <article>
          <span>配置诊断</span>
          <h4>Codex++ 管理工具</h4>
          <p>用于配置中转注入、检查状态、修复、更新、查看日志、管理增强功能和用户脚本。</p>
        </article>
      </div>

      <div class="download-grid" aria-label="Codex++ 下载链接">
        <a href="https://github.com/BigPizzaV3/CodexPlusPlus/releases/latest" target="_blank" rel="noopener noreferrer">
          <span>统一入口</span>
          <strong>GitHub Releases</strong>
          <em>永远下载最新版本</em>
        </a>
        <a href="https://github.com/BigPizzaV3/CodexPlusPlus/releases/download/v1.2.18/CodexPlusPlus-1.2.18-windows-x64-setup.exe" target="_blank" rel="noopener noreferrer">
          <span>Windows</span>
          <strong>x64 安装包</strong>
          <em>.exe setup</em>
        </a>
        <a href="https://github.com/BigPizzaV3/CodexPlusPlus/releases/download/v1.2.18/CodexPlusPlus-1.2.18-macos-arm64.dmg" target="_blank" rel="noopener noreferrer">
          <span>macOS</span>
          <strong>Apple Silicon</strong>
          <em>M1/M2/M3/M4</em>
        </a>
        <a href="https://github.com/BigPizzaV3/CodexPlusPlus/releases/download/v1.2.18/CodexPlusPlus-1.2.18-macos-x64.dmg" target="_blank" rel="noopener noreferrer">
          <span>macOS</span>
          <strong>Intel x64</strong>
          <em>Intel Mac</em>
        </a>
      </div>

      <div class="setup-steps">
        <section>
          <h4>安装后先做这 5 步</h4>
          <ol>
            <li>打开原版 Codex App，确认能正常进入界面，然后关闭。</li>
            <li>打开 <strong>Codex++ 管理工具</strong>。</li>
            <li>进入中转注入或 API 配置页面，新增 <strong>星人 API</strong> 配置。</li>
            <li>填写下方 Base URL、API Key 和模型。</li>
            <li>应用配置后，日常从 <strong>Codex++</strong> 启动。</li>
          </ol>
        </section>
        <section>
          <h4>星人 API 推荐填写</h4>
          <dl>
            <dt>Base URL</dt>
            <dd><code>https://api.aiphui.top/v1</code><button type="button" data-copy="https://api.aiphui.top/v1" data-copy-label="复制">复制</button></dd>
            <dt>API Key</dt>
            <dd><code>复制“星人 Codex 文本令牌”</code></dd>
            <dt>Model</dt>
            <dd><code>gpt-5.5</code><button type="button" data-copy="gpt-5.5" data-copy-label="复制">复制</button></dd>
          </dl>
        </section>
      </div>

      <div class="feature-list">
        <strong>完整功能说明</strong>
        <ul>
          <li>中转注入：配置多个 API 配置档，可切回官方 ChatGPT 登录态。</li>
          <li>增强功能：插件入口解锁、特殊插件强制安装、会话删除、Markdown 导出、项目移动和 Timeline。</li>
          <li>粘贴修复：富文本粘贴只保留纯文本，减少被误识别为附件。</li>
          <li>配置同步：切换配置档后旧会话仍可见，并保留同步备份。</li>
          <li>开发辅助：Zed 打开入口、upstream worktree 创建、用户脚本管理。</li>
          <li>自动更新：管理工具和静默启动器都会检查 GitHub Release。</li>
        </ul>
      </div>

      <div class="terminal-note">
        <strong>只用终端 Codex CLI？</strong>
        <p>不需要安装 Codex++。在 Codex CLI 里直接填 <code>https://api.aiphui.top/v1</code>、星人 Codex 文本令牌和 <code>gpt-5.5</code> 即可。完整命令见详细教程。</p>
      </div>
    </section>
  `;
}

function provisionCardsHtml() {
  const keys = state.provisionKeys.length ? state.provisionKeys : fallbackProvisionKeys();
  return keys
    .map((item) => {
      const models = Array.isArray(item.models) ? item.models.map(modelLabel).join(" / ") : "";
      return `
        <section class="integration-card">
          <div>
            <span>${escapeHtml(item.label || item.mode)}</span>
            <h3>${escapeHtml(item.name || "")}</h3>
            <p>${escapeHtml(item.usage || "")}</p>
          </div>
          <dl>
            <dt>Base URL</dt>
            <dd><code>${escapeHtml(item.base_url || "")}</code><button type="button" data-copy="${escapeHtml(item.base_url || "")}" data-copy-label="复制">复制</button></dd>
            <dt>API Key</dt>
            <dd><code>${escapeHtml(item.key_hint || "登录后自动同步")}</code><button type="button" data-copy="${escapeHtml(item.key || "")}" data-copy-label="复制 Key" ${item.key ? "" : "disabled"}>复制 Key</button></dd>
            <dt>模型</dt>
            <dd><code>${escapeHtml(models || "按后台权限开放")}</code></dd>
          </dl>
          <small>${escapeHtml(item.billing || "")}</small>
        </section>
      `;
    })
    .join("");
}

function fallbackProvisionKeys() {
  return Object.entries(fallbackModelModes).map(([mode, config]) => ({
    mode,
    label: config.label,
    name: config.label,
    usage: config.description,
    base_url: mode === "claude" ? "https://api.aiphui.top/claude" : "https://api.aiphui.top/v1",
    key_hint: "登录后自动同步",
    models: config.models,
    billing: config.billing,
  }));
}

async function runTask() {
  if (state.isRunning) return;
  const input = $("taskInput");
  const query = input.value.trim();
  if (!query) return;
  if (!state.userId) {
    setNotice("请先登录 New API。", "bad");
    return;
  }
  if (handleLocalSkillInventoryQuery(query)) {
    input.value = "";
    resizeComposer();
    return;
  }
  state.isRunning = true;
  input.value = "";
  resizeComposer();
  appendMessage("user", query);
  state.activeUserQuery = query;
  const mode = currentMode();
  let selectedModel = normalizeCodexModel($("modelSelect").value || "");
  const role = roleForModel(selectedModel, mode);
  const reasoningEffort = selectedReasoningEffort(selectedModel, mode);
  state.activeAssistant = appendMessage("assistant", "", true);
  state.activeContent = "";
  state.pendingAssistantText = "";
  state.activeAssistantBubble = state.activeAssistant.closest(".bubble") || null;
  state.activeTrace = state.activeAssistantBubble?.querySelector(".activity-steps") || null;
  state.activeStatus = state.activeAssistantBubble?.querySelector(".activity-status") || null;
  state.activeTraceLines = 0;
  clearEvents();
  addEvent("同步账户", "active");
  if (mode === "image" && hasImageEditInputs()) {
    addEvent("图像编辑已启用，将使用当前选择的模型", "tool");
  }

  const payload = {
    user_query: query,
    skill_name: mode === "codex" || mode === "claude" ? (state.activeSkill || $("skillSelect").value || "codex_workspace") : "codex_workspace",
    model_role: role,
    model_config: {
      ...collectModelConfig(),
      [role]: selectedModel,
      ...(mode === "codex" ? { chat_main: selectedModel } : {}),
    },
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    mode: "sync",
    files: [...state.files, state.maskFile].filter(Boolean).map(({ path, content }) => ({ path, content })),
    metadata: {
      source: "codex-chat-web",
      ui: "streaming-chat",
      mode,
      billing_hint: modeConfig(mode).billing || "",
      history: state.chatHistory.slice(-10),
      visible_skills: visibleSkillSnapshot(),
      active_skill: state.activeSkill || $("skillSelect").value || "codex_workspace",
    },
  };
  state.files = [];
  state.maskFile = null;
  renderFiles();
  try {
    await streamRequest(payload);
  } catch (error) {
    addEvent("请求失败", "bad");
    updateAssistant(`请求失败：${friendlyErrorMessage(error)}`);
    finishAssistant();
  } finally {
    state.isRunning = false;
  }
}

function friendlyErrorMessage(error) {
  const raw = String(error?.message || error || "").trim();
  const lower = raw.toLowerCase();
  if (
    lower.includes("invalid token") ||
    lower.includes("401") ||
    raw.includes("[REDACTED]替换成") ||
    raw.includes("替换成你的")
  ) {
    return "令牌无效。常见原因是复制了示例里的占位文本，而不是真实的星人令牌。云 Codex 页面内会自动注入 Key，不需要手动设置 OPENAI_API_KEY；如果要接入自己电脑上的第三方客户端，请到左侧“第三方接入”页面复制真实专用 Key。";
  }
  if (lower === "network error" || lower.includes("failed to fetch") || lower.includes("networkerror")) {
    return "网络请求中断。请先刷新页面并点击左侧“自动配置”重新同步四类系统 Key；如果刚才运行过包含 [REDACTED] 或“替换成你的”字样的命令，请不要再复制那段占位命令。";
  }
  return raw || "未知错误";
}

function handleLocalSkillInventoryQuery(query) {
  if (!isSkillInventoryQuery(query)) return false;
  appendMessage("user", query);
  const text = buildSkillInventoryText();
  appendMessage("assistant", text, false);
  commitHistory(query, text);
  setNotice("已从当前账户同步的 Skill 列表读取。", "ok");
  return true;
}

function isSkillInventoryQuery(query) {
  const text = String(query || "").replace(/\s+/g, "").toLowerCase();
  if (!text) return false;
  const hasSkill = /skill|技能|插件|能力/.test(text);
  const hasInventoryVerb = /列出|查看|看看|显示|有哪些|清单|列表|已安装|安装的|加载的|同步的|你有什么|你会什么/.test(text);
  return hasSkill && hasInventoryVerb;
}

function visibleSkillSnapshot() {
  return (state.skills || []).map((skill) => ({
    name: skill.name,
    display_name: skill.display_name || skill.name,
    description: skill.description || "",
    scope: skill.scope || "system",
  }));
}

function buildSkillInventoryText() {
  const skills = visibleSkillSnapshot();
  if (!skills.length) {
    return "当前账户还没有同步到可用 Skill。你可以点击左侧“社区 Skill / 上传 SKILL.md”发布一个共享 Skill。";
  }
  const lines = [
    `当前账户可用 Skill 共 ${skills.length} 个：`,
    "",
    ...skills.map((skill, index) => {
      const scope = skillScopeLabel(skill.scope);
      const description = skill.description ? `：${skill.description}` : "";
      return `${index + 1}. ${skill.display_name}（${skill.name} / ${scope}）${description}`;
    }),
    "",
    `当前已加载：${state.activeSkill || $("skillSelect").value || "codex_workspace"}`,
    "点击左侧任意 Skill 即可加载；发送任务时会自动按当前选中的 Skill 执行。",
  ];
  return lines.join("\n");
}

async function streamRequest(payload) {
  const res = await fetch(apiPath("/api/chat/stream"), {
    method: "POST",
    credentials: "include",
    headers: requestHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok || !res.body) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      message = data.detail || data.message || message;
    } catch {
      // keep generic message
    }
    throw new Error(message);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      const line = chunk.split("\n").find((item) => item.startsWith("data:"));
      if (!line) continue;
      const event = JSON.parse(line.slice(5).trim());
      handleStreamEvent(event);
    }
  }
}

function handleStreamEvent(event) {
  if (event.type === "status") {
    addEvent(event.message || "处理中", "active");
    return;
  }
  if (event.type === "codex_event" || event.type === "tool") {
    addEvent(event.message || event.event || "Codex event", event.type === "tool" ? "tool" : "");
    return;
  }
  if (event.type === "delta") {
    state.activeContent += event.text || "";
    scheduleAssistantUpdate(state.activeContent);
    return;
  }
  if (event.type === "complete") {
    addEvent(`完成 · ${Math.round((event.duration_ms || 0) / 1000)}s`, "done");
    const finalText = finalTextFromCompleteEvent(event);
    updateAssistant(finalText);
    commitHistory(state.activeUserQuery, finalText);
    finishAssistant();
    return;
  }
  if (event.type === "error" || event.status === "failed") {
    addEvent(event.code || "失败", "bad");
    updateAssistant(userFriendlyError(event));
    finishAssistant();
  }
}

function finalTextFromCompleteEvent(event) {
  const media = event?.media && typeof event.media === "object" ? event.media : null;
  const urls = Array.isArray(media?.urls) ? media.urls.filter(Boolean) : [];
  if (urls.length) {
    const type = media.type === "video" ? "video" : "image";
    const label = type === "video" ? "生成视频" : "生成图片";
    return urls.map((url, index) => mediaMarkdown(type, url, `${label} ${index + 1}`)).join("\n\n");
  }
  return event.result || state.activeContent || "已完成。";
}

function mediaMarkdown(type, url, label) {
  if (type === "video") return `[${label}](${url})`;
  return `![${label}](${url})`;
}

function appendMessage(role, text, streaming = false) {
  const article = document.createElement("article");
  article.className = `message ${role}${streaming ? " streaming" : ""}`;
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  if (role === "user") {
    avatar.textContent = "你";
  } else {
    avatar.classList.add("agent-avatar");
    avatar.innerHTML = agentLogoImg;
  }
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (streaming) {
    const activity = document.createElement("div");
    activity.className = "activity-rail";
    activity.innerHTML = `
      <button class="activity-head" type="button" aria-expanded="true">
        <div class="activity-title"><span class="signal-dot"></span><span class="activity-status">建立会话</span></div>
        <div class="activity-mode">live</div>
      </button>
      <div class="activity-steps" aria-label="Codex 流式事件"></div>
    `;
    bubble.appendChild(activity);
  }
  const content = document.createElement("div");
  content.className = "message-content";
  content.innerHTML = renderRichText(text || (streaming ? "" : "正在思考..."));
  bubble.appendChild(content);
  if (role === "assistant") {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    actions.innerHTML = `<button type="button" class="copy-message">复制</button>`;
    bubble.appendChild(actions);
    bindMessageCopy(actions.querySelector(".copy-message"), content);
  }
  article.append(avatar, bubble);
  $("messages").appendChild(article);
  scrollToBottom();
  return content;
}

function updateAssistant(text) {
  if (!state.activeAssistant) return;
  state.pendingAssistantText = String(text || "");
  if (state.renderFrame) {
    cancelAnimationFrame(state.renderFrame);
    state.renderFrame = 0;
  }
  state.activeAssistant.innerHTML = renderRichText(text || "");
  enhanceCodeBlocks(state.activeAssistant);
  scrollToBottom();
}

function scheduleAssistantUpdate(text) {
  state.pendingAssistantText = String(text || "");
  if (state.renderFrame) return;
  state.renderFrame = requestAnimationFrame(() => {
    state.renderFrame = 0;
    if (!state.activeAssistant) return;
    state.activeAssistant.innerHTML = renderRichText(state.pendingAssistantText || "");
    enhanceCodeBlocks(state.activeAssistant);
    scrollToBottom();
  });
}

function finishAssistant() {
  if (state.renderFrame) {
    cancelAnimationFrame(state.renderFrame);
    state.renderFrame = 0;
  }
  if (state.activeAssistant && state.pendingAssistantText) {
    state.activeAssistant.innerHTML = renderRichText(state.pendingAssistantText);
    enhanceCodeBlocks(state.activeAssistant);
  }
  const article = state.activeAssistant?.closest(".message");
  article?.classList.remove("streaming");
  const activity = article?.querySelector(".activity-rail");
  if (activity) {
    activity.classList.add("finished", "collapsed");
    activity.querySelector(".activity-head")?.setAttribute("aria-expanded", "false");
  }
  const meta = article?.querySelector(".activity-mode");
  if (meta) meta.textContent = "done";
  if (state.activeStatus) state.activeStatus.textContent = "完成";
  state.activeAssistantBubble = null;
  state.activeTrace = null;
  state.activeStatus = null;
  state.activeUserQuery = "";
}

function scrollToBottom() {
  const messages = $("messages");
  const distanceFromBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight;
  if (distanceFromBottom > 180) return;
  if (state.scrollFrame) return;
  state.scrollFrame = requestAnimationFrame(() => {
    messages.scrollTop = messages.scrollHeight;
    state.scrollFrame = 0;
  });
}

function renderRichText(text) {
  const value = String(text || "");
  const parts = value.split(/```([\s\S]*?)```/g);
  return parts
    .map((part, index) => {
      if (index % 2 === 1) {
        const lines = part.replace(/^\n+|\n+$/g, "").split("\n");
        const first = lines[0] || "";
        const lang = /^[a-z0-9_-]{1,20}$/i.test(first.trim()) ? first.trim() : "";
        const code = lang ? lines.slice(1).join("\n") : lines.join("\n");
        return `<div class="code-wrap"><div class="code-head"><span>${escapeHtml(lang || "code")}</span><button type="button" class="copy-code">复制</button></div><pre><code>${escapeHtml(code)}</code></pre></div>`;
      }
      return renderProse(part);
    })
    .join("");
}

function renderProse(text) {
  const lines = String(text || "").split("\n");
  let html = "";
  let list = [];
  const flushList = () => {
    if (!list.length) return;
    html += `<ul>${list.map((item) => `<li>${inlineFormat(item)}</li>`).join("")}</ul>`;
    list = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }
    const image = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (image) {
      flushList();
      html += renderGeneratedArtifact(image[2], image[1] || "生成图片", "image");
      continue;
    }
    const link = trimmed.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link && isRenderableUrl(link[2])) {
      flushList();
      html += renderGeneratedArtifact(link[2], link[1] || "生成产物");
      continue;
    }
    if (videoUrlPattern.test(trimmed)) {
      flushList();
      html += renderGeneratedMedia("video", trimmed, "生成视频");
      continue;
    }
    if (imageUrlPattern.test(trimmed)) {
      flushList();
      html += renderGeneratedMedia("image", trimmed, "生成图片");
      continue;
    }
    if (isRenderableUrl(trimmed)) {
      flushList();
      html += renderGeneratedArtifact(trimmed, "生成产物");
      continue;
    }
    if (/^#{1,4}\s+/.test(trimmed)) {
      flushList();
      html += `<h3>${inlineFormat(trimmed.replace(/^#{1,4}\s+/, ""))}</h3>`;
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      list.push(trimmed.replace(/^[-*]\s+/, ""));
      continue;
    }
    flushList();
    html += `<p>${inlineFormat(trimmed)}</p>`;
  }
  flushList();
  return html;
}

function renderGeneratedMedia(type, url, label = "") {
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label || (type === "video" ? "生成视频" : "生成图片"));
  const preview =
    type === "video"
      ? `<video src="${safeUrl}" controls playsinline preload="metadata"></video>`
      : `<img src="${safeUrl}" alt="${safeLabel}" loading="lazy" />`;
  return `
    <figure class="generated-media ${type}">
      <div class="media-frame">${preview}</div>
      <figcaption>
        <span>${safeLabel}</span>
        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">打开</a>
      </figcaption>
    </figure>
  `;
}

function renderGeneratedArtifact(url, label = "", forcedType = "") {
  const type = forcedType || artifactTypeFromUrl(url);
  if (type === "image" || type === "video") {
    return renderGeneratedMedia(type, url, label || (type === "video" ? "生成视频" : "生成图片"));
  }
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label || artifactLabelForType(type));
  const preview = type === "pdf" || type === "html"
    ? `<iframe src="${safeUrl}" title="${safeLabel}" loading="lazy"></iframe>`
    : `<div class="document-preview"><strong>${safeLabel}</strong><span>已生成文档，可在线打开查看。</span></div>`;
  return `
    <figure class="generated-media ${type}">
      <div class="media-frame">${preview}</div>
      <figcaption>
        <span>${safeLabel}</span>
        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">打开</a>
      </figcaption>
    </figure>
  `;
}

function isRenderableUrl(url) {
  const value = String(url || "").trim();
  if (!renderableLinkPattern.test(value)) return false;
  return ["image", "video", "pdf", "html", "document"].includes(artifactTypeFromUrl(value));
}

function artifactTypeFromUrl(url) {
  const clean = String(url || "").split(/[?#]/)[0].toLowerCase();
  if (/\.(png|jpe?g|webp|gif)$/.test(clean)) return "image";
  if (/\.(mp4|webm|mov|m4v)$/.test(clean)) return "video";
  if (/\.pdf$/.test(clean)) return "pdf";
  if (/\.(html?|xhtml)$/.test(clean)) return "html";
  if (/\.(docx?|xlsx?|pptx?|md|txt|csv)$/.test(clean)) return "document";
  return "";
}

function artifactLabelForType(type) {
  if (type === "pdf") return "生成 PDF";
  if (type === "html") return "生成页面";
  if (type === "document") return "生成文档";
  return "生成产物";
}

function inlineFormat(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code class=\"inline-code\">$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function enhanceCodeBlocks(root = document) {
  root.querySelectorAll(".copy-code").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "1";
    button.addEventListener("click", async () => {
      const code = button.closest(".code-wrap")?.querySelector("code")?.textContent || "";
      await navigator.clipboard.writeText(code);
      button.textContent = "已复制";
      setTimeout(() => (button.textContent = "复制"), 1200);
    });
  });
}

function bindMessageCopy(button, content) {
  if (!button) return;
  button.addEventListener("click", async () => {
    const current = button.closest(".bubble")?.querySelector(".message-content") || content;
    await navigator.clipboard.writeText(current?.textContent || "");
    button.textContent = "已复制";
    setTimeout(() => (button.textContent = "复制"), 1200);
  });
}

function commitHistory(userText, assistantText) {
  const user = String(userText || "").trim();
  const assistant = String(assistantText || "").trim();
  if (!user || !assistant) return;
  state.chatHistory.push({ role: "user", content: user });
  state.chatHistory.push({ role: "assistant", content: assistant });
  if (state.chatHistory.length > 20) {
    state.chatHistory = state.chatHistory.slice(-20);
  }
}

function addEvent(text, tone = "") {
  const cleanText = String(text || "").trim();
  if (!cleanText) return;
  const statusText = codexStatusText(cleanText, tone);
  const stream = $("eventStream");
  stream.textContent = statusText;
  stream.className = `event-stream ${tone}`;
  if (state.activeStatus) {
    state.activeStatus.textContent = activityStatusText(cleanText, tone);
  }
  if (state.activeTrace) {
    const step = document.createElement("div");
    step.className = `activity-step ${tone || "info"}`;
    step.innerHTML = `
      <span class="step-dot"></span>
      <span class="step-text">${escapeHtml(statusText)}</span>
      <span class="step-time">${traceTimestamp()}</span>
    `;
    state.activeTrace.appendChild(step);
    state.activeTraceLines += 1;
    while (state.activeTrace.children.length > 5) {
      state.activeTrace.removeChild(state.activeTrace.firstElementChild);
    }
    state.activeTrace.scrollTop = state.activeTrace.scrollHeight;
  }
}

function clearEvents() {
  $("eventStream").textContent = "";
  $("eventStream").className = "event-stream";
}

function shortEventText(text) {
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

function codexStatusText(text, tone = "") {
  if (tone === "done") return text;
  if (/同步账户/.test(text)) return "账户已同步";
  if (/快速会话/.test(text)) return "快速会话已接入";
  if (/图像|图片/.test(text) && /生成/.test(text)) return shortEventText(text);
  if (/视频/.test(text) && /生成/.test(text)) return shortEventText(text);
  if (/正在流式响应/.test(text)) return text;
  if (/创建隔离工作区/.test(text)) return "创建隔离工作区";
  if (/加载社区 Skill/.test(text)) return "加载社区 Skill";
  if (/连接模型/.test(text)) return "连接模型并开始流式生成";
  if (/thread.started/i.test(text)) return "thread.started";
  if (/turn.started/i.test(text)) return "turn.started";
  if (/item.started/i.test(text)) return "item.started";
  if (/item.completed/i.test(text)) return "item.completed";
  if (/error/i.test(text)) return "处理模型服务响应";
  if (/调用工具|command|exec/i.test(text)) return "调用工作区工具";
  return shortEventText(text);
}

function activityStatusText(text, tone = "") {
  if (tone === "done") return "完成";
  if (tone === "bad") return "需要处理";
  if (/快速会话/.test(text)) return "快速会话";
  if (/图像|图片/.test(text) && /生成/.test(text)) return "生成图像";
  if (/视频/.test(text) && /生成/.test(text)) return "生成视频";
  if (/正在流式响应|连接模型/.test(text)) return "正在生成";
  if (/创建隔离工作区/.test(text)) return "准备工作区";
  if (/加载社区 Skill/.test(text)) return "加载 Skill";
  if (/调用工具|command|exec/i.test(text)) return "使用工具";
  return "正在处理";
}

function traceKind(text, tone = "") {
  if (tone === "done") return "done";
  if (tone === "bad") return "error";
  if (/同步账户/.test(text)) return "auth";
  if (/工作区/.test(text)) return "runtime";
  if (/Skill/.test(text)) return "skill";
  if (/模型/.test(text)) return "model";
  if (/thread/i.test(text)) return "thread";
  if (/turn/i.test(text)) return "turn";
  if (/item/i.test(text)) return "item";
  if (/command|exec|工具/i.test(text)) return "tool";
  return "event";
}

function traceTimestamp() {
  const now = new Date();
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
}

function userFriendlyError(event) {
  const message = event.message || event.error?.message || "任务失败。";
  if (/No available channel/i.test(message) || /503/.test(message)) {
    return "这次请求的模型暂不可用。已停止继续重试，请换一个文本模型，或让管理员检查该用户分组的模型权限。";
  }
  return message;
}

async function createSkill() {
  const name = $("skillName").value.trim();
  const description = $("skillDesc").value.trim();
  const content = $("skillContent").value.trim();
  if (!name) return setNotice("请填写 Skill 名称。", "bad");
  if (!content) return setNotice("请填写或上传 SKILL.md。", "bad");
  if (!$("skillAgreement").checked) return setNotice("提交 Skill 审核前必须同意共享规则。", "bad");
  const body = {
    name,
    display_name: name,
    description,
    files: [
      {
        path: "SKILL.md",
        content:
          content ||
          `---\nname: ${name}\ndescription: ${description || "社区 Skill"}\n---\n\n# ${name}\n\n${description || "请按用户要求完成任务。"}\n`,
      },
    ],
  };
  try {
    await request("/api/skills", { method: "POST", body: JSON.stringify(body) });
    $("skillModal").close();
    setNotice("Skill 已安装到你的账户，提交审核后才会进入社区。", "ok");
    await bootstrap();
  } catch (error) {
    setNotice(`Skill 创建失败：${error.message}`, "bad");
  }
}

async function publishPersonalSkill(skillName) {
  const name = String(skillName || "").trim();
  if (!name) return;
  const ok = window.confirm("提交社区审核后，管理员通过前其他用户不可见。确认提交吗？");
  if (!ok) return;
  try {
    await request(`/api/skills/${encodeURIComponent(name)}/publish-community`, { method: "POST" });
    setNotice(`Skill ${name} 已提交社区审核。`, "ok");
    await bootstrap();
  } catch (error) {
    setNotice(`提交审核失败：${error.message}`, "bad");
  }
}

async function importSkillMarkdown(file) {
  if (!file) return;
  const name = file.name || "SKILL.md";
  if (!/\.(md|markdown)$/i.test(name)) {
    setNotice("只能上传 .md 或 .markdown 文件作为 Skill。", "bad");
    return;
  }
  if (file.size > 80000) {
    setNotice("Skill Markdown 不能超过 80KB。", "bad");
    return;
  }
  const content = await file.text();
  state.pendingSkillFileName = name;
  $("skillContent").value = content;
  const meta = parseSkillMarkdownMeta(content, name);
  $("skillName").value = meta.name;
  $("skillDesc").value = meta.description;
  $("skillFileStatus").textContent = `已读取 ${name}，确认共享规则后点击发布即可安装。`;
  setNotice("已读取 Skill Markdown。发布后会加入社区共享 Skill。", "ok");
}

function parseSkillMarkdownMeta(content, filename) {
  const text = String(content || "");
  const front = text.match(/^---\s*\n([\s\S]*?)\n---/);
  const meta = {};
  if (front) {
    for (const line of front[1].split("\n")) {
      const index = line.indexOf(":");
      if (index === -1) continue;
      const key = line.slice(0, index).trim().toLowerCase();
      const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      if (["name", "display_name", "title", "description"].includes(key) && value) meta[key] = value;
    }
  }
  const fallbackName = sanitizeSkillName((filename || "skill").replace(/\.(md|markdown)$/i, ""));
  const firstLine = text
    .split("\n")
    .map((line) => line.trim().replace(/^#{1,6}\s+/, ""))
    .find((line) => line && line !== "---" && !/^(name|description|display_name|title):/i.test(line));
  return {
    name: sanitizeSkillName(meta.name || fallbackName),
    description: (meta.description || firstLine || "社区共享 Skill").slice(0, 500),
  };
}

function sanitizeSkillName(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, 80);
  return cleaned.length >= 2 ? cleaned : "community_skill";
}

function resizeComposer() {
  const input = $("taskInput");
  input.style.height = "auto";
  input.style.height = `${Math.min(Math.max(input.scrollHeight, 56), 180)}px`;
}

function bindEvents() {
  $("runTask").addEventListener("click", runTask);
  $("newChat").addEventListener("click", () => {
    setActiveNav("navHome");
    $("messages").innerHTML = "";
    state.chatHistory = [];
    clearEvents();
  });
  $("navHome").addEventListener("click", showHome);
  $("navExplore").addEventListener("click", () => showExplore(true));
  $("navKnowledge").addEventListener("click", showKnowledge);
  $("navPlugins").addEventListener("click", () => {
    setActiveNav("navPlugins");
    $("skillModal").showModal();
  });
  $("navIntegrations").addEventListener("click", () => showIntegrations(true));
  $("messages").addEventListener("click", (event) => {
    const copyButton = event.target.closest("[data-copy]");
    if (copyButton) {
      const value = copyButton.dataset.copy || "";
      if (value) {
        navigator.clipboard.writeText(value);
        copyButton.textContent = "已复制";
        setTimeout(() => (copyButton.textContent = copyButton.dataset.copyLabel || "复制"), 1200);
      }
      return;
    }
    if (event.target.closest("#refreshProvisionKeys")) {
      provisionAccountKeys(true).catch((error) => setNotice(`同步失败：${error.message}`, "bad"));
      return;
    }
    const skillButton = event.target.closest("[data-skill]");
    if (skillButton) {
      state.activeSkill = skillButton.dataset.skill || state.activeSkill;
      $("skillSelect").value = state.activeSkill;
      renderSkills();
      setNotice(`已选择 Skill：${state.activeSkill}`, "ok");
      $("taskInput").focus();
      return;
    }
    const promptButton = event.target.closest("[data-prompt]");
    if (promptButton) {
      $("taskInput").value = promptButton.dataset.prompt || "";
      resizeComposer();
      $("taskInput").focus();
      return;
    }
    if (event.target.closest("#knowledgeUpload")) {
      $("fileInput").click();
    }
    const activityHead = event.target.closest(".activity-head");
    if (activityHead) {
      const rail = activityHead.closest(".activity-rail");
      const collapsed = rail?.classList.toggle("collapsed");
      activityHead.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }
  });
  $("installedSkillList")?.addEventListener("click", (event) => {
    const publishButton = event.target.closest("[data-publish-skill]");
    if (publishButton) {
      event.stopPropagation();
      publishPersonalSkill(publishButton.dataset.publishSkill);
      return;
    }
    const skillButton = event.target.closest("[data-skill]");
    if (!skillButton) return;
    state.activeSkill = skillButton.dataset.skill || state.activeSkill;
    $("skillSelect").value = state.activeSkill;
    renderSkills();
    setNotice(`已加载 Skill：${state.activeSkill}`, "ok");
    $("taskInput").focus();
  });
  $("composerAttach").addEventListener("click", () => $("fileInput").click());
  $("maskAttach")?.addEventListener("click", () => $("maskFileInput").click());
  document.querySelector(".composer")?.addEventListener("click", (event) => {
    const promptButton = event.target.closest("[data-prompt]");
    if (promptButton) {
      $("taskInput").value = promptButton.dataset.prompt || "";
      resizeComposer();
      $("taskInput").focus();
    }
  });
  document.querySelector(".send-menu")?.addEventListener("click", () => {
    const picker = $("modelSelect");
    if (typeof picker.showPicker === "function") picker.showPicker();
    else picker.focus();
  });
  $("modelSelect").addEventListener("change", () => {
    renderModelSelector();
    renderModeConsole();
  });
  $("reasoningEffortSelect")?.addEventListener("change", (event) => {
    state.reasoningEffort = event.target.value || "";
    renderModelSelector();
    renderModeConsole();
  });
  document.querySelector(".mode-tabs")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mode]");
    if (!button) return;
    state.activeMode = button.dataset.mode || "codex";
    renderModelChoices();
    setNotice(`${modeLabel()}：${modeConfig().billing || ""}`, "ok");
    $("taskInput").focus();
  });
  $("skillSelect").addEventListener("change", (event) => {
    state.activeSkill = event.target.value;
    renderSkills();
  });
  $("taskInput").addEventListener("input", resizeComposer);
  $("taskInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      runTask();
    }
  });
  $("fileInput").addEventListener("change", (event) => handleFiles(event.target.files));
  $("maskFileInput")?.addEventListener("change", (event) => handleMaskFile(event.target.files?.[0]));
  const drop = $("dropZone");
  drop.addEventListener("dragover", (event) => {
    event.preventDefault();
    drop.classList.add("drag");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop.addEventListener("drop", (event) => {
    event.preventDefault();
    drop.classList.remove("drag");
    handleFiles(event.dataTransfer.files);
  });
  $("openSkillModal").addEventListener("click", () => $("skillModal").showModal());
  $("closeSkillModal").addEventListener("click", () => $("skillModal").close());
  $("createSkill").addEventListener("click", createSkill);
  $("skillFileInput").addEventListener("change", (event) => importSkillMarkdown(event.target.files?.[0]));
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char] || char;
  });
}

bindEvents();
showHome();
bootstrap();
