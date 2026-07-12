package service

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/stretchr/testify/require"
)

type blockingVideoReader struct {
	started chan struct{}
	release chan struct{}
	read    bool
}

func (reader *blockingVideoReader) Read(buffer []byte) (int, error) {
	if reader.read {
		return 0, io.EOF
	}
	reader.read = true
	close(reader.started)
	<-reader.release
	return copy(buffer, []byte("video")), nil
}

func TestDialValidatedPlaygroundVideoAddressRejectsMixedResolvedIPs(t *testing.T) {
	dialed := false
	connection, err := dialValidatedPlaygroundVideoAddress(
		context.Background(),
		"tcp",
		"safe.example:443",
		func(context.Context, string) ([]net.IPAddr, error) {
			return []net.IPAddr{
				{IP: net.ParseIP("8.8.8.8")},
				{IP: net.ParseIP("127.0.0.1")},
			}, nil
		},
		func(context.Context, string, string) (net.Conn, error) {
			dialed = true
			return nil, errors.New("unexpected dial")
		},
	)

	require.Error(t, err)
	require.Nil(t, connection)
	require.False(t, dialed)
}

func TestDialValidatedPlaygroundVideoAddressPinsValidatedIP(t *testing.T) {
	var dialAddress string
	expectedErr := errors.New("stop after observing dial target")
	connection, err := dialValidatedPlaygroundVideoAddress(
		context.Background(),
		"tcp",
		"safe.example:443",
		func(context.Context, string) ([]net.IPAddr, error) {
			return []net.IPAddr{{IP: net.ParseIP("8.8.8.8")}}, nil
		},
		func(_ context.Context, _ string, address string) (net.Conn, error) {
			dialAddress = address
			return nil, expectedErr
		},
	)

	require.ErrorIs(t, err, expectedErr)
	require.Nil(t, connection)
	require.Equal(t, "8.8.8.8:443", dialAddress)
}

func TestPlaygroundVideoMediaClientRejectsProxyForUntrustedURL(t *testing.T) {
	for _, proxyURL := range []string{
		"http://127.0.0.1:3128",
		"https://127.0.0.1:3128",
		"socks5://127.0.0.1:1080",
		"socks5h://127.0.0.1:1080",
	} {
		t.Run(proxyURL, func(t *testing.T) {
			client, err := newPlaygroundVideoMediaHTTPClient(proxyURL, true)
			require.Error(t, err)
			require.Nil(t, client)
		})
	}
}

func TestWritePlaygroundVideoMediaUsesSharedUserQuota(t *testing.T) {
	root := t.TempDir()
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", root)
	t.Setenv("PLAYGROUND_MEDIA_USER_MAX_MB", "1")
	t.Setenv("PLAYGROUND_MEDIA_TOTAL_MAX_MB", "10")
	t.Setenv("PLAYGROUND_MEDIA_MAX_FILES_PER_USER", "100")
	userDir := filepath.Join(root, playgroundVideoMediaUserDirName(7))
	require.NoError(t, os.MkdirAll(userDir, 0o700))
	require.NoError(t, os.WriteFile(filepath.Join(userDir, "existing.mp4"), bytes.Repeat([]byte("x"), 900*1024), 0o600))

	item, err := writePlaygroundVideoMedia(
		&model.Task{TaskID: "video-quota", UserId: 7},
		&playgroundVideoMediaMarker{RequestID: "video-quota"},
		"https://example.com/video.mp4",
		bytes.NewReader(bytes.Repeat([]byte("y"), 200*1024)),
		".mp4",
		256*1024,
	)

	require.ErrorContains(t, err, "user media cache quota")
	require.Nil(t, item)
	tempFiles, globErr := filepath.Glob(filepath.Join(root, ".playground-media-*.tmp"))
	require.NoError(t, globErr)
	require.Empty(t, tempFiles)
}

func TestWritePlaygroundVideoMediaDoesNotHoldQuotaLockWhileReading(t *testing.T) {
	root := t.TempDir()
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", root)
	reader := &blockingVideoReader{started: make(chan struct{}), release: make(chan struct{})}
	done := make(chan error, 1)

	go func() {
		_, err := writePlaygroundVideoMedia(
			&model.Task{TaskID: "video-lock-scope", UserId: 9},
			&playgroundVideoMediaMarker{RequestID: "video-lock-scope"},
			"https://example.com/video.mp4",
			reader,
			".mp4",
			1024,
		)
		done <- err
	}()

	select {
	case <-reader.started:
	case <-time.After(time.Second):
		t.Fatal("video copy did not start")
	}
	lockAcquired := make(chan struct{})
	go func() {
		common.PlaygroundMediaCacheMu.Lock()
		common.PlaygroundMediaCacheMu.Unlock()
		close(lockAcquired)
	}()
	var acquired bool
	select {
	case <-lockAcquired:
		acquired = true
	case <-time.After(200 * time.Millisecond):
	}
	close(reader.release)
	require.True(t, acquired, "quota lock must remain available during remote body copy")
	select {
	case err := <-done:
		require.NoError(t, err)
	case <-time.After(time.Second):
		t.Fatal("video cache write did not finish")
	}
}

func TestPlaygroundVideoOriginalURLIsNeverPersisted(t *testing.T) {
	raw := "https://user:password@provider.example/video.mp4?signature=secret#fragment"

	require.Empty(t, playgroundVideoOriginalURL(raw))
}
