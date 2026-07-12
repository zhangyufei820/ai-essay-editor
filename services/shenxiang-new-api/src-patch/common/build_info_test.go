package common

import (
	"strings"
	"testing"
)

func TestBuildInfoManifestIsEmbedded(t *testing.T) {
	info := GetBuildInfo()
	if info.SchemaVersion != 2 {
		t.Fatalf("schema version = %d, want 2", info.SchemaVersion)
	}
	if strings.TrimSpace(info.Repository) == "" {
		t.Fatal("repository is empty")
	}
	if len(info.RepositoryCommit) != 40 {
		t.Fatalf("repository commit length = %d, want 40", len(info.RepositoryCommit))
	}
	if len(info.UpstreamCommit) != 40 {
		t.Fatalf("upstream commit length = %d, want 40", len(info.UpstreamCommit))
	}
	if len(info.PatchSHA256) != 64 || len(info.WorktreeSHA256) != 64 || len(info.SourceDigest) != 64 {
		t.Fatalf("invalid digest lengths: patch=%d worktree=%d source=%d", len(info.PatchSHA256), len(info.WorktreeSHA256), len(info.SourceDigest))
	}
	if info.ChecksumFile != "BUILD-CHECKSUMS.sha256" || info.WorktreeFileCount < 1 {
		t.Fatalf("invalid worktree provenance: checksum=%q files=%d", info.ChecksumFile, info.WorktreeFileCount)
	}
}

func TestBuildInfoIsExposedThroughStatusVersion(t *testing.T) {
	info := GetBuildInfo()
	want := "build." + info.SourceDigest[:12]
	if !strings.Contains(Version, want) {
		t.Fatalf("Version %q does not contain provenance component %q", Version, want)
	}
}

func TestBuildInfoRejectsTamperedSourceDigest(t *testing.T) {
	info := GetBuildInfo()
	info.SourceDigest = strings.Repeat("0", 64)
	if err := info.validate(); err == nil {
		t.Fatal("tampered source digest was accepted")
	}
}

func TestBuildInfoRejectsTamperedWorktreeDigest(t *testing.T) {
	info := GetBuildInfo()
	info.WorktreeSHA256 = strings.Repeat("0", 64)
	if err := info.validate(); err == nil {
		t.Fatal("tampered worktree digest was accepted")
	}
}
