package model

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

func clickHouseLogOrder(prefix string) string {
	return prefix + "created_at desc, " + prefix + "request_id desc"
}

func buildLogLikeCondition(column string, value string) (string, string, error) {
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		pattern, err := sanitizeClickHouseLikePattern(value)
		if err != nil {
			return "", "", err
		}
		return column + " LIKE ?", pattern, nil
	}
	pattern, err := sanitizeLikePattern(value)
	if err != nil {
		return "", "", err
	}
	return column + " LIKE ? ESCAPE '!'", pattern, nil
}

func sanitizeClickHouseLikePattern(input string) (string, error) {
	input = strings.ReplaceAll(input, `\`, `\\`)
	input = strings.ReplaceAll(input, "_", `\_`)

	if strings.Contains(input, "%%") {
		return "", errors.New("搜索模式中不允许包含连续的 % 通配符")
	}
	wildcardCount := strings.Count(input, "%")
	if wildcardCount > 2 {
		return "", errors.New("搜索模式中最多允许包含 2 个 % 通配符")
	}
	if wildcardCount > 0 && len(strings.ReplaceAll(input, "%", "")) < 2 {
		return "", errors.New("使用模糊搜索时，关键词长度至少为 2 个字符")
	}
	return input, nil
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
