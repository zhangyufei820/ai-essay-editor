package common

import (
	"fmt"
	"io"
	"os"
	"strconv"
)

// defaultMaxUpstreamResponseBytes caps how many bytes we will buffer from an
// upstream channel response into memory. Without a cap a malicious or
// compromised upstream can stream an unbounded body and OOM the gateway.
const defaultMaxUpstreamResponseBytes int64 = 128 << 20 // 128 MiB

// MaxUpstreamResponseBytes resolves the configured cap, allowing operators to
// override it via the MAX_UPSTREAM_RESPONSE_BYTES env var. Non-positive or
// unparsable values fall back to the default.
func MaxUpstreamResponseBytes() int64 {
	if v := os.Getenv("MAX_UPSTREAM_RESPONSE_BYTES"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			return n
		}
	}
	return defaultMaxUpstreamResponseBytes
}

// ReadAllCapped reads from r up to MaxUpstreamResponseBytes()+1 bytes. If the
// body exceeds the cap it returns an explicit error instead of buffering an
// unbounded amount of memory. Use this in place of io.ReadAll for any body
// whose size is controlled by a remote/untrusted party.
func ReadAllCapped(r io.Reader) ([]byte, error) {
	limit := MaxUpstreamResponseBytes()
	data, err := io.ReadAll(io.LimitReader(r, limit+1))
	if err != nil {
		return data, err
	}
	if int64(len(data)) > limit {
		return nil, fmt.Errorf("upstream response exceeds %d byte limit", limit)
	}
	return data, nil
}
