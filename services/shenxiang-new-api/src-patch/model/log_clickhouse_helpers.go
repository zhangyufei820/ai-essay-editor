package model

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
)

func clickHouseLogOrder(prefix string) string {
	return prefix + "created_at desc, " + prefix + "request_id desc"
}

func buildLogLikeCondition(column string, value string) (string, string, error) {
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		pattern := strings.ReplaceAll(value, `\`, `\\`)
		pattern = strings.ReplaceAll(pattern, "_", `\_`)
		return column + " LIKE ?", pattern, nil
	}
	pattern, err := sanitizeLikePattern(value)
	if err != nil {
		return "", "", err
	}
	return column + " LIKE ? ESCAPE '!'", pattern, nil
}

func ensureLogRequestId(log *Log) {
	if log == nil || strings.TrimSpace(log.RequestId) != "" {
		return
	}
	log.RequestId = common.NewRequestId()
}

func assignDisplayLogIds(logs []*Log, startIdx int) {
	for i := range logs {
		if logs[i] != nil {
			logs[i].Id = startIdx + i + 1
		}
	}
}
