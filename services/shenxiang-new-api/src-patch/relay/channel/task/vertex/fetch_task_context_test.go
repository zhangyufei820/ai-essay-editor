package vertex

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	taskcommon "github.com/QuantumNous/new-api/relay/channel/task/taskcommon"
	vertexcore "github.com/QuantumNous/new-api/relay/channel/vertex"

	"github.com/stretchr/testify/require"
)

func TestFetchTaskWithContextCancelsVertexTokenExchange(t *testing.T) {
	proxyStarted := make(chan struct{})
	releaseProxy := make(chan struct{})
	var startOnce sync.Once
	var releaseOnce sync.Once
	release := func() {
		releaseOnce.Do(func() { close(releaseProxy) })
	}
	proxyServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		startOnce.Do(func() { close(proxyStarted) })
		<-releaseProxy
		http.Error(w, "released", http.StatusBadGateway)
	}))
	defer proxyServer.Close()
	defer release()

	privateKey, err := rsa.GenerateKey(rand.Reader, 1024)
	require.NoError(t, err)
	encodedPrivateKey, err := x509.MarshalPKCS8PrivateKey(privateKey)
	require.NoError(t, err)
	credentials := vertexcore.Credentials{
		ProjectID:   "deadline-project",
		ClientEmail: "deadline@example.test",
		PrivateKey: string(pem.EncodeToMemory(&pem.Block{
			Type:  "PRIVATE KEY",
			Bytes: encodedPrivateKey,
		})),
	}
	key, err := common.Marshal(credentials)
	require.NoError(t, err)
	operationName := "projects/deadline-project/locations/us-central1/publishers/google/models/veo-3.1-generate-preview/operations/deadline-operation"
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	done := make(chan error, 1)

	go func() {
		_, fetchErr := (&TaskAdaptor{}).FetchTaskWithContext(
			ctx,
			"https://us-central1-aiplatform.googleapis.com",
			string(key),
			map[string]any{"task_id": taskcommon.EncodeLocalTaskID(operationName)},
			proxyServer.URL,
		)
		done <- fetchErr
	}()

	select {
	case <-proxyStarted:
	case <-time.After(time.Second):
		t.Fatal("Vertex token exchange did not reach the blocking proxy")
	}
	select {
	case fetchErr := <-done:
		require.ErrorIs(t, fetchErr, context.DeadlineExceeded)
	case <-time.After(250 * time.Millisecond):
		release()
		<-done
		t.Fatal("Vertex token exchange ignored the polling deadline")
	}
}
