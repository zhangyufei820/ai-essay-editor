# 特价文本渠道运维

该渠道固定使用 `discount` 分组和 `0.05` 倍率，只暴露与当前星人文本模型别名同名的上游模型。它不加入自动分组，用户令牌和外部 API 请求也不会跨组回退。

Classic 主页文本工作台是唯一例外：受支持的 OpenAI 文本模型优先请求 `discount`，并使用明确的最大输出上限；只有在尚未向用户输出任何内容、错误明确属于渠道可用性问题且成功补足 `default` 预扣额度时，后端才会最多回退一次。原价预扣必须包含最大输出的补全倍率，钱包扣减使用带余额条件的原子更新，月卡继续使用订阅额度原子校验。若请求在进入计费前因特价分组或能力不可用而失败，主页可改用 `default` 重新发起一次请求。钱包或月卡额度不足时不调用原价渠道，任何已开始输出或已被用户取消的流式响应也不得回退，最终回复必须标明实际使用 `0.05x` 或 `1x`。

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
