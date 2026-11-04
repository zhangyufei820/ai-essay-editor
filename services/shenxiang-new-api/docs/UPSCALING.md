# 媒体工坊高清放大

仅适用于隔离 New API。公开模型为“精准放大”和“创意放大”；使用说明 `/pg/upscale/help`，媒体工坊入口 `/console/media-playground`。

## 定价

`UpscalePricingCNY` 选项采用 `per_credit_by_scale`。2/4/8/16 倍积分人民币单价分别为 `0.613/90`、`2.252/360`、`8.508/1440`、`8.921/1530`。两模型相同。用户于 2026-11-04 确认按倍数分别校准积分单价，其他尺寸按文档积分档位。

每一级 2 倍处理按输入像素计算：≤130万为90积分，≤300万180积分，≤640万270积分，≤2530万1080积分；多级累计。最终像素≤101200000。示例：1000×1000 的2/4/8倍约¥0.613/2.252/8.508；500×500的16倍约¥8.921。

实际 wallet quota=ceil(CNY/汇率*QuotaPerUnit)，返还展示金额按 quota 反算；不应用分组折扣、不消费月卡额度。固定 ModelPrice 仅作兼容目录占位，通用 relay 禁止这两个模型，必须使用专用接口。

## 状态与计费

预扣与 Task、消费日志同一事务，锁住用户行防并发。幂等键对用户隔离；同键不同请求409。预扣前不发送上游请求。

- 已明确未发出或上游拒绝受理：单次事务退回 wallet/token quota并写退款日志。
- 已受理：charged，失败、无结果不自动退款。
- 发送后响应不明：UNKNOWN/uncertain，不重发POST、不自动退款；保留记录核查。
- 受理回执先写私有缓存目录 `.upscale-receipts`，可恢复数据库事务；仅重试GET。
- 普通任务扫描排除本平台，专用 reconciler 负责处理。

## 发布与回退

先按 RELEASE-GOVERNANCE 正式发布代码。私密600文件放仓库外；`configure_upscale_channels.py --stage --apply --secrets-file ... --pricing-file ...` 校验两枚独立令牌的模型权限，快照保存在受保护 release-state，创建internal链路，仅管理员图像令牌先测。脚本需加载既有 New API 环境到进程，禁止输出环境或密钥。

测试通过后 `--publish --apply` 开放公开分组并同步托管图像令牌；失败时退回internal并关闭公开abilities。需要撤回时只将两条专用tag渠道分组改internal并关闭公开abilities，不修改其他渠道、用户余额或主站。已有任务结果仍受用户所有权和模型限制校验。

每次模型同步保留专用tag与模型一一对应，防止借用其他供应商/令牌。下载通过专用artifact入口刷新，跨域不转发认证，验证格式与尺寸后缓存到用户目录。下载链接遵循既有媒体缓存保留时间。

## 验证

Go contract包含 controller/model/service `TestUpscale*` 和 middleware专用接口测试；Python `test_configure_upscale_channels`、`test_sync_app_model_permissions`；Node `upscale-utils.test.mjs`；classic构建和桌面/手机用户路径。线上仅使用user_id=1管理员令牌测试估价、两模式最小2倍提交、轮询、下载和实际CNY流水。
