import type { ShenxiangInterfaceIconName } from "./ShenxiangInterfaceIcons"

export const SHENXIANG_INTERFACE_ICON_CATALOG: Array<{
  name: ShenxiangInterfaceIconName
  title: string
  group: "导航入口" | "用户与账户" | "通用操作" | "状态反馈"
  note: string
}> = [
  { name: "help", title: "帮助", group: "导航入口", note: "疑问节点，不用普通问号圆圈" },
  { name: "share", title: "分享", group: "导航入口", note: "三点传播结构，适合邀请和报告分享" },
  { name: "openclaw", title: "OpenClaw", group: "导航入口", note: "保留智能抓取感，但不碰官方模型 logo" },
  { name: "education", title: "教育专区", group: "导航入口", note: "克制学位帽，偏产品入口而非学校插画" },
  { name: "top-models", title: "顶级模型", group: "导航入口", note: "模型芯片，不替代官方 logo" },
  { name: "ai-writing", title: "AI 写作专区", group: "导航入口", note: "文档与生成笔触结合" },
  { name: "creative", title: "多媒体专区", group: "导航入口", note: "图片画框与生成山形" },
  { name: "history", title: "历史", group: "导航入口", note: "时间回环，适合会话历史" },
  { name: "user-avatar", title: "用户头像", group: "用户与账户", note: "默认头像和账户入口共用" },
  { name: "settings", title: "设置", group: "用户与账户", note: "精简齿轮，不用机械复杂感" },
  { name: "credits", title: "积分", group: "用户与账户", note: "能量星币，和业务积分统一" },
  { name: "invite", title: "邀请", group: "用户与账户", note: "礼盒但去节庆化，可长期使用" },
  { name: "upgrade", title: "升级会员", group: "用户与账户", note: "权益盾牌和上升箭头" },
  { name: "logout", title: "退出", group: "用户与账户", note: "门与方向箭头，低侵扰" },
  { name: "menu", title: "菜单", group: "通用操作", note: "移动端侧栏入口" },
  { name: "close", title: "关闭", group: "通用操作", note: "关闭弹层、面板和移动菜单" },
  { name: "back", title: "返回", group: "通用操作", note: "返回上一页" },
  { name: "upload", title: "上传", group: "通用操作", note: "上传文件和头像" },
  { name: "download", title: "下载", group: "通用操作", note: "导出报告、保存图片" },
  { name: "copy", title: "复制", group: "通用操作", note: "复制邀请码、回答和链接" },
  { name: "camera", title: "相机", group: "通用操作", note: "头像上传和图片输入" },
  { name: "mail", title: "邮箱", group: "通用操作", note: "登录和账户资料" },
  { name: "phone", title: "电话", group: "通用操作", note: "手机号登录和客服联系" },
  { name: "success", title: "成功", group: "状态反馈", note: "确认操作完成" },
  { name: "warning", title: "警告", group: "状态反馈", note: "柔和风险提示" },
  { name: "loading", title: "处理中", group: "状态反馈", note: "模型生成、支付和上传等待" },
]
