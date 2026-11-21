package service

import (
	"errors"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
)

func usesLiveChannelSelection(group string, requestPath string) bool {
	switch requestPath {
	case "/v1/messages":
		return IsPublicClaudeTokenGroup(group)
	case "/v1/responses", "/v1/responses/compact", "/v1/completions", "/v1/chat/completions", "/pg/chat/completions":
		return group == "default" || group == DiscountPricingGroupName || group == PlusPricingGroupName || group == SpecialPricingGroupName || IsPublicClaudeTokenGroup(group)
	default:
		return false
	}
}

func channelAllowedOnPath(group, requestPath string) bool {
	return group != ClaudeTerminalPricingGroupName || requestPath == "/v1/messages"
}

func PreferredChannelEligible(c *gin.Context, group, modelName string, preferred *model.Channel) bool {
	requestPath := c.Request.URL.Path
	if !channelAllowedOnPath(group, requestPath) || !model.ChannelSupportsRelayPath(preferred, requestPath, modelName) {
		return false
	}
	if usesLiveChannelSelection(group, requestPath) || HasExplicitTokenGroupChain(c) {
		channel, err := model.SelectLiveChannelForGroupModel(group, modelName, requestPath, nil, preferred.Id)
		return err == nil && channel != nil && channel.Id == preferred.Id
	}
	return model.IsChannelCurrentPriorityForGroupModel(group, modelName, preferred.Id)
}

func (p *RetryParam) selectChannel(group string, retry int, live bool) (*model.Channel, error) {
	if live && !channelAllowedOnPath(group, p.RequestPath) {
		return nil, nil
	}
	if !live && !usesLiveChannelSelection(group, p.RequestPath) {
		return model.GetRandomSatisfiedChannel(group, p.ModelName, retry, p.RequestPath)
	}
	used := p.Ctx.GetStringSlice("use_channel")
	tried := make([]int, 0, len(used))
	for _, raw := range used {
		if id, err := strconv.Atoi(raw); err == nil && id > 0 {
			tried = append(tried, id)
		}
	}
	return model.SelectLiveChannelForGroupModel(group, p.ModelName, p.RequestPath, tried, 0)
}

func GetTokenGroupChain(c *gin.Context) []string {
	if c == nil {
		return nil
	}
	groups := common.GetContextKeyStringSlice(c, constant.ContextKeyTokenGroupChain)
	return append([]string(nil), groups...)
}

func HasExplicitTokenGroupChain(c *gin.Context) bool {
	return len(GetTokenGroupChain(c)) > 1
}

func SetTokenGroupChain(c *gin.Context, groups []string) {
	if c == nil {
		return
	}
	groups = append([]string(nil), groups...)
	common.SetContextKey(c, constant.ContextKeyTokenGroupChain, groups)
	common.SetContextKey(c, constant.ContextKeyTokenGroupChainIndex, 0)
	common.SetContextKey(c, constant.ContextKeyTokenGroupChainRetryIndex, 0)
	if len(groups) > 0 {
		common.SetContextKey(c, constant.ContextKeyTokenGroup, groups[0])
		common.SetContextKey(c, constant.ContextKeyUsingGroup, groups[0])
		common.SetContextKey(c, constant.ContextKeyAutoGroup, groups[0])
	}
}

func MarkTokenGroupChainSelected(c *gin.Context, group string) {
	groups := GetTokenGroupChain(c)
	if len(groups) <= 1 {
		return
	}
	for index, candidate := range groups {
		if candidate != group {
			continue
		}
		// Keep the next fallback group as the chain index. Callers outside the
		// selector rely on this value to determine whether the chain is exhausted.
		common.SetContextKey(c, constant.ContextKeyTokenGroupChainIndex, index+1)
		common.SetContextKey(c, constant.ContextKeyUsingGroup, group)
		common.SetContextKey(c, constant.ContextKeyAutoGroup, group)
		return
	}
}

type RetryParam struct {
	Ctx          *gin.Context
	TokenGroup   string
	ModelName    string
	RequestPath  string
	Retry        *int
	resetNextTry bool
}

func (p *RetryParam) GetRetry() int {
	if p.Retry == nil {
		return 0
	}
	return *p.Retry
}

func (p *RetryParam) SetRetry(retry int) {
	p.Retry = &retry
}

func (p *RetryParam) IncreaseRetry() {
	if p.resetNextTry {
		p.resetNextTry = false
		return
	}
	if p.Retry == nil {
		p.Retry = new(int)
	}
	*p.Retry++
}

func (p *RetryParam) ResetRetryNextTry() {
	p.resetNextTry = true
}

// CacheGetRandomSatisfiedChannel tries to get a random channel that satisfies the requirements.
// 尝试获取一个满足要求的随机渠道。
//
// For "auto" tokenGroup with cross-group Retry enabled:
// 对于启用了跨分组重试的 "auto" tokenGroup：
//
//   - Each group will exhaust all its priorities before moving to the next group.
//     每个分组会用完所有优先级后才会切换到下一个分组。
//
//   - Uses ContextKeyAutoGroupIndex to track current group index.
//     使用 ContextKeyAutoGroupIndex 跟踪当前分组索引。
//
//   - Uses ContextKeyAutoGroupRetryIndex to track the global Retry count when current group started.
//     使用 ContextKeyAutoGroupRetryIndex 跟踪当前分组开始时的全局重试次数。
//
//   - priorityRetry = Retry - startRetryIndex, represents the priority level within current group.
//     priorityRetry = Retry - startRetryIndex，表示当前分组内的优先级级别。
//
//   - When GetRandomSatisfiedChannel returns nil (priorities exhausted), moves to next group.
//     当 GetRandomSatisfiedChannel 返回 nil（优先级用完）时，切换到下一个分组。
//
// Example flow (2 groups, each with 2 priorities, RetryTimes=3):
// 示例流程（2个分组，每个有2个优先级，RetryTimes=3）：
//
//	Retry=0: GroupA, priority0 (startRetryIndex=0, priorityRetry=0)
//	         分组A, 优先级0
//
//	Retry=1: GroupA, priority1 (startRetryIndex=0, priorityRetry=1)
//	         分组A, 优先级1
//
//	Retry=2: GroupA exhausted → GroupB, priority0 (startRetryIndex=2, priorityRetry=0)
//	         分组A用完 → 分组B, 优先级0
//
//	Retry=3: GroupB, priority1 (startRetryIndex=2, priorityRetry=1)
//	         分组B, 优先级1
func CacheGetRandomSatisfiedChannel(param *RetryParam) (*model.Channel, string, error) {
	var channel *model.Channel
	var err error
	selectGroup := param.TokenGroup
	userGroup := common.GetContextKeyString(param.Ctx, constant.ContextKeyUserGroup)

	groupChain := GetTokenGroupChain(param.Ctx)
	if len(groupChain) > 1 && param.TokenGroup != "auto" {
		start := common.GetContextKeyInt(param.Ctx, constant.ContextKeyTokenGroupChainIndex)
		if start > 0 && param.GetRetry() > 0 {
			// The cursor points after the selected group. On retries, first
			// try its remaining channels before moving to the next group.
			start--
		}
		for index := start; index < len(groupChain); index++ {
			group := groupChain[index]
			channel, err = param.selectChannel(group, 0, true)
			if err != nil {
				return nil, group, err
			}
			if channel != nil {
				MarkTokenGroupChainSelected(param.Ctx, group)
				return channel, group, nil
			}
		}
		return nil, selectGroup, nil
	}

	if param.TokenGroup == "auto" {
		if len(setting.GetAutoGroups()) == 0 {
			return nil, selectGroup, errors.New("auto groups is not enabled")
		}
		autoGroups := GetUserAutoGroup(userGroup)

		// startGroupIndex: the group index to start searching from
		// startGroupIndex: 开始搜索的分组索引
		startGroupIndex := 0
		crossGroupRetry := common.GetContextKeyBool(param.Ctx, constant.ContextKeyTokenCrossGroupRetry)

		if lastGroupIndex, exists := common.GetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex); exists {
			if idx, ok := lastGroupIndex.(int); ok {
				startGroupIndex = idx
			}
		}

		for i := startGroupIndex; i < len(autoGroups); i++ {
			autoGroup := autoGroups[i]
			// Calculate priorityRetry for current group
			// 计算当前分组的 priorityRetry
			priorityRetry := param.GetRetry()
			// If moved to a new group, reset priorityRetry and update startRetryIndex
			// 如果切换到新分组，重置 priorityRetry 并更新 startRetryIndex
			if i > startGroupIndex {
				priorityRetry = 0
			}
			logger.LogDebug(param.Ctx, "Auto selecting group: %s, priorityRetry: %d", autoGroup, priorityRetry)

			channel, _ = param.selectChannel(autoGroup, priorityRetry, false)
			if channel == nil {
				// Current group has no available channel for this model, try next group
				// 当前分组没有该模型的可用渠道，尝试下一个分组
				logger.LogDebug(param.Ctx, "No available channel in group %s for model %s at priorityRetry %d, trying next group", autoGroup, param.ModelName, priorityRetry)
				// 重置状态以尝试下一个分组
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex, i+1)
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupRetryIndex, 0)
				// Reset retry counter so outer loop can continue for next group
				// 重置重试计数器，以便外层循环可以为下一个分组继续
				param.SetRetry(0)
				continue
			}
			common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroup, autoGroup)
			selectGroup = autoGroup
			logger.LogDebug(param.Ctx, "Auto selected group: %s", autoGroup)

			// Prepare state for next retry
			// 为下一次重试准备状态
			if crossGroupRetry && priorityRetry >= common.RetryTimes {
				// Current group has exhausted all retries, prepare to switch to next group
				// This request still uses current group, but next retry will use next group
				// 当前分组已用完所有重试次数，准备切换到下一个分组
				// 本次请求仍使用当前分组，但下次重试将使用下一个分组
				logger.LogDebug(param.Ctx, "Current group %s retries exhausted (priorityRetry=%d >= RetryTimes=%d), preparing switch to next group for next retry", autoGroup, priorityRetry, common.RetryTimes)
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex, i+1)
				// Reset retry counter so outer loop can continue for next group
				// 重置重试计数器，以便外层循环可以为下一个分组继续
				param.SetRetry(0)
				param.ResetRetryNextTry()
			} else {
				// Stay in current group, save current state
				// 保持在当前分组，保存当前状态
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex, i)
			}
			break
		}
	} else {
		channel, err = param.selectChannel(param.TokenGroup, param.GetRetry(), false)
		if err != nil {
			return nil, param.TokenGroup, err
		}
	}
	return channel, selectGroup, nil
}
