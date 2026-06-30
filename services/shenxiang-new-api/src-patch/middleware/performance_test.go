package middleware

import "testing"

func TestShouldSkipCPUOverloadCheckForRelayPaths(t *testing.T) {
	tests := []struct {
		name string
		path string
		want bool
	}{
		{name: "v1 root", path: "/v1", want: true},
		{name: "v1 chat", path: "/v1/chat/completions", want: true},
		{name: "v1beta root", path: "/v1beta", want: true},
		{name: "v1beta gemini", path: "/v1beta/models/gemini:generateContent", want: true},
		{name: "playground root", path: "/pg", want: true},
		{name: "playground image edits task", path: "/pg/images/tasks/edits", want: true},
		{name: "playground chat", path: "/pg/chat/completions", want: true},
		{name: "dashboard api", path: "/api/status", want: false},
		{name: "home", path: "/", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shouldSkipCPUOverloadCheck(tt.path); got != tt.want {
				t.Fatalf("shouldSkipCPUOverloadCheck(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}
