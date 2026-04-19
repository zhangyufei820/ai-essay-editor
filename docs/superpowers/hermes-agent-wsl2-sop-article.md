# 纯净 Windows 系统 WSL2 + Hermes Agent 全程无错 SOP

你有没有遇到过这种情况：照着网上教程装东西，到第三步报错了，然后花两小时排查，最后发现是代理没配置对。

今天这套 SOP，就是要把 Hermes Agent 在 Windows 上的安装做成一个"傻瓜相机"——只要你电脑支持虚拟化，按顺序复制粘贴命令，绝对不会报红。

## 这是什么，能干什么

Hermes Agent 是 NousResearch 出品的自我改进型 AI Agent（GitHub 100k ⭐），内置学习循环，能从经验中创建技能、跨会话记忆搜索。简单说，你装好之后，它会越用越懂你。

支持的模型：OpenRouter（200+ 模型）、OpenAI、X、NVIDIA NIM、小米 MiMo 等。

## 第一阶段：Windows 宿主机准备（开启"地基"）

在 Windows 搜索框输入 **PowerShell**，右键点击 **"以管理员身份运行"**。

⚠️ **必须是管理员权限**，普通打开会报错。

一键开启 WSL 环境：

```powershell
wsl --install
```

✅ **验证**：如果执行完提示"正在请求操作"，说明一切正常。**执行完后请务必重启电脑。**

重启后如果弹出一个黑色窗口安装 Ubuntu，那是最好的。如果没有弹出，再次打开 PowerShell 输入 `wsl`，确保能进入 Linux 环境。

## 第二阶段：WSL 内部网络调教（解决"墙"的问题）

WSL 安装好后，首先要解决它连不上 Windows 代理的问题。这是 90% 出错的根源。

**在 Windows 上操作：**

打开 Clash Verge，进入"设置"。找到 **"允许局域网" (Allow LAN)**，务必将其勾选为开启。

**在 WSL (Ubuntu) 终端操作：**

直接粘贴这两行（自动抓取宿主机 IP 并设置代理）：

```bash
export host_ip=$(grep -m 1 nameserver /etc/resolv.conf | awk '{print $2}')
export https_proxy="http://${host_ip}:7897"
export http_proxy="http://${host_ip}:7897"
```

✅ **验证**：输入 `curl -I https://www.google.com`。如果返回 `200 OK`，代理就彻底通了。

⚠️ 如果返回的是连接超时，先检查 Clash Verge 的"允许局域网"是否已开启，再检查 Windows 防火墙是否拦住了 7897 端口。

## 第三阶段：环境依赖补全（纯净系统必做）

WSL 的 Ubuntu 镜像非常精简，需要手动补齐工具。

```bash
# 1. 更新索引并安装 Python、Pip、Git
sudo apt update && sudo apt install python3 python3-pip git -y

# 2. 检查版本
python3 --version  # 需 >= 3.10
git --version
```

✅ **验证**：两条命令都返回版本号，无报错，即为成功。

## 第四阶段：项目安装与自动化配置

这一步我们将代码下载、依赖安装、以及 `hm` 命令的配置一气呵成。

```bash
# 1. 下载源码
cd ~
git clone https://github.com/NousResearch/hermes-agent.git
cd hermes-agent

# 2. 安装项目（强制使用国内镜像，防止下载超时）
pip3 install -e . -i https://pypi.tuna.tsinghua.edu.cn/simple
```

✅ **验证**：安装结束后，输入 `hermes --version`（或 `hm --version`，第五阶段后用别名），出现版本号即为成功。

⚠️ 如果 pip3 报 `ModuleNotFoundError: No module named 'ensurepip'`，
先执行：

```bash
sudo apt install python3-venv -y
```

再重试安装命令。

## 第五阶段：配置永久"一键启动"（SOP 的精髓）

为了让对方以后打开电脑直接输入 `hm` 就能用，我们需要把代理逻辑和别名写死。

**修改配置文件：**

```bash
cat >> ~/.bashrc <<EOF

# 自动处理 WSL 代理逻辑
host_ip=\$(grep -m 1 nameserver /etc/resolv.conf | awk '{print \$2}')
export https_proxy="http://\${host_ip}:7897"
export http_proxy="http://\${host_ip}:7897"

# 设置 hm 快捷命令
alias hm='cd ~/hermes-agent && hermes'
EOF
```

**激活配置：**

```bash
source ~/.bashrc
```

✅ **验证**：关掉终端，重新打开，输入 `echo $https_proxy`，如果返回 `http://172.x.x.x:7897`（一个 IP 地址），说明代理永久生效了。

## 第六阶段：最终验收

现在，告诉对方，他只需要做一件事：

1. 打开 WSL 终端
2. 输入 `hm`

如果一切配置正确，Hermes Agent 的 TUI 界面会直接出现，多行编辑、斜杠命令自动完成、流式输出——全部就绪。

---

## 给"远程专家"的避坑 Checklist

帮人远程装过上百台机器的经验，浓缩成这张清单：

### BIOS 拦截
如果第一步 `wsl --install` 报错，通常是因为电脑主板禁用了 Virtualization Technology。这需要进 BIOS 开启（远程帮人装时最难的一关，只能视频指导）。

**排查方法**：任务管理器 → 性能 → CPU，如果看到"虚拟化：已启用"则没问题。

### 防火墙拦截
如果代理不通，可能是 Windows 防火墙拦住了 Clash。让对方在 Windows 安全中心临时关闭公用网络防火墙，验证 `curl -I https://www.google.com` 返回 200 后，再把防火墙恢复。

### 模型填写
提醒对方，在配置界面（Provider）一定要选 **Custom** 并填入正确的 `gpt-4o` 这种标准模型名，千万别让他手抖填错了。

---

这套 SOP 把所有变量都固定成了常量。只要对方的硬件支持虚拟化，按着这几行代码贴过去，绝对不会报红。

下次有人再问你"Windows 上怎么装 Hermes"，直接把本文甩给他。
