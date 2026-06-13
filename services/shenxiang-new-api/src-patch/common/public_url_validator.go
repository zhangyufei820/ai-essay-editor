package common

import (
	"fmt"
	"net/url"
	"strings"
)

func ValidatePublicHTTPURL(rawURL string) error {
	u, err := url.ParseRequestURI(rawURL)
	if err != nil {
		return err
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("url scheme must be http or https")
	}
	if strings.TrimSpace(u.Hostname()) == "" {
		return fmt.Errorf("url host is required")
	}
	return ValidateURLWithFetchSetting(rawURL, true, false, false, false, nil, nil, nil, true)
}
