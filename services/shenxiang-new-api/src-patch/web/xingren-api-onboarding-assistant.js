(function () {
  if (window.__xingrenApiOnboardingAssistantLoaded) return;
  window.__xingrenApiOnboardingAssistantLoaded = true;

  var CONFIG = {
    chatEndpoint: "/api/xingren-onboarding-assistant/chat",
    tokenEndpoint: "/api/xingren-onboarding-assistant/codex-token",
    baseUrl: "https://api.aiphui.top/v1",
    claudeBaseUrl: "https://api.aiphui.top/claude",
    codexModel: "gpt-5.5",
    fallbackCodexModel: "gpt-5.4-mini",
    dashboardPath: "/console",
    tokenPath: "/console/token",
    playgroundPath: "/console/playground",
    mediaPath: "/console/media-playground",
    pricingPath: "/pricing",
    walletPath: "/console/topup",
    docsPath: "/docs/",
    servicePath: "/console/channel",
    logsPath: "/console/log",
    codexCloudPath: "/codex",
    loginPath: "/login",
  };

  var SITE_ROUTES = {
    home: {
      title: "首页",
      path: "/",
      hint: "了解星人 API 的主要能力、导航入口、登录注册和站点介绍。",
      aliases: ["首页", "主页", "官网", "home", "星人"],
    },
    dashboard: {
      title: "控制台",
      path: CONFIG.dashboardPath,
      hint: "查看账号状态、余额、最近用量和常用入口。",
      aliases: ["控制台", "首页", "后台", "dashboard", "console", "账号"],
    },
    token: {
      title: "令牌管理",
      path: CONFIG.tokenPath,
      hint: "创建、复制、停用 API Key，也可以让我替你创建 Codex 专用 Key。",
      aliases: ["令牌", "密钥", "key", "api key", "sk-", "token", "创建api", "创建 api", "复制api", "复制 api"],
    },
    playground: {
      title: "文本调试台",
      path: CONFIG.playgroundPath,
      hint: "测试文本模型、排查 401/403/timeout 和请求格式。",
      aliases: ["playground", "调试", "测试模型", "文本", "聊天", "请求"],
    },
    media: {
      title: "媒体工坊",
      path: CONFIG.mediaPath,
      hint: "生成图片、编辑图片、选择 1K/2K/4K 和比例。",
      aliases: ["媒体", "画图", "图片", "图像", "生成图", "4k", "2k", "gpt-image", "banana", "media"],
    },
    pricing: {
      title: "模型广场",
      path: CONFIG.pricingPath,
      hint: "查看模型权限、价格、分组和支持的接口。",
      aliases: ["价格", "扣费", "费用", "模型广场", "模型", "pricing", "余额不对", "0.108", "0.788"],
    },
    wallet: {
      title: "充值中心",
      path: CONFIG.walletPath,
      hint: "查看余额、充值入口、充值记录和套餐。",
      aliases: ["充值", "余额", "钱包", "账单", "topup", "支付"],
    },
    docs: {
      title: "接入文档",
      path: CONFIG.docsPath,
      hint: "查看 Base URL、接口格式、客户端接入教程。",
      aliases: ["文档", "教程", "base url", "接口", "curl", "docs", "接入说明"],
    },
    service: {
      title: "模型服务设置",
      path: CONFIG.servicePath,
      hint: "查看模型服务状态、可用模型和健康状态。",
      aliases: ["服务设置", "模型服务", "服务状态", "可用模型"],
    },
    logs: {
      title: "用量日志",
      path: CONFIG.logsPath,
      hint: "查看请求记录、扣费、状态码和返回信息。",
      aliases: ["日志", "记录", "用量", "报错记录", "request id", "日志记录"],
    },
    codexCloud: {
      title: "云端 Codex",
      path: CONFIG.codexCloudPath,
      hint: "在浏览器里使用云端 Codex 工作区，处理代码任务、查看运行状态和排查环境问题。",
      aliases: ["云端codex", "云端 codex", "cloud codex", "codex 工作区", "codex workspace"],
    },
  };

  var state = {
    open: false,
    loading: false,
    streaming: false,
    busyLabel: "",
    messages: [],
    selectedModel: CONFIG.codexModel,
    selectedOS: "mac",
    generatedKey: "",
    awaitingCustomModel: false,
  };

  function redactSecrets(text) {
    return String(text || "")
      .replace(/sk-[A-Za-z0-9._-]{8,}/g, "sk-***")
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***")
      .replace(/Authorization\s*:\s*[A-Za-z0-9._ -]{8,}/gi, "Authorization: ***");
  }

  function escapeHTML(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function limitText(text, max) {
    var value = String(text || "").trim();
    return value.length > max ? value.slice(0, max) + "..." : value;
  }

  function normalizeAgentText(text) {
    return String(text || "")
      .replace(/```[\s\S]*?```/g, function (match) {
        return match.replace(/```[a-zA-Z0-9_-]*\n?/g, "").replace(/```/g, "");
      })
      .replace(/^\s{0,3}#{1,6}\s*/gm, "")
      .replace(/^\s*[-*]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function validModelName(model) {
    var value = String(model || "").trim();
    if (!value || value.length > 64) return "";
    return /^[A-Za-z0-9._-]+$/.test(value) ? value : "";
  }

  function shellSingleQuote(value) {
    return "'" + String(value || "").replace(/'/g, "'\\''") + "'";
  }

  function powershellDoubleQuote(value) {
    return '"' + String(value || "").replace(/`/g, "``").replace(/"/g, '`"') + '"';
  }

  function getCurrentUserId() {
    var directKeys = ["uid", "user_id", "userId", "new-api-user"];
    for (var i = 0; i < directKeys.length; i += 1) {
      var direct = localStorage.getItem(directKeys[i]);
      if (/^\d+$/.test(String(direct || "").trim())) return String(direct).trim();
    }

    var objectKeys = ["user", "new_api_user", "userInfo", "account"];
    for (var j = 0; j < objectKeys.length; j += 1) {
      var raw = localStorage.getItem(objectKeys[j]);
      if (!raw) continue;
      try {
        var parsed = JSON.parse(raw);
        var id = pickId(parsed);
        if (id) return id;
      } catch (error) {
        if (/^\d+$/.test(raw.trim())) return raw.trim();
      }
    }
    return "";
  }

  function pickId(value) {
    if (!value || typeof value !== "object") return "";
    var candidates = [value.id, value.user_id, value.userId];
    if (value.user) candidates.push(value.user.id, value.user.user_id, value.user.userId);
    if (value.data) candidates.push(value.data.id, value.data.user_id, value.data.userId);
    for (var i = 0; i < candidates.length; i += 1) {
      if (/^\d+$/.test(String(candidates[i] || "").trim())) return String(candidates[i]).trim();
    }
    return "";
  }

  function createCodexToken(model) {
    var userId = getCurrentUserId();
    if (!userId) {
      return Promise.reject(new Error("我没有识别到当前登录账号。请先登录，然后回到这里重新开始。"));
    }

    return fetch(CONFIG.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "New-Api-User": userId,
      },
      credentials: "same-origin",
      body: JSON.stringify({ model: validModelName(model) || CONFIG.codexModel }),
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (payload) {
            if (!res.ok || payload.success === false) {
              throw new Error(payload.message || "API Key 创建失败，请稍后重试。");
            }
            return payload;
          });
      })
      .then(function (payload) {
        if (!payload.key || !/^sk-[A-Za-z0-9._-]+$/.test(payload.key)) {
          throw new Error("API Key 已创建，但没有拿到可复制的 Key。请到令牌管理页查看或重新生成。");
        }
        return payload;
      });
  }

  function macCodexCommand(model, key) {
    return [
      "XINGREN_API_KEY=" + shellSingleQuote(key),
      'mkdir -p "$HOME/.codex"',
      'printf "%s" "$XINGREN_API_KEY" > "$HOME/.codex/xingren_api_key"',
      'chmod 600 "$HOME/.codex/xingren_api_key"',
      "",
      "cat > \"$HOME/.codex/config.toml\" <<'EOF'",
      'model = "' + model + '"',
      'model_provider = "xingren"',
      'model_reasoning_effort = "high"',
      "",
      "[model_providers.xingren]",
      'name = "星人 API"',
      'base_url = "' + CONFIG.baseUrl + '"',
      'wire_api = "chat"',
      "",
      "[model_providers.xingren.auth]",
      'command = "/bin/sh"',
      'args = ["-lc", "cat \\"$HOME/.codex/xingren_api_key\\""]',
      "timeout_ms = 5000",
      "refresh_interval_ms = 0",
      "",
      "[profiles.xingren]",
      'model = "' + model + '"',
      'model_provider = "xingren"',
      "EOF",
      "",
      'codex --profile xingren "请只回复：Codex 接入成功"',
    ].join("\n");
  }

  function windowsCodexCommand(model, key) {
    return [
      "$key = " + powershellDoubleQuote(key),
      '$codexDir = Join-Path $HOME ".codex"',
      "New-Item -ItemType Directory -Force -Path $codexDir | Out-Null",
      '$keyPath = Join-Path $codexDir "xingren_api_key"',
      "Set-Content -Path $keyPath -Value $key -NoNewline",
      '$configPath = Join-Path $codexDir "config.toml"',
      '@"',
      'model = "' + model + '"',
      'model_provider = "xingren"',
      'model_reasoning_effort = "high"',
      "",
      "[model_providers.xingren]",
      'name = "星人 API"',
      'base_url = "' + CONFIG.baseUrl + '"',
      'wire_api = "chat"',
      "",
      "[model_providers.xingren.auth]",
      'command = "powershell"',
      'args = ["-NoProfile", "-Command", "Get-Content `$HOME/.codex/xingren_api_key -Raw"]',
      "timeout_ms = 5000",
      "refresh_interval_ms = 0",
      "",
      "[profiles.xingren]",
      'model = "' + model + '"',
      'model_provider = "xingren"',
      '"@ | Set-Content -Path $configPath -Encoding UTF8',
      "",
      'codex --profile xingren "请只回复：Codex 接入成功"',
    ].join("\n");
  }

  function installCodexCommand() {
    return ["node -v", "npm -v", "npm install -g @openai/codex", "codex --version"].join("\n");
  }

  function modelsCheckCommand(key) {
    return [
      "XINGREN_API_KEY=" + shellSingleQuote(key),
      'curl -sS "' + CONFIG.baseUrl + '/models" \\',
      '  -H "Authorization: Bearer $XINGREN_API_KEY"',
    ].join("\n");
  }

  function currentRouteKey() {
    var path = window.location.pathname || "/";
    var best = "";
    Object.keys(SITE_ROUTES).forEach(function (key) {
      var routePath = SITE_ROUTES[key].path;
      if (!routePath) return;
      if (path === routePath || (routePath !== "/" && path.indexOf(routePath) === 0)) {
        if (!best || routePath.length > SITE_ROUTES[best].path.length) best = key;
      }
    });
    return best;
  }

  function collectLabels(selector, limit) {
    return Array.prototype.slice
      .call(document.querySelectorAll(selector))
      .filter(function (node) {
        if (node.closest && node.closest("#xr-api-assistant-root")) return false;
        if (node.disabled || node.getAttribute("aria-hidden") === "true") return false;
        var rect = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
        if (rect && rect.width === 0 && rect.height === 0) return false;
        var style = window.getComputedStyle ? window.getComputedStyle(node) : null;
        return !style || (style.display !== "none" && style.visibility !== "hidden");
      })
      .map(function (node) {
        return normalizeSpaces(
          node.innerText ||
            node.textContent ||
            node.getAttribute("aria-label") ||
            node.getAttribute("placeholder") ||
            node.getAttribute("title") ||
            ""
        );
      })
      .filter(Boolean)
      .filter(function (text, index, arr) {
        return arr.indexOf(text) === index;
      })
      .slice(0, limit);
  }

  function normalizeSpaces(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/sk-[A-Za-z0-9._-]{8,}/g, "sk-***")
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***")
      .trim();
  }

  function visiblePageText() {
    if (!document.body) return "";
    var clone = document.body.cloneNode(true);
    [
      "#xr-api-assistant-root",
      "script",
      "style",
      "noscript",
      "svg",
      "canvas",
      "img",
      "video",
      "audio",
      "[type='password']",
    ].forEach(function (selector) {
      clone.querySelectorAll(selector).forEach(function (node) {
        node.remove();
      });
    });
    clone.querySelectorAll("input,textarea").forEach(function (node) {
      var placeholder = node.getAttribute("placeholder");
      node.value = "";
      if (placeholder) node.setAttribute("aria-label", placeholder);
    });
    return limitText(normalizeSpaces(clone.innerText || clone.textContent || ""), 2600);
  }

  function collectPageContext() {
    var routeKey = currentRouteKey();
    var route = routeKey ? SITE_ROUTES[routeKey] : null;
    return {
      url: window.location.origin + window.location.pathname,
      path: window.location.pathname || "/",
      title: document.title || "",
      route_title: route ? route.title : "",
      route_hint: route ? route.hint : "",
      headings: collectLabels("h1,h2,h3,[role='heading']", 12),
      buttons: collectLabels("button,[role='button'],a", 24),
      fields: collectLabels("label,[aria-label],input[placeholder],textarea[placeholder]", 24),
      visible_text: visiblePageText(),
    };
  }

  function uniqueActions(actions) {
    var seen = {};
    return actions.filter(function (action) {
      if (!action || !action.value || seen[action.value]) return false;
      seen[action.value] = true;
      return true;
    });
  }

  function routeAction(key, label) {
    var route = SITE_ROUTES[key];
    if (!route) return null;
    return { label: label || "带我到" + route.title, value: "route:" + key };
  }

  function detectRoutes(text) {
    var lower = String(text || "").toLowerCase();
    var matched = [];
    Object.keys(SITE_ROUTES).forEach(function (key) {
      var route = SITE_ROUTES[key];
      var aliases = [route.title, route.path].concat(route.aliases || []);
      for (var i = 0; i < aliases.length; i += 1) {
        if (lower.indexOf(String(aliases[i]).toLowerCase()) >= 0) {
          matched.push(key);
          return;
        }
      }
    });
    return matched;
  }

  function wantsCodex(text) {
    var lower = String(text || "").toLowerCase();
    return lower.indexOf("codex") >= 0;
  }

  function wantsCreateKey(text) {
    var lower = String(text || "").toLowerCase();
    return (
      lower.indexOf("创建") >= 0 ||
      lower.indexOf("生成") >= 0 ||
      lower.indexOf("复制") >= 0 ||
      lower.indexOf("自动") >= 0
    ) && (lower.indexOf("key") >= 0 || lower.indexOf("令牌") >= 0 || lower.indexOf("api") >= 0);
  }

  function wantsNavigation(text) {
    var lower = String(text || "").toLowerCase();
    return (
      lower.indexOf("在哪") >= 0 ||
      lower.indexOf("哪里") >= 0 ||
      lower.indexOf("入口") >= 0 ||
      lower.indexOf("跳转") >= 0 ||
      lower.indexOf("带我") >= 0 ||
      lower.indexOf("打开") >= 0 ||
      lower.indexOf("去到") >= 0 ||
      lower.indexOf("去看") >= 0 ||
      lower.indexOf("去 ") >= 0 ||
      lower.indexOf("进入") >= 0
    );
  }

  function routeSummary(keys) {
    return keys
      .map(function (key) {
        var route = SITE_ROUTES[key];
        return route ? route.title + "：" + route.hint : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  function navigateToRoute(key) {
    var route = SITE_ROUTES[key];
    if (!route) return;
    typeAssistant("我现在带你到" + route.title + "。\n\n到页面后你继续问，我会根据当前界面接着指导。", {
      tone: "operation",
    });
    window.setTimeout(function () {
      window.location.assign(route.path);
    }, 320);
  }

  function clickVisibleButton(labels) {
    var safeLabels = labels || ["新建令牌", "添加令牌", "创建令牌", "新增令牌", "新建", "添加"];
    var buttons = Array.prototype.slice.call(
      document.querySelectorAll("button,[role='button'],a")
    );
    for (var i = 0; i < buttons.length; i += 1) {
      var text = String(buttons[i].innerText || buttons[i].textContent || "").trim();
      if (!text) continue;
      for (var j = 0; j < safeLabels.length; j += 1) {
        if (text.indexOf(safeLabels[j]) >= 0) {
          buttons[i].click();
          return true;
        }
      }
    }
    return false;
  }

  function openTokenCreateUI() {
    if (window.location.pathname !== CONFIG.tokenPath) {
      typeAssistant("我先带你到令牌管理页。\n\n如果你要 Codex 接入，我也可以直接替你创建 Key 并生成配置。", {
        actions: [
          { label: "直接自动创建 Codex Key", value: "codex" },
          { label: "进入令牌管理", value: "route:token" },
        ],
      });
      return;
    }
    var clicked = clickVisibleButton();
    typeAssistant(
      clicked
        ? "我已经帮你点开创建令牌入口。\n\n接下来只填写名称、分组和模型权限，不要把完整 Key 发到聊天里。"
        : "我在当前页面没有找到明确的创建按钮。\n\n你可以点“开始自动接入 Codex”，我会通过安全接口直接为当前账号创建 Key。",
      {
        actions: [
          { label: "开始自动接入 Codex", value: "codex" },
          { label: "刷新令牌页", value: "route:token" },
        ],
      }
    );
  }

  function addMessage(role, content, options) {
    var message = {
      id: String(Date.now()) + Math.random().toString(16).slice(2),
      role: role,
      content: role === "user" ? redactSecrets(limitText(content, 1200)) : normalizeAgentText(limitText(content, 3200)),
      actions: (options && options.actions) || [],
      code: (options && options.code) || "",
      tone: (options && options.tone) || "",
    };
    state.messages.push(message);
    renderMessages();
    return message.id;
  }

  function updateMessage(id, patch) {
    for (var i = 0; i < state.messages.length; i += 1) {
      if (state.messages[i].id === id) {
        Object.assign(state.messages[i], patch);
        break;
      }
    }
    renderMessages();
  }

  function typeAssistant(content, options) {
    var full = normalizeAgentText(content);
    var id = addMessage("assistant", "", Object.assign({}, options, { actions: [], code: "" }));
    var index = 0;
    var chunkSize = full.length > 260 ? 6 : 3;
    state.streaming = true;
    state.loading = true;
    renderMessages();

    var timer = window.setInterval(function () {
      index += chunkSize;
      updateMessage(id, { content: full.slice(0, index) });
      if (index >= full.length) {
        window.clearInterval(timer);
        state.streaming = false;
        state.loading = false;
        updateMessage(id, {
          content: full,
          actions: (options && options.actions) || [],
          code: (options && options.code) || "",
          tone: (options && options.tone) || "",
        });
      }
    }, 14);
    return id;
  }

  function visibleHistory() {
    return state.messages
      .filter(function (item) {
        return item.role === "user" || item.role === "assistant";
      })
      .slice(-8)
      .map(function (item) {
        return { role: item.role, content: item.content };
      });
  }

  function resetSession() {
    state.messages = [];
    state.loading = false;
    state.streaming = false;
    state.busyLabel = "";
    state.selectedModel = CONFIG.codexModel;
    state.selectedOS = "mac";
    state.generatedKey = "";
    state.awaitingCustomModel = false;
  }

  function starter() {
    if (state.messages.length) return;
    typeAssistant(
      "我是星人 API 接入老师。\n\n我会常驻在全站右侧。你停在哪个页面，我就先看当前页面内容，再回答这个页面里的按钮、模型、价格、报错和下一步怎么做。\n\n如果你明确说要去某个入口，我会带你过去；如果你要接入 Codex，我可以在你授权后直接创建文本 API Key，并生成可复制粘贴的配置。\n\n默认模型是 " +
        CONFIG.codexModel +
        "，但创建前我会先问你用哪个模型。\n\n安全提醒：结束会话会立即删除本窗口的全部历史记录，删除后无法恢复。",
      {
        actions: [
          { label: "开始自动接入 Codex", value: "codex" },
          routeAction("token", "令牌管理"),
          routeAction("pricing", "模型价格"),
          routeAction("media", "媒体工坊"),
        ],
      }
    );
  }

  function openAssistant() {
    state.open = true;
    document.documentElement.classList.add("xr-api-assistant-open");
    renderShell();
    starter();
  }

  function closeAssistant() {
    resetSession();
    state.open = false;
    document.documentElement.classList.remove("xr-api-assistant-open");
    renderShell();
  }

  function askCodexModel() {
    state.awaitingCustomModel = false;
    typeAssistant("你想让 Codex 使用哪个模型？\n\n我会默认选择 " + CONFIG.codexModel + "，适合代码和复杂任务。", {
      actions: [
        { label: CONFIG.codexModel + " 默认", value: "model:" + CONFIG.codexModel },
        { label: CONFIG.fallbackCodexModel, value: "model:" + CONFIG.fallbackCodexModel },
        { label: "我输入模型名", value: "model-custom" },
      ],
    });
  }

  function askCustomModel() {
    state.awaitingCustomModel = true;
    typeAssistant("直接输入你想用的模型名即可。\n\n例如 " + CONFIG.codexModel + "。我只会接受字母、数字、点、横线和下划线。");
  }

  function chooseModel(model) {
    var safeModel = validModelName(model) || CONFIG.codexModel;
    state.awaitingCustomModel = false;
    state.selectedModel = safeModel;
    addMessage("user", "使用模型 " + safeModel);
    askCodexOS();
  }

  function askCodexOS() {
    typeAssistant("好，我会按 " + state.selectedModel + " 来生成配置。\n\n你准备用哪台电脑运行 Codex？", {
      actions: [
        { label: "Mac / Linux", value: "os:mac" },
        { label: "Windows", value: "os:windows" },
        { label: "返回换模型", value: "codex" },
      ],
    });
  }

  function chooseOS(os) {
    state.selectedOS = os === "windows" ? "windows" : "mac";
    addMessage("user", state.selectedOS === "windows" ? "使用 Windows" : "使用 Mac / Linux");
    confirmCreateToken();
  }

  function confirmCreateToken() {
    typeAssistant(
      "接下来我会替你完成站内操作。\n\n我会为当前登录账号创建一枚新的 Codex 文本 API Key，并把完整 Key 写进一段配置命令里。\n\nKey 只在本窗口显示这一次。结束会话会立即删除历史记录，无法恢复。",
      {
        actions: [
          { label: "授权创建并生成配置", value: "authorize-create" },
          { label: "返回换模型", value: "codex" },
          { label: "打开令牌管理", value: "open-token" },
        ],
      }
    );
  }

  function authorizeAndCreate() {
    if (state.loading) return;
    state.loading = true;
    state.busyLabel = "正在检查登录状态";
    var operationId = addMessage("assistant", "正在检查登录状态\n正在准备创建 Codex API Key", {
      tone: "operation",
    });
    var operationSettled = false;

    window.setTimeout(function () {
      if (!operationSettled) {
        updateMessage(operationId, { content: "已进入授权流程\n正在为当前账号创建 Codex API Key" });
      }
    }, 260);

    createCodexToken(state.selectedModel)
      .then(function (payload) {
        operationSettled = true;
        state.generatedKey = payload.key;
        var model = validModelName(payload.model) || state.selectedModel || CONFIG.codexModel;
        state.selectedModel = model;
        updateMessage(operationId, {
          content: "API Key 已创建\n正在生成 Codex 配置\n准备把配置交给你复制",
        });
        window.setTimeout(function () {
          showCodexConfig(state.selectedOS, model, payload.key, payload.token_name || "");
        }, 360);
      })
      .catch(function (error) {
        operationSettled = true;
        updateMessage(operationId, {
          content: error.message || "创建失败，请稍后重试。",
          tone: "error",
          actions: [
            { label: "重新授权", value: "authorize-create" },
            { label: "去登录", value: "login" },
            { label: "打开令牌管理", value: "open-token" },
          ],
        });
      })
      .finally(function () {
        state.loading = false;
        state.busyLabel = "";
        renderMessages();
      });
  }

  function showCodexConfig(os, model, key, tokenName) {
    var command = os === "windows" ? windowsCodexCommand(model, key) : macCodexCommand(model, key);
    var nameLine = tokenName ? "\n\n令牌名称：" + tokenName : "";
    typeAssistant(
      "配置已经生成。\n\n下面这段命令可以直接复制到终端执行。执行完成后，如果 Codex 回复“Codex 接入成功”，说明已经走通。" +
        nameLine +
        "\n\n请现在复制保存。结束会话会清空本窗口历史，完整 Key 不会再次显示。",
      {
        code: command,
        actions: [
          { label: "检查模型列表", value: "models-check" },
          { label: "打开令牌管理", value: "open-token" },
          { label: "结束会话", value: "end-session" },
        ],
      }
    );
  }

  function showInstall() {
    typeAssistant("如果终端提示 codex: command not found，先执行这段安装命令。", {
      code: installCodexCommand(),
      actions: [{ label: "开始自动接入 Codex", value: "codex" }],
    });
  }

  function showModelsCheck() {
    if (!state.generatedKey) {
      typeAssistant("我还没有为本次会话创建 API Key。\n\n先授权创建，然后我会给你一段带 Key 的检查命令，不需要你手动输入。", {
        actions: [{ label: "开始自动接入 Codex", value: "codex" }],
      });
      return;
    }
    typeAssistant("这是模型列表检查命令。\n\n它只验证 Key 和 Base URL，不会生成内容。", {
      code: modelsCheckCommand(state.generatedKey),
      actions: [
        { label: "401 怎么办", value: "err-401" },
        { label: "403 怎么办", value: "err-403" },
        { label: "结束会话", value: "end-session" },
      ],
    });
  }

  function showDiagnosisPrompt() {
    typeAssistant("把错误类型或报错文本发给我即可。\n\n请删掉完整 API Key、Authorization header、手机号、邮箱等敏感信息。", {
      actions: [
        { label: "401", value: "err-401" },
        { label: "403", value: "err-403" },
        { label: "timeout", value: "err-timeout" },
      ],
    });
  }

  function cannedError(type) {
    var messages = {
      "err-401": "401 通常表示 Key 没传对、复制多了空格、令牌被禁用，或者客户端没有正确发送 Authorization。\n\n先重新生成配置，再跑模型列表检查。",
      "err-403": "403 通常表示 Key 可用，但这个令牌没有访问该模型，或者余额和分组权限不够。\n\n你可以换一个模型重新创建 Key，默认建议先用 " + CONFIG.codexModel + "。",
      "err-timeout": "timeout 先查 Base URL 和网络。\n\n通用 API 客户端使用 " + CONFIG.baseUrl + "。\nClaude Code 专用地址才是 " + CONFIG.claudeBaseUrl + "。",
    };
    typeAssistant(messages[type] || messages["err-401"], {
      actions: [
        { label: "自动接入 Codex", value: "codex" },
        { label: "检查模型列表", value: "models-check" },
      ],
    });
  }

  function showRouteHelp(keys, originalText) {
    var routeKeys = keys.length ? keys : ["token", "pricing", "media", "wallet", "docs"];
    var actions = routeKeys.slice(0, 4).map(function (key) {
      return routeAction(key);
    });
    if (wantsCodex(originalText)) actions.unshift({ label: "开始自动接入 Codex", value: "codex" });
    if (wantsCreateKey(originalText)) actions.unshift({ label: "自动创建 Codex Key", value: "codex" });
    typeAssistant(
      "我先帮你定位入口。\n\n" +
        routeSummary(routeKeys.slice(0, 5)) +
        "\n\n你点下面的按钮，我会直接带你到对应页面。",
      { actions: uniqueActions(actions).slice(0, 5) }
    );
  }

  function tryHandleLocalIntent(value) {
    var routes = detectRoutes(value);
    if (wantsCodex(value)) {
      askCodexModel();
      return true;
    }
    if (wantsCreateKey(value)) {
      typeAssistant("你要的是创建 API Key。\n\n我可以走两种方式：直接为 Codex 创建可复制配置，或者带你到令牌管理页手动创建。", {
        actions: [
          { label: "自动创建 Codex Key", value: "codex" },
          { label: "打开令牌管理", value: "route:token" },
          { label: "点开创建令牌", value: "operate:token-create" },
        ],
      });
      return true;
    }
    if (routes.length && wantsNavigation(value)) {
      showRouteHelp(routes, value);
      return true;
    }
    return false;
  }

  function submitUserInput(text) {
    var value = redactSecrets(String(text || "").trim());
    if (!value || state.loading) return;
    addMessage("user", value);
    if (state.awaitingCustomModel) {
      var model = validModelName(value);
      if (!model) {
        typeAssistant("这个模型名不太像有效标识。\n\n请只输入字母、数字、点、横线和下划线。默认可以用 " + CONFIG.codexModel + "。", {
          actions: [{ label: CONFIG.codexModel + " 默认", value: "model:" + CONFIG.codexModel }],
        });
        return;
      }
      chooseModel(model);
      return;
    }
    if (tryHandleLocalIntent(value)) return;
    askOnline(value);
  }

  function askOnline(value) {
    state.loading = true;
    state.busyLabel = "正在思考";
    renderMessages();
    fetch(CONFIG.chatEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        message: value,
        history: visibleHistory(),
        context: collectPageContext(),
      }),
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (payload) {
            if (!res.ok || payload.success === false) {
              throw new Error(payload.message || "在线接入老师暂时不可用");
            }
            return payload;
          });
      })
      .then(function (payload) {
        typeAssistant(payload.reply || "我没有拿到有效回复。你可以换一种说法，或者直接点自动接入 Codex。", {
          actions: smartActions(payload.reply || value),
        });
      })
      .catch(function (error) {
        typeAssistant(error.message || "在线接入老师暂时没有连上模型。你仍然可以走自动接入流程。", {
          actions: [
            { label: "自动接入 Codex", value: "codex" },
            { label: "检查模型列表", value: "models-check" },
          ],
        });
      })
      .finally(function () {
        state.loading = false;
        state.busyLabel = "";
        renderMessages();
      });
  }

  function smartActions(text) {
    var lower = String(text || "").toLowerCase();
    var actions = [];
    if (wantsNavigation(text)) {
      actions = detectRoutes(text).map(function (key) {
        return routeAction(key);
      });
    }
    if (lower.indexOf("codex") >= 0 || lower.indexOf("配置") >= 0 || lower.indexOf("api key") >= 0) {
      actions.push({ label: "自动接入 Codex", value: "codex" });
    }
    if (lower.indexOf("401") >= 0 || lower.indexOf("403") >= 0 || lower.indexOf("timeout") >= 0) {
      actions.push({ label: "检查模型列表", value: "models-check" });
    }
    if (wantsNavigation(text) && (lower.indexOf("key") >= 0 || lower.indexOf("令牌") >= 0 || lower.indexOf("api") >= 0)) {
      actions.push({ label: "打开令牌管理", value: "route:token" });
    }
    if (wantsNavigation(text) && (lower.indexOf("价格") >= 0 || lower.indexOf("扣费") >= 0 || lower.indexOf("余额") >= 0)) {
      actions.push({ label: "模型价格", value: "route:pricing" });
    }
    return uniqueActions(actions).slice(0, 4);
  }

  function handleAction(value) {
    if (state.loading && value !== "end-session") return;
    if (value === "codex") return askCodexModel();
    if (value.indexOf("model:") === 0) return chooseModel(value.slice("model:".length));
    if (value === "model-custom") return askCustomModel();
    if (value === "os:mac") return chooseOS("mac");
    if (value === "os:windows") return chooseOS("windows");
    if (value === "authorize-create") return authorizeAndCreate();
    if (value === "install-codex") return showInstall();
    if (value === "diagnose") return showDiagnosisPrompt();
    if (value === "models-check") return showModelsCheck();
    if (value === "err-401" || value === "err-403" || value === "err-timeout") return cannedError(value);
    if (value.indexOf("route:") === 0) return navigateToRoute(value.slice("route:".length));
    if (value === "operate:token-create") return openTokenCreateUI();
    if (value === "open-token") return navigateToRoute("token");
    if (value === "login") return window.location.assign(CONFIG.loginPath);
    if (value === "end-session") return closeAssistant();
  }

  function copyText(text, button) {
    navigator.clipboard
      .writeText(text)
      .then(function () {
        if (!button) return;
        var previous = button.textContent;
        button.textContent = "已复制";
        window.setTimeout(function () {
          button.textContent = previous;
        }, 1400);
      })
      .catch(function () {
        typeAssistant("浏览器没有允许自动复制。\n\n请手动选中代码块复制。");
      });
  }

  function renderText(content) {
    return escapeHTML(normalizeAgentText(content)).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
  }

  function renderMessages() {
    var list = document.querySelector(".xr-api-assistant-messages");
    if (!list) return;
    list.innerHTML = state.messages
      .map(function (message) {
        var actions = "";
        if (message.actions && message.actions.length) {
          actions =
            '<div class="xr-api-assistant-actions">' +
            message.actions
              .map(function (action) {
                return (
                  '<button type="button" data-xr-action="' +
                  escapeHTML(action.value) +
                  '">' +
                  escapeHTML(action.label) +
                  "</button>"
                );
              })
              .join("") +
            "</div>";
        }
        var code = "";
        if (message.code) {
          code =
            '<div class="xr-api-assistant-code"><button type="button" data-xr-copy="' +
            escapeHTML(encodeURIComponent(message.code)) +
            '">复制配置</button><pre>' +
            escapeHTML(message.code) +
            "</pre></div>";
        }
        return (
          '<section class="xr-api-assistant-message xr-api-assistant-message-' +
          escapeHTML(message.role) +
          (message.tone ? " xr-api-assistant-tone-" + escapeHTML(message.tone) : "") +
          '">' +
          '<div class="xr-api-assistant-bubble"><p>' +
          renderText(message.content) +
          "</p>" +
          code +
          actions +
          "</div></section>"
        );
      })
      .join("");
    if (state.loading && !state.streaming) {
      list.insertAdjacentHTML(
        "beforeend",
        '<section class="xr-api-assistant-message xr-api-assistant-message-assistant"><div class="xr-api-assistant-bubble xr-api-assistant-typing"><strong>' +
          escapeHTML(state.busyLabel || "正在处理") +
          '</strong><span></span><span></span><span></span></div></section>'
      );
    }
    list.querySelectorAll("[data-xr-action]").forEach(function (button) {
      button.addEventListener("click", function () {
        handleAction(button.getAttribute("data-xr-action") || "");
      });
    });
    list.querySelectorAll("[data-xr-copy]").forEach(function (button) {
      button.addEventListener("click", function () {
        copyText(decodeURIComponent(button.getAttribute("data-xr-copy") || ""), button);
      });
    });
    list.scrollTop = list.scrollHeight;
  }

  function renderShell() {
    var root = document.getElementById("xr-api-assistant-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "xr-api-assistant-root";
      document.body.appendChild(root);
    }
    root.innerHTML =
      '<button type="button" class="xr-api-assistant-launcher" aria-label="打开星人 API 接入老师">' +
      '<span class="xr-api-assistant-launcher-icon">AI</span><span class="xr-api-assistant-launcher-copy"><strong>全站接入老师</strong><small>找入口 / 创建 Key</small></span>' +
      "</button>" +
      (state.open
        ? '<aside class="xr-api-assistant-panel" role="dialog" aria-label="星人 API 接入老师">' +
          '<header><div class="xr-api-assistant-title"><span class="xr-api-assistant-avatar">AI</span><div><strong>星人 API 全站接入老师</strong><span>读当前页、答疑、授权后自动创建 Key</span></div></div><button type="button" class="xr-api-assistant-close" aria-label="结束会话并清空历史">×</button></header>' +
          '<div class="xr-api-assistant-statusbar"><span>全站可见</span><span>读当前页</span><span>授权后操作</span><span>结束即清空</span></div>' +
          '<div class="xr-api-assistant-messages" aria-live="polite"></div>' +
          '<form class="xr-api-assistant-form"><input aria-label="输入接入需求" placeholder="问当前页面、入口、价格、报错，或说：我要将 API 接入 Codex" autocomplete="off" maxlength="900" /><button type="submit">发送</button></form>' +
          "</aside>"
        : "");
    root.querySelector(".xr-api-assistant-launcher").addEventListener("click", openAssistant);
    var closeButton = root.querySelector(".xr-api-assistant-close");
    if (closeButton) closeButton.addEventListener("click", closeAssistant);
    var form = root.querySelector(".xr-api-assistant-form");
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var input = form.querySelector("input");
        var value = input ? input.value : "";
        if (input) input.value = "";
        submitUserInput(value);
      });
    }
    renderMessages();
  }

  function injectStyles() {
    if (document.getElementById("xr-api-assistant-style")) return;
    var style = document.createElement("style");
    style.id = "xr-api-assistant-style";
    style.textContent =
      "#xr-api-assistant-root{position:fixed;right:14px;top:50%;transform:translateY(-50%);z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#162033;letter-spacing:0}" +
      ".xr-api-assistant-launcher{display:grid;place-items:center;border:1px solid rgba(20,184,166,.22);border-radius:12px;background:linear-gradient(135deg,#ffffff,#eefdf8);color:#10212f;padding:7px;box-shadow:0 12px 36px rgba(15,23,42,.18);cursor:pointer;width:52px;height:52px;text-align:center;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}" +
      ".xr-api-assistant-launcher:hover{transform:translateX(-2px);border-color:rgba(15,118,110,.4);box-shadow:0 16px 48px rgba(15,23,42,.24)}" +
      ".xr-api-assistant-launcher-icon,.xr-api-assistant-avatar{display:grid;place-items:center;width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#0f766e,#155e75);color:white;font-weight:850;font-size:12px;letter-spacing:0}" +
      ".xr-api-assistant-launcher-copy{display:none}" +
      ".xr-api-assistant-open .xr-api-assistant-launcher{display:none}" +
      ".xr-api-assistant-panel{position:fixed;right:76px;top:50%;transform:translateY(-50%);width:min(500px,calc(100vw - 104px));height:min(730px,calc(100vh - 48px));background:#ffffff;border:1px solid rgba(15,23,42,.14);border-radius:16px;box-shadow:0 30px 92px rgba(15,23,42,.3);display:flex;flex-direction:column;overflow:hidden}" +
      ".xr-api-assistant-panel header{display:flex;align-items:center;justify-content:space-between;padding:15px 16px;border-bottom:1px solid #e5e7eb;background:linear-gradient(135deg,#fbfcfe,#f0fdfa)}" +
      ".xr-api-assistant-title{display:flex;align-items:center;gap:11px;min-width:0}.xr-api-assistant-title strong{display:block;font-size:15px;line-height:1.2}.xr-api-assistant-title span:last-child{display:block;margin-top:3px;font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".xr-api-assistant-close{display:grid;place-items:center;width:32px;height:32px;border:1px solid #e2e8f0;border-radius:9px;background:#ffffff;color:#0f172a;font-size:22px;line-height:1;cursor:pointer}.xr-api-assistant-close:focus-visible,.xr-api-assistant-launcher:focus-visible,.xr-api-assistant-actions button:focus-visible,.xr-api-assistant-form button:focus-visible,.xr-api-assistant-code button:focus-visible{outline:3px solid rgba(15,118,110,.28);outline-offset:2px}" +
      ".xr-api-assistant-statusbar{display:flex;gap:7px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid #eef2f7;background:#f8fafc}.xr-api-assistant-statusbar span{font-size:11px;color:#334155;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:5px 8px}" +
      ".xr-api-assistant-messages{flex:1;overflow:auto;padding:15px;background:linear-gradient(180deg,#f6f8fb,#eef7f4)}" +
      ".xr-api-assistant-message{display:flex;margin:0 0 12px}.xr-api-assistant-message-user{justify-content:flex-end}.xr-api-assistant-bubble{max-width:94%;border:1px solid #e2e8f0;border-radius:13px;background:#ffffff;padding:11px 12px;box-shadow:0 4px 16px rgba(15,23,42,.04);font-size:13px;line-height:1.62}.xr-api-assistant-message-user .xr-api-assistant-bubble{background:#122033;color:#f8fafc;border-color:#122033}.xr-api-assistant-tone-operation .xr-api-assistant-bubble{border-color:#99f6e4;background:#ecfeff}.xr-api-assistant-tone-error .xr-api-assistant-bubble{border-color:#fecaca;background:#fff7f7;color:#7f1d1d}" +
      ".xr-api-assistant-bubble p{margin:0;white-space:normal}.xr-api-assistant-bubble p:empty{display:none}" +
      ".xr-api-assistant-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:11px}.xr-api-assistant-actions button,.xr-api-assistant-form button{border:0;border-radius:10px;background:#0f766e;color:white;padding:8px 10px;font-size:12px;font-weight:750;cursor:pointer;white-space:normal;text-align:center;line-height:1.25}.xr-api-assistant-actions button:nth-child(2n){background:#334155}.xr-api-assistant-actions button:nth-child(3n){background:#155e75}.xr-api-assistant-actions button:nth-child(4n){background:#7c2d12}.xr-api-assistant-actions button:hover,.xr-api-assistant-form button:hover{filter:brightness(.96)}" +
      ".xr-api-assistant-code{position:relative;margin:11px 0 2px;background:#101828;border-radius:12px;color:#e2e8f0;overflow:hidden;border:1px solid rgba(255,255,255,.08)}.xr-api-assistant-code button{position:absolute;right:8px;top:8px;border:0;border-radius:8px;background:#22c55e;color:#062814;padding:6px 9px;font-size:12px;font-weight:800;cursor:pointer}.xr-api-assistant-code pre{margin:0;padding:44px 12px 12px;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.54}" +
      ".xr-api-assistant-form{display:grid;grid-template-columns:1fr auto;gap:9px;padding:12px;border-top:1px solid #e5e7eb;background:white}.xr-api-assistant-form input{min-width:0;border:1px solid #cbd5e1;border-radius:11px;padding:11px 12px;font-size:13px;outline:none}.xr-api-assistant-form input:focus{border-color:#0f766e;box-shadow:0 0 0 3px rgba(15,118,110,.14)}.xr-api-assistant-form button{padding:0 14px}" +
      ".xr-api-assistant-typing{display:flex;gap:6px;align-items:center;width:auto}.xr-api-assistant-typing strong{font-size:12px;color:#475569;margin-right:2px}.xr-api-assistant-typing span{width:6px;height:6px;border-radius:50%;background:#64748b;animation:xrApiTyping 1s infinite ease-in-out}.xr-api-assistant-typing span:nth-child(2){animation-delay:.15s}.xr-api-assistant-typing span:nth-child(3){animation-delay:.3s}@keyframes xrApiTyping{0%,80%,100%{opacity:.35;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}" +
      "@media (max-width:640px){#xr-api-assistant-root{right:10px;top:auto;bottom:76px;transform:none}.xr-api-assistant-launcher{width:48px;height:48px;padding:6px}.xr-api-assistant-launcher-icon{width:36px;height:36px}.xr-api-assistant-panel{left:0;right:0;top:auto;bottom:0;transform:none;width:100%;height:min(75vh,660px);border-radius:16px 16px 0 0}.xr-api-assistant-title span:last-child{max-width:200px}.xr-api-assistant-actions button{flex:1 1 calc(50% - 8px)}}";
    document.head.appendChild(style);
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && state.open) closeAssistant();
  });

  function init() {
    if (!document.body) return;
    injectStyles();
    renderShell();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
