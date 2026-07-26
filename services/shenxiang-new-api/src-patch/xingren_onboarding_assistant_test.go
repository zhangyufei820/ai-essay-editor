package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestXingrenCodexTokenModelLimitsAddsPublic15KImageModel(t *testing.T) {
	got := xingrenCodexTokenModelLimits("gpt-5.4-mini")
	want := "gpt-5.4-mini,image 2电商商品图快速通道(1.5K)"
	if got != want {
		t.Fatalf("xingrenCodexTokenModelLimits() = %q, want %q", got, want)
	}
}

func TestXingrenCodexTokenModelLimitsFallsBackForInvalidTextModel(t *testing.T) {
	got := xingrenCodexTokenModelLimits("image 2电商商品图快速通道(1.5K)")
	want := "gpt-5.5,image 2电商商品图快速通道(1.5K)"
	if got != want {
		t.Fatalf("xingrenCodexTokenModelLimits() = %q, want %q", got, want)
	}
}

func TestXingrenCodexModelRejectsUnknownAsciiModel(t *testing.T) {
	got := xingrenCodexModel("geek2api-image-2")
	if got != xingrenCodexDefaultModel {
		t.Fatalf("xingrenCodexModel() = %q, want %q", got, xingrenCodexDefaultModel)
	}
}

func TestXingrenCodexTokenGroupDefaultsLegacyUserGroup(t *testing.T) {
	token := buildXingrenCodexUserToken(42, "test-key", "test-token", "gpt-5.5", "internal")
	if token.Group != "default" {
		t.Fatalf("token group = %q, want default", token.Group)
	}
	if token.CrossGroupRetry {
		t.Fatal("new Codex user token must not enable cross-group retry")
	}
}

func TestXingrenAssistantNeverRequestsFullKeyOutput(t *testing.T) {
	screenshotMessage := xingrenAssistantUserMessage("测试截图", &xingrenAssistantScreenshot{})
	screenshotContent, ok := screenshotMessage["content"].([]map[string]any)
	if !ok || len(screenshotContent) == 0 {
		t.Fatal("screenshot prompt content is missing")
	}
	screenshotText, ok := screenshotContent[0]["text"].(string)
	if !ok {
		t.Fatal("screenshot prompt text is missing")
	}

	responses := []string{
		xingrenAssistantSystemPrompt(),
		xingrenAssistantKnowledgeReply("mac 终端", nil, nil),
		xingrenAssistantKnowledgeReply("401", nil, nil),
		xingrenAssistantKnowledgeReply("sk-abcdefghijklmnop", nil, nil),
		xingrenAssistantScreenshotFallbackReply("接入报错"),
		screenshotText,
	}
	for _, response := range responses {
		for _, unsafePhrase := range []string{"会打印完整", "必须打印完整", "允许打印完整", "完整读取", "echo 出完整"} {
			if strings.Contains(response, unsafePhrase) {
				t.Fatalf("assistant response requests unsafe key output: %q", unsafePhrase)
			}
		}
	}
	if !strings.Contains(xingrenAssistantSystemPrompt(), "不要打印完整") {
		t.Fatal("system prompt must explicitly prohibit printing a full key")
	}
	clientSource := string(xingrenAPIOnboardingAssistantJS)
	for _, unsafePhrase := range []string{"allowKeyPrint", "AIPHUI_API_KEY = $", "打印完整 AIPHUI_API_KEY"} {
		if strings.Contains(clientSource, unsafePhrase) {
			t.Fatalf("onboarding client contains unsafe key output: %q", unsafePhrase)
		}
	}
	if !strings.Contains(clientSource, "AIPHUI_API_KEY 已读取（已隐藏）") {
		t.Fatal("onboarding client must confirm a key without revealing it")
	}
}

func TestXingrenAssistantFailsClosedForUntrustedReplies(t *testing.T) {
	unsafeReply := "用户原文 https://internal.example request-id=req-123 sk-secret-value 上游模型"
	if got := xingrenAssistantPublicModelReply(unsafeReply); got != xingrenAssistantSafeOnlineReply {
		t.Fatalf("model reply = %q, want fixed safe reply", got)
	}
	if got := xingrenAssistantScreenshotFallbackReply(unsafeReply); got != xingrenAssistantSafeScreenshotReply {
		t.Fatalf("screenshot fallback = %q, want fixed safe reply", got)
	}
	for _, reply := range []string{xingrenAssistantSafeOnlineReply, xingrenAssistantSafeScreenshotReply} {
		for _, unsafePart := range []string{"用户原文", "https://", "request-id", "sk-", "上游"} {
			if strings.Contains(reply, unsafePart) {
				t.Fatalf("safe reply leaks %q: %q", unsafePart, reply)
			}
		}
	}
}

func TestXingrenAssistantContextUsesOnlyKnownRoute(t *testing.T) {
	var pageContext xingrenAssistantPageContext
	err := json.Unmarshal([]byte(`{
		"route":"media",
		"url":"https://internal.example/secret?key=sk-secret-value",
		"path":"/secret/request-id=req-123",
		"title":"用户原文标题",
		"route_title":"用户原文路由标题",
		"route_hint":"用户原文提示",
		"headings":["用户原文章节"],
		"buttons":["用户原文按钮"],
		"fields":["用户原文字段"],
		"controls":["用户原文控件"],
		"visible_text":"用户原文可见文字"
	}`), &pageContext)
	if err != nil {
		t.Fatalf("unmarshal context: %v", err)
	}

	prompt := xingrenAssistantContextPrompt(&pageContext)
	if !strings.Contains(prompt, "媒体工坊") {
		t.Fatalf("known route context missing static route description: %q", prompt)
	}
	for _, unsafePart := range []string{"https://", "secret", "request-id", "sk-", "用户原文"} {
		if strings.Contains(prompt, unsafePart) {
			t.Fatalf("context prompt leaks browser content %q: %q", unsafePart, prompt)
		}
	}
	if got := xingrenAssistantContextPrompt(&xingrenAssistantPageContext{Route: "unknown-route"}); got != "" {
		t.Fatalf("unknown route context = %q, want empty", got)
	}
}

func TestXingrenAssistantClientFailsClosedForPageAndErrors(t *testing.T) {
	clientSource := string(xingrenAPIOnboardingAssistantJS)
	for _, unsafePhrase := range []string{"payload.message", "error.message"} {
		if strings.Contains(clientSource, unsafePhrase) {
			t.Fatalf("onboarding client displays untrusted error detail: %q", unsafePhrase)
		}
	}

	start := strings.Index(clientSource, "function collectPageContext()")
	if start < 0 {
		t.Fatal("collectPageContext function is missing")
	}
	end := strings.Index(clientSource[start:], "function uniqueActions(actions)")
	if end < 0 {
		t.Fatal("collectPageContext function boundary is missing")
	}
	contextSource := clientSource[start : start+end]
	if !strings.Contains(contextSource, "route: routeKey") {
		t.Fatalf("collectPageContext must send the static route identifier: %q", contextSource)
	}
	for _, unsafePhrase := range []string{"window.location", "document.", "collectLabels", "collectInteractiveInventory", "visiblePageText", "url:", "path:", "title:"} {
		if strings.Contains(contextSource, unsafePhrase) {
			t.Fatalf("collectPageContext includes browser content: %q", unsafePhrase)
		}
	}
}
