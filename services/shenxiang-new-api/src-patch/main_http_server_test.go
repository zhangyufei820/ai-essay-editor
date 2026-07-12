package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
)

type shutdownServerStub struct {
	shutdownErr error
	closeErr    error
	closeCalls  int
}

func (server *shutdownServerStub) Shutdown(context.Context) error {
	return server.shutdownErr
}

func (server *shutdownServerStub) Close() error {
	server.closeCalls++
	return server.closeErr
}

func TestNewHTTPServerHasConnectionSafetyLimits(t *testing.T) {
	server := newHTTPServer("3000", http.NewServeMux())

	if server.ReadHeaderTimeout <= 0 {
		t.Fatal("ReadHeaderTimeout must be bounded")
	}
	if server.IdleTimeout <= 0 {
		t.Fatal("IdleTimeout must be bounded")
	}
	if server.MaxHeaderBytes <= 0 {
		t.Fatal("MaxHeaderBytes must be explicit")
	}
	if server.WriteTimeout != 0 {
		t.Fatal("WriteTimeout must remain disabled for streaming responses")
	}
}

func TestShutdownHTTPServerForceClosesAndReportsUndrainedHandlers(t *testing.T) {
	entered := make(chan struct{})
	release := make(chan struct{})
	handler := newTrackedHTTPHandler(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		close(entered)
		<-release
	}))
	done := make(chan struct{})
	go func() {
		handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))
		close(done)
	}()
	<-entered

	server := &shutdownServerStub{shutdownErr: context.DeadlineExceeded}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	result := shutdownHTTPServer(ctx, server, handler)
	if !errors.Is(result.shutdownErr, context.DeadlineExceeded) {
		t.Fatalf("expected shutdown deadline, got %v", result.shutdownErr)
	}
	if server.closeCalls != 1 {
		t.Fatalf("expected one forced close, got %d", server.closeCalls)
	}
	if result.handlersDrained {
		t.Fatal("blocked handler must not be reported as drained")
	}

	rejected := httptest.NewRecorder()
	handler.ServeHTTP(rejected, httptest.NewRequest(http.MethodGet, "/", nil))
	if rejected.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected admission to remain closed, got %d", rejected.Code)
	}
	close(release)
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("handler did not drain after release")
	}
}

func TestShutdownHTTPServerDrainsWithoutForcedClose(t *testing.T) {
	handler := newTrackedHTTPHandler(http.NotFoundHandler())
	server := &shutdownServerStub{}
	result := shutdownHTTPServer(context.Background(), server, handler)
	if result.shutdownErr != nil || result.closeErr != nil {
		t.Fatalf("unexpected shutdown error: %+v", result)
	}
	if !result.handlersDrained {
		t.Fatal("idle handler should drain immediately")
	}
	if server.closeCalls != 0 {
		t.Fatalf("graceful shutdown must not force close, got %d calls", server.closeCalls)
	}
}

func TestMainDoesNotCloseDatabaseWhileBackgroundWorkersMayStillRun(t *testing.T) {
	source, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(source), "model.CloseDB()") {
		t.Fatal("main must leave database cleanup to process exit while untracked workers can still run")
	}
}

func TestNormalizeSyncFrequencyPreventsUnboundedRedisCache(t *testing.T) {
	original := common.SyncFrequency
	t.Cleanup(func() { common.SyncFrequency = original })

	for _, invalid := range []int{0, -1, 24*60*60 + 1} {
		common.SyncFrequency = invalid
		normalizeSyncFrequency()
		if common.SyncFrequency != 60 {
			t.Fatalf("SyncFrequency = %d, want 60", common.SyncFrequency)
		}
	}

	common.SyncFrequency = 30
	normalizeSyncFrequency()
	if common.SyncFrequency != 30 {
		t.Fatalf("positive SyncFrequency changed to %d", common.SyncFrequency)
	}

	common.SyncFrequency = 24 * 60 * 60
	normalizeSyncFrequency()
	if common.SyncFrequency != 24*60*60 {
		t.Fatalf("maximum SyncFrequency changed to %d", common.SyncFrequency)
	}
}
