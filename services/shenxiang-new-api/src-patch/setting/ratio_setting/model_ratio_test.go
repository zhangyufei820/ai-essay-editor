package ratio_setting

import "testing"

func TestGPT56CompletionRatioAllowsExplicitOverride(t *testing.T) {
	previous := CompletionRatio2JSONString()
	t.Cleanup(func() {
		if err := UpdateCompletionRatioByJSONString(previous); err != nil {
			t.Fatalf("restore completion ratio: %v", err)
		}
	})

	if err := UpdateCompletionRatioByJSONString(`{"gpt-5.6-terra":5.75}`); err != nil {
		t.Fatalf("update completion ratio: %v", err)
	}

	if got := GetCompletionRatio("gpt-5.6-terra"); got != 5.75 {
		t.Fatalf("gpt-5.6-terra completion ratio = %v, want 5.75", got)
	}
	if got := GetCompletionRatio("gpt-5.6-sol"); got != 6 {
		t.Fatalf("gpt-5.6-sol completion ratio = %v, want default 6", got)
	}
}
