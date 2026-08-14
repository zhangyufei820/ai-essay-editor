package main

import (
	"os"
	"strings"
	"testing"
)

func TestXingrenHomeChatResponseSafetyContract(t *testing.T) {
	helperSource, err := os.ReadFile("web/classic/src/pages/Home/chatResponseSafety.js")
	if err != nil {
		t.Fatalf("read home chat response safety helper: %v", err)
	}
	helper := string(helperSource)
	for _, marker := range []string{
		"HOME_CHAT_RESPONSE_HEADER_TIMEOUT_MS = 85_000",
		"HOME_CHAT_TIMEOUT_MESSAGE",
		"isHtmlLikeChatResponse",
		"isSupportedChatSuccessContentType",
		"resolveChatErrorBody",
		"MAX_PUBLIC_ERROR_LENGTH = 240",
	} {
		if !strings.Contains(helper, marker) {
			t.Fatalf("home chat response safety helper is missing marker %q", marker)
		}
	}

	workbenchSource, err := os.ReadFile("web/classic/src/pages/Home/TextWorkbench.jsx")
	if err != nil {
		t.Fatalf("read home text workbench: %v", err)
	}
	workbench := string(workbenchSource)
	for _, marker := range []string{
		"resolveChatErrorBody({",
		"isSupportedChatSuccessContentType(contentType)",
		"HOME_CHAT_RESPONSE_HEADER_TIMEOUT_MS",
		"responseHeaderTimedOut = true",
	} {
		if !strings.Contains(workbench, marker) {
			t.Fatalf("home text workbench is missing fail-closed marker %q", marker)
		}
	}
	if strings.Contains(workbench, "payload?.message ||\n    text ||") {
		t.Fatal("home text workbench still exposes raw non-JSON response bodies")
	}
}
