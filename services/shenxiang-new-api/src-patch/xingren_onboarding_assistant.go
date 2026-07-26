package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	xingrenAssistantTokenName           = "星人在线接入老师令牌"
	xingrenAssistantMaxBody             = 32 * 1024
	xingrenAssistantMaxChatBody         = 5 * 1024 * 1024
	xingrenAssistantMaxInput            = 900
	xingrenAssistantMaxReply            = 1800
	xingrenAssistantMaxCtx              = 2600
	xingrenAssistantMaxScreenshotBytes  = 3 * 1024 * 1024
	xingrenAssistantRateMax             = 8
	xingrenCodexDefaultModel            = "gpt-5.5"
	xingrenCodexImage15KModel           = "image 2电商商品图快速通道(1.5K)"
	xingrenAssistantFallback            = xingrenCodexDefaultModel
	xingrenAssistantSafeFailureMessage  = "当前服务暂时无法完成这次操作，请使用下方固定操作继续或稍后重试。"
	xingrenAssistantSafeOnlineReply     = "为保护你的账号信息，这次在线回答已切换为安全提示。请使用下方固定操作继续，或稍后再试。"
	xingrenAssistantSafeScreenshotReply = "截图已收到，但暂时无法安全解析。请不要发送密钥或完整报错；请使用下方固定操作继续，或稍后重试。"
)

var (
	xingrenAssistantTokenMu sync.Mutex
	xingrenAssistantRateMu  sync.Mutex
	xingrenAssistantHits    = map[string][]time.Time{}
	xingrenAssistantSecrets = []*regexp.Regexp{
		regexp.MustCompile(`(?i)sk-[A-Za-z0-9._\-]{8,}`),
		regexp.MustCompile(`(?i)(Bearer[\s\t]+)[A-Za-z0-9._\-]{8,}`),
		regexp.MustCompile(`(?i)(Authorization[\s\t]*:[\s\t]*)[A-Za-z0-9._\- ]{8,}`),
	}
	// xingrenAssistantHTTPClient has an explicit timeout so context cancellation
	// is honoured even when the underlying transport stalls.
	xingrenAssistantHTTPClient = &http.Client{
		Timeout: 120 * time.Second,
	}
	xingrenCodexAllowedTextModels = map[string]bool{
		"gpt-5.5":      true,
		"gpt-5.4":      true,
		"gpt-5.4-mini": true,
	}
)

func init() {
	// Periodic cleanup so xingrenAssistantHits cannot grow without bound even
	// when the on-request cleanup threshold (2000 keys) is not reached.
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			window := 5 * time.Minute
			cutoff := time.Now().Add(-window)
			xingrenAssistantRateMu.Lock()
			for key, hits := range xingrenAssistantHits {
				kept := hits[:0]
				for _, h := range hits {
					if h.After(cutoff) {
						kept = append(kept, h)
					}
				}
				if len(kept) == 0 {
					delete(xingrenAssistantHits, key)
				} else {
					xingrenAssistantHits[key] = kept
				}
			}
			xingrenAssistantRateMu.Unlock()
		}
	}()
}

type xingrenAssistantMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type xingrenAssistantChatRequest struct {
	Message    string                       `json:"message"`
	History    []xingrenAssistantMessage    `json:"history"`
	Context    *xingrenAssistantPageContext `json:"context,omitempty"`
	Screenshot *xingrenAssistantScreenshot  `json:"screenshot,omitempty"`
}

type xingrenAssistantIntentRequest struct {
	Message string                       `json:"message"`
	Context *xingrenAssistantPageContext `json:"context,omitempty"`
}

type xingrenAssistantScreenshot struct {
	DataURL string `json:"data_url"`
	Name    string `json:"name,omitempty"`
	Mime    string `json:"mime,omitempty"`
	Bytes   int    `json:"bytes,omitempty"`
}

type xingrenAssistantPageContext struct {
	Route string `json:"route,omitempty"`
}

type xingrenAssistantChatResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
	Reply   string `json:"reply,omitempty"`
}

type xingrenAssistantIntentResponse struct {
	Success           bool    `json:"success"`
	Message           string  `json:"message,omitempty"`
	Intent            string  `json:"intent,omitempty"`
	Confidence        float64 `json:"confidence,omitempty"`
	Target            string  `json:"target,omitempty"`
	Route             string  `json:"route,omitempty"`
	MediaFocused      bool    `json:"media_focused,omitempty"`
	NeedsConfirmation bool    `json:"needs_confirmation,omitempty"`
	Source            string  `json:"source,omitempty"`
}

type xingrenCodexTokenRequest struct {
	Model string `json:"model"`
}

type xingrenCodexTokenResponse struct {
	Success   bool   `json:"success"`
	Message   string `json:"message,omitempty"`
	Key       string `json:"key,omitempty"`
	TokenID   int    `json:"token_id,omitempty"`
	TokenName string `json:"token_name,omitempty"`
	Model     string `json:"model,omitempty"`
	BaseURL   string `json:"base_url,omitempty"`
}

type xingrenOpenAIChatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func RegisterXingrenOnboardingAssistant(server *gin.Engine) {
	if strings.EqualFold(os.Getenv("XINGREN_API_ONBOARDING_ASSISTANT"), "false") {
		return
	}
	server.POST("/api/xingren-onboarding-assistant/chat", middleware.RouteTag("api"), xingrenOnboardingAssistantChat)
	server.POST("/api/xingren-onboarding-assistant/intent", middleware.RouteTag("api"), xingrenOnboardingAssistantIntent)
	server.POST("/api/xingren-onboarding-assistant/codex-token", middleware.RouteTag("api"), middleware.UserAuth(), middleware.CriticalRateLimit(), middleware.DisableCache(), xingrenOnboardingAssistantCreateCodexToken)
}

func xingrenOnboardingAssistantChat(c *gin.Context) {
	clientKey := xingrenAssistantClientKey(c)
	if !xingrenAssistantAllow(clientKey) {
		c.JSON(http.StatusTooManyRequests, xingrenAssistantChatResponse{
			Success: false,
			Message: "请求太频繁了，请稍后再试。",
		})
		return
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, xingrenAssistantMaxChatBody)
	var req xingrenAssistantChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, xingrenAssistantChatResponse{
			Success: false,
			Message: "没有读到有效的问题，请重新输入。",
		})
		return
	}

	message := strings.TrimSpace(req.Message)
	screenshot, err := xingrenAssistantValidateScreenshot(req.Screenshot)
	if err != nil {
		c.JSON(http.StatusBadRequest, xingrenAssistantChatResponse{
			Success: false,
			Message: xingrenAssistantSafeFailureMessage,
		})
		return
	}
	if message == "" && screenshot == nil {
		c.JSON(http.StatusBadRequest, xingrenAssistantChatResponse{
			Success: false,
			Message: "请先输入你想接入的工具或遇到的报错。",
		})
		return
	}
	message = xingrenAssistantLimitText(xingrenAssistantRedact(message), xingrenAssistantMaxInput)
	if message == "" && screenshot != nil {
		message = "请识别这张报错截图，并给出下一步修复操作。"
	}

	if reply := xingrenAssistantKnowledgeReply(message, req.Context, screenshot); reply != "" {
		c.JSON(http.StatusOK, xingrenAssistantChatResponse{
			Success: true,
			Reply:   xingrenAssistantLimitText(reply, xingrenAssistantMaxReply),
		})
		return
	}

	reply, err := xingrenAssistantCallModel(c.Request.Context(), message, req.History, req.Context, screenshot)
	if err != nil {
		common.SysError("xingren onboarding assistant failed: " + xingrenAssistantRedact(err.Error()))
		if screenshot != nil {
			c.JSON(http.StatusOK, xingrenAssistantChatResponse{
				Success: true,
				Reply:   xingrenAssistantScreenshotFallbackReply(message),
			})
			return
		}
		c.JSON(http.StatusBadGateway, xingrenAssistantChatResponse{
			Success: false,
			Message: xingrenAssistantSafeFailureMessage,
		})
		return
	}

	c.JSON(http.StatusOK, xingrenAssistantChatResponse{
		Success: true,
		Reply:   xingrenAssistantPublicModelReply(reply),
	})
}

func xingrenAssistantCallModel(ctx context.Context, message string, history []xingrenAssistantMessage, pageContext *xingrenAssistantPageContext, screenshot *xingrenAssistantScreenshot) (string, error) {
	messages := []map[string]any{
		{
			"role":    "system",
			"content": xingrenAssistantSystemPrompt(),
		},
	}

	if contextPrompt := xingrenAssistantContextPrompt(pageContext); contextPrompt != "" {
		messages = append(messages, map[string]any{
			"role":    "system",
			"content": contextPrompt,
		})
	}

	for _, item := range xingrenAssistantTrimHistory(history) {
		messages = append(messages, map[string]any{
			"role":    item.Role,
			"content": item.Content,
		})
	}
	messages = append(messages, xingrenAssistantUserMessage(message, screenshot))

	payload := map[string]any{
		"model":      xingrenAssistantModel(),
		"messages":   messages,
		"max_tokens": 700,
		"stream":     false,
	}

	timeout := 35 * time.Second
	if screenshot != nil {
		timeout = 80 * time.Second
	}
	return xingrenAssistantPostChatCompletion(ctx, payload, timeout)
}

func xingrenOnboardingAssistantIntent(c *gin.Context) {
	clientKey := xingrenAssistantClientKey(c) + ":intent"
	if !xingrenAssistantAllow(clientKey) {
		c.JSON(http.StatusTooManyRequests, xingrenAssistantIntentResponse{
			Success: false,
			Message: "请求太频繁了，请稍后再试。",
		})
		return
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, xingrenAssistantMaxBody)
	var req xingrenAssistantIntentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, xingrenAssistantIntentResponse{
			Success: false,
			Message: "没有读到有效的问题，请重新输入。",
		})
		return
	}
	message := xingrenAssistantLimitText(xingrenAssistantRedact(strings.TrimSpace(req.Message)), xingrenAssistantMaxInput)
	if message == "" {
		c.JSON(http.StatusBadRequest, xingrenAssistantIntentResponse{
			Success: false,
			Message: "请先输入你想做什么。",
		})
		return
	}

	intent, err := xingrenAssistantClassifyIntent(c.Request.Context(), message, req.Context)
	if err != nil {
		common.SysError("xingren onboarding assistant intent failed: " + xingrenAssistantRedact(err.Error()))
		c.JSON(http.StatusBadGateway, xingrenAssistantIntentResponse{
			Success: false,
			Message: "暂时没有判断出明确意图。",
		})
		return
	}
	intent.Success = true
	intent.Source = ""
	c.JSON(http.StatusOK, intent)
}

func xingrenAssistantClassifyIntent(ctx context.Context, message string, pageContext *xingrenAssistantPageContext) (xingrenAssistantIntentResponse, error) {
	contextPrompt := xingrenAssistantContextPrompt(pageContext)
	messages := []map[string]any{
		{
			"role": "system",
			"content": strings.Join([]string{
				"你只做 AIPHUI 站内助手的意图分类，不直接回答用户问题。",
				"必须只输出一个 JSON 对象，不能输出 Markdown、解释、推理过程或代码块。",
				"intent 只能取以下值之一：site.usage_log、site.media_image、site.route、site.page_operation、site.create_key、codex.onboarding、codex.diagnosis、guidance.online。",
				"route 只能取以下值之一或空字符串：home、dashboard、token、playground、media、pricing、wallet、docs、service、logs、codexCloud。",
				"如果用户问图像生成日志、图片生成记录、最近任务、下载日志、用量、扣费、消耗，优先判为 site.usage_log，media_focused=true。",
				"如果用户要求生成图片、操作媒体工坊、填写图片提示词，判为 site.media_image。",
				"如果用户要打开价格、令牌、文档、钱包、日志、媒体工坊等页面，判为 site.route 并填写 route。",
				"只有用户明确要把 Codex、Codex CLI、Codex 桌面 App 接入 AIPHUI，或排查 config.toml、AIPHUI_API_KEY、wire_api、base_url、Working 时，才判为 codex.onboarding 或 codex.diagnosis。",
				"创建 Key、提交生成、删除、充值、支付、重置等可能影响账号或额度的动作 needs_confirmation=true。",
				"置信度不足 0.72 时用 guidance.online。",
				"JSON 字段固定为：intent、confidence、target、route、media_focused、needs_confirmation。",
			}, "\n"),
		},
	}
	if contextPrompt != "" {
		messages = append(messages, map[string]any{
			"role":    "system",
			"content": contextPrompt,
		})
	}
	messages = append(messages, map[string]any{
		"role":    "user",
		"content": message,
	})
	payload := map[string]any{
		"model":      xingrenAssistantModel(),
		"messages":   messages,
		"max_tokens": 220,
		"stream":     false,
	}
	reply, err := xingrenAssistantPostChatCompletion(ctx, payload, 18*time.Second)
	if err != nil {
		return xingrenAssistantIntentResponse{}, err
	}
	return xingrenAssistantParseIntentReply(reply)
}

func xingrenAssistantParseIntentReply(reply string) (xingrenAssistantIntentResponse, error) {
	reply = strings.TrimSpace(reply)
	start := strings.Index(reply, "{")
	end := strings.LastIndex(reply, "}")
	if start < 0 || end < start {
		return xingrenAssistantIntentResponse{}, errors.New("intent response is not json")
	}
	var parsed xingrenAssistantIntentResponse
	if err := json.Unmarshal([]byte(reply[start:end+1]), &parsed); err != nil {
		return xingrenAssistantIntentResponse{}, err
	}
	parsed.Intent = strings.TrimSpace(parsed.Intent)
	parsed.Route = strings.TrimSpace(parsed.Route)
	parsed.Target = ""
	if parsed.Confidence < 0 || parsed.Confidence > 1 {
		parsed.Confidence = 0
	}
	if !xingrenAssistantKnownIntent(parsed.Intent) {
		parsed.Intent = "guidance.online"
		parsed.Confidence = 0
	}
	if !xingrenAssistantKnownRoute(parsed.Route) {
		parsed.Route = ""
	}
	return parsed, nil
}

func xingrenAssistantKnownIntent(intent string) bool {
	switch intent {
	case "site.usage_log", "site.media_image", "site.route", "site.page_operation", "site.create_key", "codex.onboarding", "codex.diagnosis", "guidance.online":
		return true
	default:
		return false
	}
}

func xingrenAssistantKnownRoute(route string) bool {
	if route == "" {
		return true
	}
	switch route {
	case "home", "dashboard", "token", "playground", "media", "pricing", "wallet", "docs", "service", "logs", "codexCloud":
		return true
	default:
		return false
	}
}

func xingrenAssistantPostChatCompletion(ctx context.Context, payload map[string]any, timeout time.Duration) (string, error) {
	token, err := xingrenAssistantToken(ctx)
	if err != nil {
		return "", err
	}
	rawPayload, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	callCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	httpReq, err := http.NewRequestWithContext(callCtx, http.MethodPost, xingrenAssistantChatURL(), bytes.NewReader(rawPayload))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+xingrenAssistantBearerKey(token.Key))
	httpReq.Header.Set("User-Agent", "xingren-api-onboarding-assistant/1.0")

	resp, err := xingrenAssistantHTTPClient.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("model endpoint returned %d: %s", resp.StatusCode, xingrenAssistantLimitText(string(body), 800))
	}

	var openAIResp xingrenOpenAIChatResponse
	if err := json.Unmarshal(body, &openAIResp); err != nil {
		return "", err
	}
	if openAIResp.Error != nil && openAIResp.Error.Message != "" {
		return "", errors.New(openAIResp.Error.Message)
	}
	if len(openAIResp.Choices) == 0 {
		return "", errors.New("model returned empty choices")
	}
	reply := strings.TrimSpace(openAIResp.Choices[0].Message.Content)
	if reply == "" {
		return "", errors.New("model returned empty reply")
	}
	return xingrenAssistantRedact(reply), nil
}

func buildXingrenCodexUserToken(userID int, key string, tokenName string, modelLimits string, tokenGroup string) *model.Token {
	return &model.Token{
		UserId:             userID,
		Key:                key,
		Status:             common.TokenStatusEnabled,
		Name:               tokenName,
		CreatedTime:        common.GetTimestamp(),
		AccessedTime:       common.GetTimestamp(),
		ExpiredTime:        -1,
		RemainQuota:        0,
		UnlimitedQuota:     true,
		ModelLimitsEnabled: true,
		ModelLimits:        modelLimits,
		Group:              service.NormalizePublicTokenGroup(tokenGroup),
		CrossGroupRetry:    false,
	}
}

func xingrenOnboardingAssistantCreateCodexToken(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.Header("Pragma", "no-cache")

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, xingrenAssistantMaxBody)
	var req xingrenCodexTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil && !errors.Is(err, io.EOF) {
		c.JSON(http.StatusBadRequest, xingrenCodexTokenResponse{
			Success: false,
			Message: "没有读到有效的模型配置，请重新授权一次。",
		})
		return
	}

	userID := c.GetInt("id")
	if userID <= 0 {
		c.JSON(http.StatusUnauthorized, xingrenCodexTokenResponse{
			Success: false,
			Message: "请先登录后再让接入老师创建 API Key。",
		})
		return
	}

	tokenGroup := strings.TrimSpace(c.GetString("group"))
	if tokenGroup == "" {
		group, err := model.GetUserGroup(userID, false)
		if err != nil {
			c.JSON(http.StatusInternalServerError, xingrenCodexTokenResponse{
				Success: false,
				Message: "没有读取到当前账号分组，请稍后重试。",
			})
			return
		}
		tokenGroup = strings.TrimSpace(group)
	}
	maxTokens := operation_setting.GetMaxUserTokens()
	count, err := model.CountUserTokens(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, xingrenCodexTokenResponse{
			Success: false,
			Message: "没有读取到当前账号令牌数量，请稍后重试。",
		})
		return
	}
	if int(count) >= maxTokens {
		c.JSON(http.StatusOK, xingrenCodexTokenResponse{
			Success: false,
			Message: fmt.Sprintf("当前账号已达到最大令牌数量限制（%d 枚），请先删除一枚旧令牌后再试。", maxTokens),
		})
		return
	}

	key, err := common.GenerateKey()
	if err != nil {
		c.JSON(http.StatusInternalServerError, xingrenCodexTokenResponse{
			Success: false,
			Message: "API Key 生成失败，请稍后重试。",
		})
		return
	}

	selectedModel := xingrenCodexModel(req.Model)
	modelLimits := xingrenCodexTokenModelLimits(selectedModel)
	tokenName := xingrenCodexTokenName()
	newToken := buildXingrenCodexUserToken(userID, key, tokenName, modelLimits, tokenGroup)
	if err := newToken.Insert(); err != nil {
		c.JSON(http.StatusInternalServerError, xingrenCodexTokenResponse{
			Success: false,
			Message: "API Key 创建失败，请稍后重试。",
		})
		return
	}

	baseURL := strings.TrimSpace(os.Getenv("XINGREN_API_BASE_URL"))
	if baseURL == "" {
		baseURL = "https://api.aiphui.top/v1"
	}
	model.RecordOperationAuditLog(userID, "用户创建 Codex API Key", "", "create_codex_token", map[string]interface{}{
		"token_name": tokenName,
		"token_id":   newToken.Id,
		"model":      selectedModel,
		"models":     modelLimits,
	}, nil, nil)
	c.JSON(http.StatusOK, xingrenCodexTokenResponse{
		Success:   true,
		Key:       xingrenAssistantBearerKey(key),
		TokenID:   newToken.Id,
		TokenName: tokenName,
		Model:     selectedModel,
		BaseURL:   baseURL,
	})
}

func xingrenAssistantToken(ctx context.Context) (*model.Token, error) {
	token, err := xingrenAssistantFindToken(ctx)
	if err == nil {
		return token, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	xingrenAssistantTokenMu.Lock()
	defer xingrenAssistantTokenMu.Unlock()

	token, err = xingrenAssistantFindToken(ctx)
	if err == nil {
		return token, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	var root model.User
	if err := model.DB.WithContext(ctx).
		Where("role = ? AND status = ?", common.RoleRootUser, common.UserStatusEnabled).
		Order("id asc").
		First(&root).Error; err != nil {
		return nil, err
	}
	key, err := common.GenerateKey()
	if err != nil {
		return nil, err
	}
	newToken := &model.Token{
		UserId:             root.Id,
		Key:                key,
		Status:             common.TokenStatusEnabled,
		Name:               xingrenAssistantTokenName,
		CreatedTime:        common.GetTimestamp(),
		AccessedTime:       common.GetTimestamp(),
		ExpiredTime:        -1,
		RemainQuota:        0,
		UnlimitedQuota:     true,
		ModelLimitsEnabled: true,
		ModelLimits:        xingrenAssistantModel(),
		Group:              root.Group,
		CrossGroupRetry:    true,
	}
	if err := newToken.Insert(); err != nil {
		return nil, err
	}
	model.RecordOperationAuditLog(root.Id, "自动创建接入老师令牌", "", "create_assistant_token", map[string]interface{}{
		"token_name": xingrenAssistantTokenName,
		"token_id":   newToken.Id,
	}, nil, nil)
	return newToken, nil
}

func xingrenAssistantFindToken(ctx context.Context) (*model.Token, error) {
	var tokens []model.Token
	err := model.DB.WithContext(ctx).
		Where("name = ? AND status = ?", xingrenAssistantTokenName, common.TokenStatusEnabled).
		Order("id asc").
		Limit(1).
		Find(&tokens).Error
	if err != nil {
		return nil, err
	}
	if len(tokens) == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	token := tokens[0]
	if token.Key == "" {
		return nil, errors.New("assistant token has empty key")
	}
	if token.ModelLimitsEnabled && token.ModelLimits != xingrenAssistantModel() {
		token.ModelLimits = xingrenAssistantModel()
		if err := token.Update(); err != nil {
			return nil, err
		}
	}
	return &token, nil
}

func xingrenAssistantSystemPrompt() string {
	return strings.Join([]string{
		"你是 AIPHUI 的站内 API 接入老师，优先帮助用户完成当前站内操作；只有用户明确提到 Codex、Codex CLI、Codex 桌面 App、config.toml、AIPHUI_API_KEY、wire_api、base_url 或 Working 排障时，才进入 Codex 接入辅导。",
		"如果用户问图像生成日志、图片生成记录、最近任务、下载日志、用量、扣费、消耗、媒体工坊、模型价格、令牌管理、钱包或文档入口，必须按站内助手回答：说明应该打开哪个页面、看哪些列或筛选项，不要强行转成 Codex Key、401、config.toml 排障。",
		"固定配置必须保持：provider id 是 aiphui，provider name 是 AIPHUI，base_url 是 https://api.aiphui.top/v1，env_key 是 AIPHUI_API_KEY，model 是 gpt-5.5，wire_api 是 responses。Windows 默认配置文件是 %USERPROFILE%\\.codex\\config.toml；Mac 终端默认配置文件是 ~/.codex/config.toml。",
		"config.toml 只写 env_key = \"AIPHUI_API_KEY\"，不要把明文 Key 写进 config.toml。Windows 把 API Key 写入 User 级环境变量；Mac 终端把 API Key 写入当前 shell 环境并追加到 ~/.zshrc。用户是零代码新手，所以命令必须一步即可完成；不要打印完整 Key、不要要求用户发送完整 Key，也不要在聊天、截图说明或日志里复述 Key。只检查变量是否已设置，并显示“已写入（已隐藏）”或掩码。",
		"任何用户可见回答都不得透露第三方供应商、转发渠道、内部模型标识、请求编号、原始 HTTP 报错或任何密钥。生成或连接失败时只给通用中文原因和下一步操作。",
		"核心判断：只接 Codex 桌面 App 不一定必须安装 Codex CLI。Codex CLI 只是验证工具。CLI 能回复通常说明 AIPHUI API 大概率没问题；CLI 能回但桌面 App 不回，优先判断 App 没读到默认 config.toml、User 级环境变量、没有完全退出重启、当前目录不适合或 trust/sandbox 问题。",
		"Windows 方案要兼容 PowerShell 5.1。优先生成单行命令；不要用 heredoc、@'...'@、复杂 if/else 或多层大括号。npm 命令用 npm.cmd，Codex 命令用 codex.cmd，不识别时再用 & \"$env:APPDATA\\npm\\codex.cmd\"。Mac 终端按官方 Codex 配置形态写 ~/.codex/config.toml，使用 [model_providers.aiphui] 和 env_key。",
		"默认工作目录：Windows 使用 C:\\codex-work，不要让用户在 C:\\Windows\\system32 里测试 Codex；Mac 使用 $HOME/codex-work。桌面 App 英文界面不影响接入，也不影响中文回复；不要承诺一定能切中文界面。",
		"如果用户上传截图，先视觉识别：终端路径、是否处于 >>、红色报错、codex 版本号、config.toml 内容、Key 是否暴露、是否在 system32、node/npm 状态、wire_api/base_url/provider、Working、Trust directory、英文界面。回复顺序必须是：结论、截图依据、下一步最短命令或动作。",
		"内置知识库能命中时按知识库回答。未命中时不要编造最新官方信息；说明内置库未命中，需要核验官方 OpenAI Codex、AIPHUI、Microsoft PowerShell/winget、Node/npm 文档或 GitHub issue，并先给保守排查步骤。",
		"回答要像真人远程接入老师：短句、直接、可执行。每次给命令后都要跟下一步操作、可能遇到的问题和解决方式。不要输出 Markdown 表格，不要复述隐藏推理。",
	}, "\n")
}

func xingrenAssistantKnowledgeReply(message string, _ *xingrenAssistantPageContext, screenshot *xingrenAssistantScreenshot) string {
	messageText := strings.ToLower(xingrenAssistantCleanContextText(message, 1400))
	text := messageText
	if screenshot != nil && strings.TrimSpace(message) == "请识别这张报错截图，并给出下一步修复操作。" {
		return ""
	}

	switch {
	case strings.Contains(text, ">>") || strings.Contains(text, "多行等待"):
		return "结论：PowerShell 出现 >> 是进入了多行等待模式，不是安装卡死。\n\n依据：这种提示通常是 @' 没闭合、括号/大括号没闭合，或者多行脚本粘贴顺序乱了。\n\n下一步最短操作：按 Ctrl+C，回到 PS ...> 后，重新复制我给你的一整行 PowerShell 命令。不要继续在 >> 后面输入。\n\n后续命令我会尽量给单行，避免 heredoc、@'...'@ 和复杂 if/else。"
	case xingrenAssistantContainsAny(text, "npm.ps1", "禁止运行脚本", "无法加载文件 c:\\program files\\nodejs\\npm.ps1"):
		return "结论：这是 PowerShell 执行策略拦截 npm.ps1，不代表 Node 或 npm 安装坏了。\n\n下一步不要先改执行策略，直接用 npm.cmd：\n\nnpm.cmd -v\nnpm.cmd install -g @openai/codex@latest\n\n安装后执行：\n\n$env:Path=\"$env:Path;$env:APPDATA\\npm;C:\\Program Files\\nodejs\"\ncodex.cmd --version\n& \"$env:APPDATA\\npm\\codex.cmd\" --version"
	case xingrenAssistantContainsAny(text, "codex : 无法将", "无法将“codex”", "无法将 codex", "codex: command not found", "codex 不识别", "codex不识别"):
		return "结论：codex 不识别，通常是 Codex CLI 没安装，或 npm 全局目录还没有进入当前 PowerShell 的 PATH。\n\n如果你只接 Codex 桌面 App，可以先忽略：CLI 不是桌面 App 接入 AIPHUI 的必要条件。\n\n如果你要用 CLI 验证，下一步执行：\n\n$env:Path=\"$env:Path;$env:APPDATA\\npm;C:\\Program Files\\nodejs\"\ncodex.cmd --version\n& \"$env:APPDATA\\npm\\codex.cmd\" --version\n\n如果还是不识别，再执行：\n\nnpm.cmd install -g @openai/codex@latest"
	case xingrenAssistantContainsAny(text, "zsh: command not found: codex", "command not found: codex"):
		return "结论：Mac 终端提示 command not found: codex，说明 Codex CLI 还没安装，或 npm 全局 bin 不在 PATH。\n\n下一步执行：\n\nnode -v\nnpm -v\nnpm install -g @openai/codex@latest\ncodex --version\n\n然后进入工作目录测试：\n\nmkdir -p \"$HOME/codex-work\"\ncd \"$HOME/codex-work\"\ncodex \"只回复 OK\"\n\n如果 node/npm 也不识别，先安装 Node.js LTS。"
	case xingrenAssistantContainsAny(text, "node : 无法将", "npm : 无法将", "无法将“node”", "无法将“npm”", "node 不识别", "npm 不识别"):
		return "结论：Node/npm 不识别，通常是 Node 没安装，或安装后 PATH 没刷新。\n\n下一步先检查：\n\nnode -v\nnpm.cmd -v\n\n如果 C:\\Program Files\\nodejs\\node.exe 已经存在但命令不识别，关闭 PowerShell 重新打开，或执行：\n\n$env:Path=\"$env:Path;C:\\Program Files\\nodejs;$env:APPDATA\\npm\"; node -v; npm.cmd -v\n\n如果文件不存在，安装 Node.js LTS。winget 失败时直接换 MSI 安装包。"
	case xingrenAssistantContainsAny(text, "zsh: command not found: node", "zsh: command not found: npm", "command not found: node", "command not found: npm"):
		return "结论：Mac 终端里 node/npm 不识别，说明 Node.js 没安装，或安装后终端 PATH 没刷新。\n\n下一步：安装 Node.js LTS for macOS。安装完成后完全关闭终端重新打开，再执行：\n\nnode -v\nnpm -v\n\n确认版本号出来后，再执行：\n\nnpm install -g @openai/codex@latest\ncodex --version"
	case xingrenAssistantContainsAny(text, "0x80072efd", "internetopenurl() failed", "internetopenurl failed", "winget install", "winget search", "msstore"):
		return "结论：这是 winget 源或 Microsoft Store 协议/网络问题。winget search 能搜到，不代表 install 一定能成功。\n\n下一步不要反复跑同一条 winget install。更稳方案是下载 Node.js LTS 的 Windows MSI 安装包安装。\n\n安装完成后关闭当前 PowerShell，重新打开，再执行：\n\nnode -v\nnpm.cmd -v\n\n如果 npm.ps1 报执行策略，继续使用 npm.cmd。"
	case xingrenAssistantContainsAny(text, "added 2 packages"):
		return "结论：npm 已经把 Codex CLI 安装成功了。现在不是继续安装，而是找 codex.cmd。\n\n下一步执行：\n\n$env:Path=\"$env:Path;$env:APPDATA\\npm;C:\\Program Files\\nodejs\"\ncodex.cmd --version\n& \"$env:APPDATA\\npm\\codex.cmd\" --version\n\n如果版本号出来了，再进入工作目录测试：\n\nNew-Item -ItemType Directory -Path \"C:\\codex-work\" -Force | Out-Null\ncd C:\\codex-work\ncodex.cmd \"只回复 OK\""
	case xingrenAssistantContainsAny(text, "config/batchwrite failed", "failed to set trust", "get-content", "writealltext", "$configpath", "空路径名", "参数 path", "trust directory"):
		return "结论：这是配置或 trust 写入失败，不是 AIPHUI API 本身失败。常见原因是脚本乱序、$configPath 为空、中文用户目录 trust 写失败，或者在 Codex TUI 里写配置失败。\n\n下一步：不要继续在 TUI 里反复点。手动写 %USERPROFILE%\\.codex\\config.toml，并使用 C:\\codex-work。\n\n配置必须包含：\nmodel = \"gpt-5.5\"\nmodel_provider = \"aiphui\"\n\n[model_providers.aiphui]\nname = \"AIPHUI\"\nbase_url = \"https://api.aiphui.top/v1\"\nenv_key = \"AIPHUI_API_KEY\"\nwire_api = \"responses\"\n\n[projects.\"C:\\\\codex-work\"]\ntrust_level = \"trusted\""
	case xingrenAssistantContainsAny(text, "~/.codex/config.toml", ".zshrc", "$home/codex-work", "mac 终端", "mac终端"):
		return "结论：Mac 终端接入 AIPHUI 时，按官方 Codex 配置形态走：用户级配置写 ~/.codex/config.toml，自定义供应商写 [model_providers.aiphui]，认证用 env_key = \"AIPHUI_API_KEY\"。\n\n下一步要确保三件事：\n1. 不要用 echo 输出 Key；只确认终端显示“ AIPHUI_API_KEY 已读取（已隐藏）”。\n2. ~/.codex/config.toml 里 base_url 是 https://api.aiphui.top/v1，wire_api 是 responses。\n3. 在 $HOME/codex-work 里运行 codex \"只回复 OK\"。\n\n如果 API Key 没读到，重新执行接入老师生成的 Mac 命令；它会把 Key 写进当前终端和 ~/.zshrc，并只显示已隐藏的确认信息。"
	case xingrenAssistantContainsAny(text, "wire_api = \"chat\"", "wire_api=chat", "model_provider = \"xingren\"", "[model_providers.xingren]", "--profile xingren"):
		return "结论：这是旧模板或错误模板，不适合现在的 AIPHUI 标准接入。\n\n依据：AIPHUI 必须使用 model_provider=\"aiphui\"、[model_providers.aiphui]、wire_api=\"responses\"。不能再用 xingren、wire_api=\"chat\" 或 --profile xingren。\n\n下一步：覆盖写入标准配置，config.toml 里只保存 env_key，不写明文 Key。base_url 写 https://api.aiphui.top/v1。"
	case xingrenAssistantContainsAny(text, "https://api.aiphui.top/v1/responses", "base_url = \"https://api.aiphui.top\"", "base_url=\"https://api.aiphui.top\"", "base_url 写错"):
		return "结论：base_url 写错了。\n\nAIPHUI 的 Codex base_url 必须是：https://api.aiphui.top/v1\n\n不要写成 https://api.aiphui.top，也不要写成 https://api.aiphui.top/v1/responses。Codex 会自己拼 /responses。\n\n下一步：重新覆盖 config.toml，并确认 wire_api = \"responses\"。"
	case xingrenAssistantContainsAny(text, "cli 能回", "cli能回", "桌面 app 不回", "桌面app不回", "桌面 app 没回复", "app 不回复", "api 没写入", "api没写入"):
		return "结论：如果 CLI 或 /v1/responses 能回复 OK，AIPHUI API 大概率没问题。桌面 App 不回复时，优先判断为 App 没读到默认 config.toml、User 级环境变量，或没有完全退出重启。\n\n下一步按顺序做：\n1. 完全退出 Codex 桌面 App，包括任务栏托盘。\n2. 重新打开 App。\n3. 使用 C:\\codex-work，不要在 C:\\Windows\\system32 测试。\n4. 选择 Local，发送“只回复 OK”。\n5. 还不行就重启 Windows。\n\n不要重复覆盖已经正确写入的配置。"
	case xingrenAssistantContainsAny(text, "working", "一直 working", "卡在 working"):
		return "结论：Codex App 一直 Working，优先查配置读取、Key 权限、当前目录和 trust/sandbox，不要先重装一堆东西。\n\n下一步最短路径：先在 PowerShell 直接测试 /v1/responses。如果能返回 OK，再完全退出 App、重启，选择 C:\\codex-work 和 Local，发送“只回复 OK”。\n\n如果 PowerShell 也失败，再按状态码处理：401 查 Key，403 查模型权限/余额，404 查 base_url，timeout 查网络和代理。"
	case xingrenAssistantContainsAny(text, "c:\\windows\\system32", "system32"):
		return "结论：C:\\Windows\\system32 是管理员 PowerShell 默认目录，不适合 Codex 项目测试。\n\n下一步执行：\n\nNew-Item -ItemType Directory -Path \"C:\\codex-work\" -Force | Out-Null\ncd C:\\codex-work\ncodex.cmd \"只回复 OK\"\n\n如果只用桌面 App，也把项目目录切到 C:\\codex-work 再测试。"
	case xingrenAssistantContainsAny(text, "英文界面", "english ui", "切中文", "英文版"):
		return "结论：Codex 桌面 App 英文界面不影响 AIPHUI 接入，也不影响中文回复。\n\n目前不要承诺 App 一定能切中文界面。下一步在对话里输入：以后全部用中文回复我。\n\n如果你要长期固定中文回复，可以在项目里的 AGENTS.md 写中文回复偏好。"
	case regexp.MustCompile(`(?i)sk-[A-Za-z0-9._\-]{12,}`).MatchString(message):
		return "结论：你发来的内容里像是露出了完整 API Key。\n\n请不要把 Key 发到公开群、公开截图或不可信页面；已经外泄就到令牌管理删除或重置这枚 Key。接入老师不会要求你回显或发送完整 Key。\n\n接入配置仍然应该把 Key 写到环境变量 AIPHUI_API_KEY，config.toml 只保存 env_key。"
	case strings.Contains(messageText, "401"):
		return "结论：401 通常是 Key 没传对、复制多了空格、令牌被禁用，或客户端没正确发送 Authorization。\n\n下一步：重新写入 AIPHUI_API_KEY，然后跑 /v1/responses 测试。测试命令只确认变量已读取（已隐藏），不要打印或发送 Key。\n\n如果终端能回但桌面 App 不回，重启 Codex App 或系统。"
	case strings.Contains(messageText, "403"):
		return "结论：403 通常表示 Key 能读到，但模型权限、分组、套餐或余额不允许访问 gpt-5.5。\n\n下一步：检查令牌是否允许 gpt-5.5、账号余额和分组权限。权限修好后再跑 /v1/responses 测试。"
	case strings.Contains(messageText, "404"):
		return "结论：404 优先查 base_url 和路径。\n\nAIPHUI 标准 base_url 是 https://api.aiphui.top/v1。不要写成 https://api.aiphui.top/v1/responses，因为 Codex 会自己拼 responses 路径。\n\n下一步：覆盖 config.toml，确认 wire_api = \"responses\"。"
	case strings.Contains(messageText, "timeout") || strings.Contains(messageText, "超时"):
		return "结论：timeout 先查网络、代理、AIPHUI 响应慢和 base_url，不要先判定 Key 错。\n\n下一步：用 PowerShell 直接测 /v1/responses。如果 PowerShell 成功而桌面 App 超时，完全退出 App 后重启；如果 PowerShell 也超时，换网络或检查代理。"
	default:
		return ""
	}
}

func xingrenAssistantContainsAny(text string, needles ...string) bool {
	for _, needle := range needles {
		if strings.Contains(text, strings.ToLower(needle)) {
			return true
		}
	}
	return false
}

func xingrenAssistantContextPrompt(pageContext *xingrenAssistantPageContext) string {
	if pageContext == nil {
		return ""
	}

	title, hint, ok := xingrenAssistantRouteContext(strings.TrimSpace(pageContext.Route))
	if !ok {
		return ""
	}
	return "当前页面是“" + title + "”。页面用途：" + hint + "。只基于这个固定页面标识回答；不要引用浏览器标题、可见文字、控件、地址或查询参数。"
}

func xingrenAssistantRouteContext(route string) (string, string, bool) {
	switch route {
	case "home":
		return "首页", "了解站点能力和常用入口", true
	case "dashboard":
		return "控制台", "查看账号状态、余额和常用入口", true
	case "token":
		return "令牌管理", "创建、复制或管理访问令牌", true
	case "playground":
		return "文本调试台", "测试文本请求和排查常见连接问题", true
	case "media":
		return "媒体工坊", "生成和管理图像或视频内容", true
	case "pricing":
		return "模型广场", "查看公开模型、价格和接口说明", true
	case "wallet":
		return "充值中心", "查看余额、充值入口和记录", true
	case "docs":
		return "接入文档", "查看客户端接入教程", true
	case "service":
		return "模型服务设置", "查看公开服务状态和可用模型", true
	case "logs":
		return "用量日志", "查看自己的请求记录和用量", true
	case "codexCloud":
		return "本地 Codex 连接", "连接本地 Codex 的图像和视频能力", true
	default:
		return "", "", false
	}
}

func xingrenAssistantValidateScreenshot(screenshot *xingrenAssistantScreenshot) (*xingrenAssistantScreenshot, error) {
	if screenshot == nil || strings.TrimSpace(screenshot.DataURL) == "" {
		return nil, nil
	}
	dataURL := strings.TrimSpace(screenshot.DataURL)
	mime := strings.TrimSpace(screenshot.Mime)
	if mime == "" {
		if strings.HasPrefix(dataURL, "data:image/png;base64,") {
			mime = "image/png"
		} else if strings.HasPrefix(dataURL, "data:image/jpeg;base64,") {
			mime = "image/jpeg"
		} else if strings.HasPrefix(dataURL, "data:image/webp;base64,") {
			mime = "image/webp"
		}
	}
	if mime != "image/png" && mime != "image/jpeg" && mime != "image/webp" {
		return nil, errors.New("截图格式暂不支持，请上传 PNG、JPG 或 WebP。")
	}
	prefix := "data:" + mime + ";base64,"
	if !strings.HasPrefix(dataURL, prefix) {
		return nil, errors.New("截图数据格式不正确，请重新上传一次。")
	}
	raw := strings.TrimSpace(strings.TrimPrefix(dataURL, prefix))
	if raw == "" {
		return nil, errors.New("截图内容为空，请重新上传一次。")
	}
	decoded, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return nil, errors.New("截图读取失败，请重新上传一张清晰截图。")
	}
	if len(decoded) > xingrenAssistantMaxScreenshotBytes {
		return nil, errors.New("截图太大了，请裁剪到报错区域后重新上传。")
	}
	name := xingrenAssistantCleanContextText(screenshot.Name, 120)
	if name == "" {
		name = "error-screenshot"
	}
	return &xingrenAssistantScreenshot{
		DataURL: dataURL,
		Name:    name,
		Mime:    mime,
		Bytes:   len(decoded),
	}, nil
}

func xingrenAssistantUserMessage(message string, screenshot *xingrenAssistantScreenshot) map[string]any {
	if screenshot == nil {
		return map[string]any{"role": "user", "content": message}
	}
	return map[string]any{
		"role": "user",
		"content": []map[string]any{
			{
				"type": "text",
				"text": message + "\n\n用户上传了一张报错截图。请先识别截图里可见错误，再给下一步操作和常见问题修复方案。如果截图里露出完整 API Key，要提醒公开传播前遮住，必要时重置；不要要求用户提供、回显或复述 Key，环境检查只确认已读取（已隐藏）。",
			},
			{
				"type": "image_url",
				"image_url": map[string]any{
					"url": screenshot.DataURL,
				},
			},
		},
	}
}

func xingrenAssistantPublicModelReply(_ string) string {
	return xingrenAssistantSafeOnlineReply
}

func xingrenAssistantScreenshotFallbackReply(_ string) string {
	return xingrenAssistantSafeScreenshotReply
}

func xingrenAssistantCleanContextList(items []string, maxItems int, maxEach int) []string {
	capacity := len(items)
	if capacity > maxItems {
		capacity = maxItems
	}
	result := make([]string, 0, capacity)
	seen := map[string]bool{}
	for _, item := range items {
		cleaned := xingrenAssistantCleanContextText(item, maxEach)
		if cleaned == "" || seen[cleaned] {
			continue
		}
		seen[cleaned] = true
		result = append(result, cleaned)
		if len(result) >= maxItems {
			break
		}
	}
	return result
}

func xingrenAssistantCleanContextText(text string, limit int) string {
	cleaned := strings.Join(strings.Fields(xingrenAssistantRedact(text)), " ")
	return xingrenAssistantLimitText(cleaned, limit)
}

func xingrenAssistantTrimHistory(history []xingrenAssistantMessage) []xingrenAssistantMessage {
	if len(history) > 6 {
		history = history[len(history)-6:]
	}
	result := make([]xingrenAssistantMessage, 0, len(history))
	for _, item := range history {
		role := strings.TrimSpace(item.Role)
		if role != "assistant" && role != "user" {
			continue
		}
		content := strings.TrimSpace(item.Content)
		if content == "" {
			continue
		}
		result = append(result, xingrenAssistantMessage{
			Role:    role,
			Content: xingrenAssistantLimitText(xingrenAssistantRedact(content), 700),
		})
	}
	return result
}

func xingrenCodexTokenName() string {
	return "星人Codex " + time.Now().Format("0601021504")
}

func xingrenCodexModel(modelName string) string {
	modelName = strings.TrimSpace(modelName)
	if modelName == "" || len(modelName) > 64 {
		return xingrenCodexDefaultModel
	}
	for _, r := range modelName {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.' {
			continue
		}
		return xingrenCodexDefaultModel
	}
	if !xingrenCodexAllowedTextModels[modelName] {
		return xingrenCodexDefaultModel
	}
	return modelName
}

func xingrenCodexTokenModelLimits(textModel string) string {
	textModel = xingrenCodexModel(textModel)
	if textModel == "" {
		textModel = xingrenCodexDefaultModel
	}
	return textModel + "," + xingrenCodexImage15KModel
}

func xingrenAssistantModel() string {
	modelName := strings.TrimSpace(os.Getenv("XINGREN_API_ASSISTANT_MODEL"))
	if modelName == "" {
		return xingrenAssistantFallback
	}
	if len(modelName) > 64 {
		return xingrenAssistantFallback
	}
	for _, r := range modelName {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.' {
			continue
		}
		return xingrenAssistantFallback
	}
	return modelName
}

func xingrenAssistantChatURL() string {
	if configured := strings.TrimSpace(os.Getenv("XINGREN_API_ASSISTANT_CHAT_URL")); configured != "" {
		if err := common.ValidatePublicHTTPURL(configured); err != nil {
			common.SysLog("XINGREN_API_ASSISTANT_CHAT_URL invalid, falling back to localhost: " + err.Error())
		} else {
			return configured
		}
	}
	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "3000"
	}
	return "http://127.0.0.1:" + port + "/v1/chat/completions"
}

func xingrenAssistantBearerKey(key string) string {
	key = strings.TrimSpace(key)
	if strings.HasPrefix(key, "sk-") {
		return key
	}
	return "sk-" + key
}

func xingrenAssistantClientKey(c *gin.Context) string {
	// Use Gin's ClientIP which respects the configured trusted-proxy list,
	// preventing clients from spoofing their IP via X-Forwarded-For.
	if ip := c.ClientIP(); ip != "" {
		return ip
	}
	return "unknown"
}

func xingrenAssistantAllow(key string) bool {
	now := time.Now()
	window := 5 * time.Minute
	cutoff := now.Add(-window)

	xingrenAssistantRateMu.Lock()
	defer xingrenAssistantRateMu.Unlock()

	hits := xingrenAssistantHits[key]
	kept := hits[:0]
	for _, hit := range hits {
		if hit.After(cutoff) {
			kept = append(kept, hit)
		}
	}
	if len(kept) >= xingrenAssistantRateMax {
		xingrenAssistantHits[key] = kept
		return false
	}
	xingrenAssistantHits[key] = append(kept, now)

	if len(xingrenAssistantHits) > 2000 {
		for itemKey, itemHits := range xingrenAssistantHits {
			if len(itemHits) == 0 || itemHits[len(itemHits)-1].Before(cutoff) {
				delete(xingrenAssistantHits, itemKey)
			}
		}
	}
	return true
}

func xingrenAssistantRedact(text string) string {
	redacted := text
	for _, pattern := range xingrenAssistantSecrets {
		redacted = pattern.ReplaceAllStringFunc(redacted, func(match string) string {
			lower := strings.ToLower(match)
			switch {
			case strings.HasPrefix(lower, "bearer "):
				return match[:7] + "***"
			case strings.HasPrefix(lower, "authorization"):
				parts := strings.SplitN(match, ":", 2)
				if len(parts) == 2 {
					return parts[0] + ": ***"
				}
				return "Authorization: ***"
			default:
				return "sk-***"
			}
		})
	}
	return redacted
}

func xingrenAssistantLimitText(text string, limit int) string {
	runes := []rune(strings.TrimSpace(text))
	if len(runes) <= limit {
		return string(runes)
	}
	return string(runes[:limit]) + "..."
}
