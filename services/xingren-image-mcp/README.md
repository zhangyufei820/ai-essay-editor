# Xingren Image MCP

让用户在本地 Codex 中使用自己的星人图像生成令牌创建或编辑图片。

## 用户安装

```bash
npx -y @xingren/codex-image-mcp install
```

按提示粘贴“星人图像生成令牌”，重启 Codex 后即可直接说“帮我生成一张课程封面图”。

## 发布前检查

```bash
npm test
npm publish --access public
```

发布需要维护者具备 `@xingren` npm scope 的发布权限。不要在发布日志、README 或命令示例中写入真实令牌。
