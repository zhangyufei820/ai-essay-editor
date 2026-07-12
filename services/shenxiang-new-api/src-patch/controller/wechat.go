package controller

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

type wechatLoginResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Data    string `json:"data"`
}

type wechatLoginRequest struct {
	Code  string `json:"code"`
	State string `json:"state"`
}

func getWeChatIdByCode(ctx context.Context, code string) (string, error) {
	if code == "" {
		return "", errors.New("无效的参数")
	}
	req, err := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("%s/api/wechat/user?code=%s", common.WeChatServerAddress, url.QueryEscape(code)), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", common.WeChatServerToken)
	client := http.Client{
		Timeout: 5 * time.Second,
	}
	httpResponse, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer httpResponse.Body.Close()
	var res wechatLoginResponse
	err = json.NewDecoder(httpResponse.Body).Decode(&res)
	if err != nil {
		return "", err
	}
	if !res.Success {
		return "", errors.New(res.Message)
	}
	if res.Data == "" {
		return "", errors.New("验证码错误或已过期")
	}
	return res.Data, nil
}

func WeChatAuth(c *gin.Context) {
	if !common.WeChatAuthEnabled {
		c.JSON(http.StatusOK, gin.H{
			"message": "管理员未开启通过微信登录以及注册",
			"success": false,
		})
		return
	}
	var req wechatLoginRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"message": "无效的请求",
			"success": false,
		})
		return
	}
	stateClaims, err := consumeOAuthState(sessions.Default(c), req.State)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{
			"message": "登录状态已失效，请重试",
			"success": false,
		})
		return
	}
	code := req.Code
	wechatId, err := getWeChatIdByCode(c.Request.Context(), code)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"message": "微信登录失败，请重试",
			"success": false,
		})
		return
	}
	foundUser, found, err := model.LookupUserByOAuthIdentity(model.UserOAuthProviderWeChat, wechatId)
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgDatabaseError)
		return
	}
	user := model.User{WeChatId: wechatId}
	if found {
		if foundUser.DeletedAt.Valid {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "用户已注销",
			})
			return
		}
		user = *foundUser
	} else {
		if common.RegisterEnabled {
			if err := validateOAuthRegistrationConsent(stateClaims); err != nil {
				common.ApiErrorMsg(c, oauthRegistrationConsentMessage)
				return
			}
			user.Username = "wechat_" + strconv.Itoa(model.GetMaxUserId()+1)
			user.DisplayName = "WeChat User"
			user.Role = common.RoleCommonUser
			user.Status = common.UserStatusEnabled

			if err := user.Insert(0); err != nil {
				if !errors.Is(err, model.ErrUserOAuthIdentityAlreadyBound) {
					_, identityFound, lookupErr := model.LookupUserByOAuthIdentity(model.UserOAuthProviderWeChat, wechatId)
					if lookupErr != nil {
						common.ApiErrorI18n(c, i18n.MsgDatabaseError)
						return
					}
					if identityFound {
						err = model.ErrUserOAuthIdentityAlreadyBound
					}
				}
				if writeOAuthIdentityError(c, "WeChat", err) {
					return
				}
				common.ApiErrorI18n(c, i18n.MsgDatabaseError)
				return
			}
		} else {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "管理员关闭了新用户注册",
			})
			return
		}
	}

	if user.Status != common.UserStatusEnabled {
		c.JSON(http.StatusOK, gin.H{
			"message": "用户已被封禁",
			"success": false,
		})
		return
	}
	completeLogin(&user, c)
}

type wechatBindRequest struct {
	Code string `json:"code"`
}

func WeChatBind(c *gin.Context) {
	if !common.WeChatAuthEnabled {
		c.JSON(http.StatusOK, gin.H{
			"message": "管理员未开启通过微信登录以及注册",
			"success": false,
		})
		return
	}
	var req wechatBindRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "无效的请求",
		})
		return
	}
	code := req.Code
	wechatId, err := getWeChatIdByCode(c.Request.Context(), code)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"message": "微信绑定失败，请重试",
			"success": false,
		})
		return
	}
	identityTaken, err := model.IsUserOAuthIdentityTaken(model.UserOAuthProviderWeChat, wechatId)
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgDatabaseError)
		return
	}
	if identityTaken {
		writeOAuthIdentityError(c, "WeChat", model.ErrUserOAuthIdentityAlreadyBound)
		return
	}
	userID := c.GetInt("id")
	if userID <= 0 {
		writeOAuthBindAuthenticationError(c, errOAuthBindSessionInvalid)
		return
	}
	user, err := model.GetUserById(userID, false)
	if err != nil {
		writeOAuthBindAuthenticationError(c, err)
		return
	}
	if user.Status != common.UserStatusEnabled {
		writeOAuthBindAuthenticationError(c, errOAuthBindUserDisabled)
		return
	}
	err = user.SetOAuthIdentity(model.UserOAuthProviderWeChat, wechatId)
	if err != nil {
		if writeOAuthIdentityError(c, "WeChat", err) {
			return
		}
		common.ApiErrorI18n(c, i18n.MsgDatabaseError)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}
