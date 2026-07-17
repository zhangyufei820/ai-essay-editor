# 特价文本渠道运维

该渠道固定使用 `discount` 分组和 `0.05` 倍率，只暴露与当前星人文本模型别名同名的上游模型。它不加入自动分组，用户令牌和外部 API 请求也不会跨组回退。

用户编辑“星人 Codex 文本令牌”选择 `discount` 或 `default` 时，系统把该选择保存为用户级文本倍率偏好，并同步旧版令牌别名。Classic 主页会话和云端 Codex 都读取同一偏好；主页在每次发送前重新确认，云端 Codex 的自动令牌校正也以该偏好为准。特价通道异常时不再自动切换原价，用户需要在接入设置中手动切到 `default`；恢复后切回 `discount`，三处会再次统一使用 `0.05x`。

## 密钥

上游密钥只允许通过 `DISCOUNT_UPSTREAM_API_KEY` 注入，不得写入仓库、命令参数、日志或聊天记录。

本机安全文件：

```text
/Users/aixingren/.shenxiang-secrets/new-api-discount.env
```

内容格式：

```text
DISCOUNT_UPSTREAM_API_KEY=轮换后的密钥
```

目录权限应为 `700`，文件权限应为 `600`。部署时复制到服务器 root 私密目录，服务器副本同样使用 `600`，不得放入项目目录或镜像。

## 上线

1. 先部署更新后的权限同步脚本，并按固定 upstream 基线构建新的不可变应用镜像，但暂不替换运行容器。
2. 加载 New API MySQL 环境和私密上游环境。
3. 不带 `--apply` 运行 `scripts/configure_discount_text_channel.py`，确认上游模型交集非空。
4. 带 `--apply` 再运行一次，原子写入 options、渠道和 abilities。
5. 立即用新镜像仅替换 `shenxiang-new-api` 应用容器，以刷新 60 秒运行时缓存；不得重建 MySQL、Redis、网络或卷。
6. 验证本机与公网健康、公开分组、模型交集、特价渠道隔离、钱包与月卡计费日志。

脚本使用与每 10 分钟权限同步相同的文件锁。若同步正在运行，脚本会拒绝写入，等待该轮结束后重试即可。

## 停用

渠道异常时运行：

```text
python3 scripts/configure_discount_text_channel.py --disable
```

停用会关闭保留 Tag 渠道及任何声明 `discount` 的冲突渠道，同时关闭全部 `discount` abilities，并从公开组和自动组中移除 `discount`。即使可见性 options 损坏，渠道仍会先停用，输出中的 `group_hidden` 会说明公开组是否同步隐藏。

随后必须仅刷新 `shenxiang-new-api` 应用容器并复查健康；脚本返回的 `runtime_cache_refresh_required` 在刷新前始终为 `true`。保留 `GroupRatio.discount=0.05`，用于保护停用瞬间的在途请求。

## 验证重点

- 普通用户和月卡用户都能在令牌中选择 `default` 或 `discount`。
- 新建/编辑令牌不能手工写入历史组；旧历史组令牌仍可鉴权和启停。
- `discount` 不出现在自动分组，且其 abilities 只指向保留 Tag 渠道。
- 模型广场只展示原价/特价组，特价倍率固定为 `0.05`。
- 上游响应中的成本字段不能覆盖特价静态计费。
- 月卡在特价组不再叠加月卡价值倍率，最终仍按模型广场价的 `0.05` 扣减。
