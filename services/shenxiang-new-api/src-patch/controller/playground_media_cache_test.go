package controller

import "testing"

func TestNormalizePlaygroundMediaKindSupportsReferenceAudioAndVideo(t *testing.T) {
	tests := []struct {
		name string
		kind string
		ext  string
		want string
	}{
		{name: "explicit audio", kind: "audio", ext: ".mp3", want: "audio"},
		{name: "mp3 extension", ext: ".mp3", want: "audio"},
		{name: "m4a extension", ext: ".m4a", want: "audio"},
		{name: "mov extension", ext: ".mov", want: "video"},
		{name: "m4v extension", ext: ".m4v", want: "video"},
		{name: "image default", ext: ".png", want: "image"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := normalizePlaygroundMediaKind(test.kind, test.ext)
			if got != test.want {
				t.Fatalf("normalizePlaygroundMediaKind(%q, %q) = %q, want %q", test.kind, test.ext, got, test.want)
			}
		})
	}
}

func TestExtFromRemotePathSupportsReferenceAudioAndVideo(t *testing.T) {
	tests := map[string]string{
		"/asset/ref.mp3": ".mp3",
		"/asset/ref.m4a": ".m4a",
		"/asset/ref.aac": ".aac",
		"/asset/ref.wav": ".wav",
		"/asset/ref.mov": ".mov",
		"/asset/ref.m4v": ".m4v",
	}

	for path, want := range tests {
		if got := extFromRemotePath(path); got != want {
			t.Fatalf("extFromRemotePath(%q) = %q, want %q", path, got, want)
		}
	}
}
