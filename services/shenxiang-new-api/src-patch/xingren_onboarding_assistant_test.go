package main

import "testing"

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
