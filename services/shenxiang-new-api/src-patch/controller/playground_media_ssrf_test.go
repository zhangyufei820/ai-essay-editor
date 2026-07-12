package controller

import (
	"context"
	"errors"
	"net"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDialValidatedPlaygroundMediaAddressPinsValidatedIP(t *testing.T) {
	dialErr := errors.New("dial stopped by test")
	dialAddress := ""

	_, err := dialValidatedPlaygroundMediaAddress(
		context.Background(),
		"tcp",
		"media.example:443",
		func(_ context.Context, host string) ([]net.IPAddr, error) {
			require.Equal(t, "media.example", host)
			return []net.IPAddr{{IP: net.ParseIP("93.184.216.34")}}, nil
		},
		func(_ context.Context, network, address string) (net.Conn, error) {
			require.Equal(t, "tcp", network)
			dialAddress = address
			return nil, dialErr
		},
	)

	require.ErrorIs(t, err, dialErr)
	require.Equal(t, "93.184.216.34:443", dialAddress)
}

func TestDialValidatedPlaygroundMediaAddressRejectsPrivateResolution(t *testing.T) {
	dialCalled := false

	_, err := dialValidatedPlaygroundMediaAddress(
		context.Background(),
		"tcp",
		"media.example:443",
		func(_ context.Context, _ string) ([]net.IPAddr, error) {
			return []net.IPAddr{{IP: net.ParseIP("127.0.0.1")}}, nil
		},
		func(_ context.Context, _, _ string) (net.Conn, error) {
			dialCalled = true
			return nil, nil
		},
	)

	require.ErrorContains(t, err, "private media address")
	require.False(t, dialCalled)
}
