# GPT-6.2 模型接入与人民币计费

仅适用于独立 New API。两款公开模型为 `gpt-6.2-sol`、`gpt-6.2-astra`，支持 Responses 与 Chat Completions，开放给全部启用用户。系统 Codex 令牌、普通受限文本令牌及多分组链沿用原路由偏好；图像和视频专用令牌保持各自用途。

## 售价

单位为人民币 / 百万 Token，所有用户均固定 1X，分组、个人特殊倍率、特价分组和月卡文本折扣均不叠加。

| 模型 / 档位 | 输入 | 输出 | 缓存读取 | 缓存写入 | 缓存写入（12小时） |
|---|---:|---:|---:|---:|---:|
| Sol 基础 | ¥2 | ¥10 | ¥0.10 | ¥2.50 | ¥5 |
| Sol 长上下文 | ¥4 | ¥15 | ¥0.20 | ¥5 | ¥10 |
| Astra 基础 | ¥8 | ¥40 | ¥0.40 | ¥10 | ¥20 |
| Astra 长上下文 | ¥16 | ¥60 | ¥0.80 | ¥20 | ¥40 |

完整输入长度 **≤272,000 Token** 使用基础档；**>272,000 Token** 整轮请求使用长上下文档。判档长度包含缓存。输入中的缓存读写按各自单价计算一次，不再重复按普通输入收费。输出长度不参与输入阈值判断。

12小时用量来自上游响应 `usage.input_tokens_details.cache_write_tokens_details.ttl_12h_tokens`，Chat 格式为对应 `prompt_tokens_details`；普通缓存分项为 `ttl_30m_tokens`。总写入量兼容 `cache_write_tokens`、`cached_creation_tokens` 和 TTL 分项，分项不是额外用量。没有明确 12小时用量时不得根据请求参数猜测。内部表达式使用 `cc12h`，只在显式引用它的规则里拆分 `cc`，旧模型通用缓存规则保持原语义。

价格配置及用户权限真源为 `scripts/sync_app_model_permissions.py`；固定1X运行时由 `service.IsGpt6FixedMarketplaceModel` 在个人/分组倍率分支前处理；月卡只加入可用模型名单，不加入折扣模型名单。前端展示也固定1X。

## 线路与对账

`configure_gpt6_astra_channel.py` 的 `GPT6_MODEL_PROFILE=sol62/astra62` 分别维护两款模型，每款8个既有文本路由分组、每组3条独立供应商线路。只启用经过 Models、Responses、Chat、Codex工具往返检查的来源。来源标签是内部凭证身份，不以历史标签名称猜测实际供应商。

2026-11-19 三轮短文本流式测速后，Sol 优先 AIHub，其次 wangwang.sbs、PDHLZY；Astra 优先 wangwang.sbs，其次 AIHub、PDHLZY。优先级是测量当时的配置，不代表长期性能保证。用户界面不得暴露供应商、内部标签、地址或频道号。

周期同步脚本从线上 release manifest 固定的 checkout 运行，保留模型价格、分组能力和令牌授权。新用户由系统令牌对账创建入口，再由权限同步补齐精确模型列表。

## 验证与回滚

发布遵循 `RELEASE-GOVERNANCE.md`，仅使用受保护发布脚本。运行 `python3 -m unittest discover -s services/shenxiang-new-api/scripts -p 'test_gpt62_models.py'`、`node services/shenxiang-new-api/scripts/check-gpt62-pricing-ui.mjs` 及 release Go 契约测试。阈值、12小时与普通缓存混合、倍率、月卡和实际结算差异均由测试覆盖。

生产应用前保存仅含本次模型配置和权限的0600快照，存放仓库外 release-state 目录。回滚应先停用新增模型能力与新增渠道，再按快照恢复这两个模型的价格/目录和新增令牌权限；不改用户余额、不重写既有日志、不回退其他模型配置。代码回滚通过生产分支后续修复提交与受保护发布完成，禁止倒退部署旧提交。
