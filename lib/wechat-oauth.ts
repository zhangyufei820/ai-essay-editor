// 微信开放平台OAuth 2.0配置
// 需要在微信开放平台申请网站应用：https://open.weixin.qq.com/

export const wechatConfig = {
  appId: process.env.WECHAT_APP_ID || "",
  appSecret: process.env.WECHAT_APP_SECRET || "",
  redirectUri: process.env.NEXT_PUBLIC_WECHAT_REDIRECT_URI || "",
}

// 生成微信登录URL
export function getWeChatAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    appid: wechatConfig.appId,
    redirect_uri: wechatConfig.redirectUri,
    response_type: "code",
    scope: "snsapi_login", // 网页应用使用snsapi_login
    state: state || "STATE",
  })

  return `https://open.weixin.qq.com/connect/qrconnect?${params.toString()}#wechat_redirect`
}

// 通过code获取access_token
export async function getWeChatAccessToken(code: string) {
  const params = new URLSearchParams({
    appid: wechatConfig.appId,
    secret: wechatConfig.appSecret,
    code,
    grant_type: "authorization_code",
  })

  const response = await fetch(`https://api.weixin.qq.com/sns/oauth2/access_token?${params.toString()}`)

  if (!response.ok) {
    throw new Error("获取access_token失败")
  }

  return response.json()
}

// 获取用户信息
export async function getWeChatUserInfo(accessToken: string, openid: string) {
  const params = new URLSearchParams({
    access_token: accessToken,
    openid,
  })

  const response = await fetch(`https://api.weixin.qq.com/sns/userinfo?${params.toString()}`)

  if (!response.ok) {
    throw new Error("获取用户信息失败")
  }

  return response.json()
}

// 刷新access_token
export async function refreshWeChatToken(refreshToken: string) {
  const params = new URLSearchParams({
    appid: wechatConfig.appId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  })

  const response = await fetch(`https://api.weixin.qq.com/sns/oauth2/refresh_token?${params.toString()}`)

  if (!response.ok) {
    throw new Error("刷新token失败")
  }

  return response.json()
}
