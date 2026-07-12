package common

import (
	"crypto/sha256"
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"
)

//go:embed build-manifest.json
var embeddedBuildManifest []byte

type BuildInfo struct {
	SchemaVersion      int    `json:"schema_version"`
	Repository         string `json:"repository"`
	RepositoryCommit   string `json:"repository_commit"`
	RepositoryDirty    bool   `json:"repository_dirty"`
	UpstreamRepository string `json:"upstream_repository"`
	UpstreamCommit     string `json:"upstream_commit"`
	PatchBase          string `json:"patch_base"`
	PatchFileCount     int    `json:"patch_file_count"`
	PatchSHA256        string `json:"patch_sha256"`
	WorktreeFileCount  int    `json:"worktree_file_count"`
	WorktreeSHA256     string `json:"worktree_sha256"`
	ChecksumFile       string `json:"checksum_file"`
	SourceDigest       string `json:"source_digest"`
}

var currentBuildInfo BuildInfo

func init() {
	if err := json.Unmarshal(embeddedBuildManifest, &currentBuildInfo); err != nil {
		panic(fmt.Sprintf("invalid embedded build manifest: %v", err))
	}
	if err := currentBuildInfo.validate(); err != nil {
		panic(fmt.Sprintf("invalid embedded build provenance: %v", err))
	}
	separator := "+"
	if strings.Contains(Version, "+") {
		separator = "."
	}
	Version += separator + "build." + currentBuildInfo.SourceDigest[:12]
}

func GetBuildInfo() BuildInfo {
	return currentBuildInfo
}

func (info BuildInfo) validate() error {
	if info.SchemaVersion != 2 {
		return fmt.Errorf("unsupported schema version %d", info.SchemaVersion)
	}
	for name, value := range map[string]struct {
		value  string
		length int
	}{
		"repository_commit": {info.RepositoryCommit, 40},
		"upstream_commit":   {info.UpstreamCommit, 40},
		"patch_base":        {info.PatchBase, 40},
		"patch_sha256":      {info.PatchSHA256, 64},
		"worktree_sha256":   {info.WorktreeSHA256, 64},
		"source_digest":     {info.SourceDigest, 64},
	} {
		if len(value.value) != value.length || !isLowerHex(value.value) {
			return fmt.Errorf("%s must be %d lowercase hexadecimal characters", name, value.length)
		}
	}
	if info.PatchBase != info.UpstreamCommit {
		return fmt.Errorf("patch_base does not match upstream_commit")
	}
	expectedSourceDigest := fmt.Sprintf("%x", sha256.Sum256([]byte(strings.Join([]string{
		info.Repository,
		info.RepositoryCommit,
		info.UpstreamRepository,
		info.UpstreamCommit,
		info.PatchBase,
		info.PatchSHA256,
		info.WorktreeSHA256,
	}, "\n")+"\n")))
	if info.SourceDigest != expectedSourceDigest {
		return fmt.Errorf("source_digest does not match repository, upstream, patch, and worktree hashes")
	}
	if info.PatchFileCount < 1 {
		return fmt.Errorf("patch_file_count must be positive")
	}
	if info.WorktreeFileCount < 1 {
		return fmt.Errorf("worktree_file_count must be positive")
	}
	if info.ChecksumFile != "BUILD-CHECKSUMS.sha256" {
		return fmt.Errorf("checksum_file must be BUILD-CHECKSUMS.sha256")
	}
	if strings.TrimSpace(info.Repository) == "" {
		return fmt.Errorf("repository is empty")
	}
	if strings.TrimSpace(info.UpstreamRepository) == "" {
		return fmt.Errorf("upstream_repository is empty")
	}
	return nil
}

func isLowerHex(value string) bool {
	for _, char := range value {
		if (char < '0' || char > '9') && (char < 'a' || char > 'f') {
			return false
		}
	}
	return true
}
