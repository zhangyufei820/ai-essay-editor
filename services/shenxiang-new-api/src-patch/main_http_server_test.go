package main

import (
	"net/http"
	"testing"
)

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
