# 📡 外部 Uptime 监控设置指南

本文档指导如何设置外部 uptime 监控，确保您的网站 `shenxiang.school` 24/7 可用。

## 🎯 监控目标

- **监控地址**: https://shenxiang.school
- **检查间隔**: 5 分钟
- **告警阈值**: 连续 3 次失败才告警（避免误报）
- **告警方式**: 邮件通知到 support@shenxiang.school

## 🛠️ 推荐工具：UptimeRobot（免费）

UptimeRobot 提供免费的网站监控服务，非常适合中小型项目。

### 第一步：注册账号

1. 访问 [UptimeRobot 官网](https://uptimerobot.com/)
2. 点击 **"Register for FREE"** 按钮
3. 填写邮箱和密码，完成注册
4. 登录邮箱，点击验证链接激活账号

### 第二步：添加监控

1. 登录后，点击 **"+ Add New Monitor"** 按钮
2. 填写以下信息：

| 配置项 | 值 |
|--------|-----|
| Monitor Type | HTTP(s) |
| Friendly Name | 沈翔学校主站 |
| URL (or IP) | https://shenxiang.school |
| Monitoring Interval | 5 minutes |

3. 点击 **"Create Monitor"** 完成创建

### 第三步：设置告警通知

1. 点击顶部菜单 **"My Settings"**
2. 找到 **"Alert Contacts & Notifications"** 部分
3. 点击 **"+ Add New Alert Contact"**
4. 填写：

| 配置项 | 值 |
|--------|-----|
| Alert Contact Type | Email |
| Friendly Name | 神翔客服邮箱 |
| Email Address | support@shenxiang.school |

5. 保存后，返回监控列表
6. 点击刚创建的监控 → **"Edit"** → **"Alert Contacts & Notifications"**
7. 勾选刚创建的告警联系人

### 第四步：设置告警阈值

1. 在监控的 **"Edit"** 页面，找到 **"Alert when..."** 部分
2. 设置 **"Down after..."** 为 **3 consecutive fails**
3. 确保 **"Up after..."** 为 **1 consecutive success**（恢复后立即通知）

## 📋 监控类型说明

### HTTP(s) 监控（推荐）

- 检查网站是否正常返回 HTTP 200 状态码
- 可设置关键词检查（如页面包含"沈翔"）
- 响应时间监控

### Ping 监控

- 基础的网络连通性检查
- 不检测应用层问题

### Port 监控

- 检查特定端口是否开放
- 如：22 (SSH)、80 (HTTP)、443 (HTTPS)

## 🚨 告警阈值最佳实践

### 为什么设置连续 3 次失败？

1. **避免网络抖动误报**：互联网偶尔会有短暂的网络波动
2. **DNS 解析延迟**：某些地区的 DNS 可能会临时超时
3. **CDN 问题**：内容分发网络可能有短暂的节点问题

### 何时使用更严格的阈值？

- **1 次失败告警**：适用于极其关键的服务（如支付系统）
- **2 次失败告警**：一般生产环境
- **3 次失败告警**：大多数网站的推荐配置（本项目采用）

## 📊 监控仪表板

UptimeRobot 提供免费的公开状态页面：

1. 点击 **"My Settings"** → **"Monitors"**
2. 选择你的监控 → **"Status Page"**
3. 点击 **"+ Add Monitor to Status Page"**
4. 可生成类似 `https://stats.uptimerobot.com/YOUR_ID` 的公开页面

## 🔔 告警邮件模板示例

当网站宕机时，您会收到类似邮件：

```
Subject: [ALERT] 沈翔学校主站 - DOWN

Monitor: 沈翔学校主站
URL: https://shenxiang.school
Status: DOWN
Reason: HTTP Error 502 (Bad Gateway)
Time: 2026-04-17 17:30:00 UTC
```

恢复后：

```
Subject: [RESOLVED] 沈翔学校主站 - UP

Monitor: 沈翔学校主站
URL: https://shenxiang.school
Status: UP
Time: 2026-04-17 17:35:00 UTC
Duration: 5 minutes
```

## 📝 维护清单

- [ ] 每月检查监控是否正常运行
- [ ] 确保告警邮箱可以正常接收邮件
- [ ] 定期查看历史报告，分析可用性趋势
- [ ] 如果更换服务器或域名，及时更新监控地址

## 💡 进阶配置（可选）

### Webhook 告警

可将告警推送到企业微信、钉钉、Slack 等：

1. 在 UptimeRobot 设置 Webhook
2. 配置接收告警的 URL
3. 自定义告警消息格式

### API 监控

如果需要监控 API 接口：

1. Monitor Type 选择 **HTTP(s)**
2. 填写 API 地址，如 `https://shenxiang.school/api/health`
3. 可设置自定义 Headers 和请求方法

---

**创建日期**: 2026-04-17  
**维护人**: 运维团队  
**文档版本**: v1.0