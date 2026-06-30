package model

import (
	"errors"
)

type SubscriptionLimitError struct {
	Reason string
}

func (e *SubscriptionLimitError) Error() string {
	switch e.Reason {
	case "concurrency":
		return "subscription concurrency limit exceeded"
	case "monthly":
		return "subscription monthly quota insufficient"
	case "daily":
		return "subscription quota insufficient"
	default:
		return "subscription limit exceeded"
	}
}

func IsSubscriptionHardLimitError(err error) bool {
	var limitErr *SubscriptionLimitError
	return errors.As(err, &limitErr)
}
