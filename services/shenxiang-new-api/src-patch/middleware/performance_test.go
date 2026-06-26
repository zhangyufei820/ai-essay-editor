package middleware

import "testing"

func TestShouldSkipCPUOverloadCheck(t *testing.T) {
	tests := []struct {
		name string
		path string
		want bool
	}{
		{name: "responses relay", path: "/v1/responses", want: true},
		{name: "chat completions relay", path: "/v1/chat/completions", want: true},
		{name: "root v1 relay", path: "/v1", want: true},
		{name: "gemini relay", path: "/v1beta/models/gemini-pro:generateContent", want: true},
		{name: "playground remains protected", path: "/pg/chat/completions", want: false},
		{name: "midjourney remains protected", path: "/mj/submit/imagine", want: false},
		{name: "media remains protected", path: "/pg/media/files/test.png", want: false},
		{name: "non api prefix", path: "/v10/responses", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shouldSkipCPUOverloadCheck(tt.path); got != tt.want {
				t.Fatalf("shouldSkipCPUOverloadCheck(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}
