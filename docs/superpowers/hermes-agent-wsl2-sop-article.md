# 纯净 Windows 系统 WSL2 + Hermes Agent 全程无错 SOP

装过开发环境的同学，大概都懂这种痛——按教程做到第三步，弹出来一个红框。然后开始搜报错信息，看了三个帖子，试了四种方法，最后发现是某个配置没对上。

今天这套 SOP，就是把 Hermes Agent 在 Windows 上的安装做成"傻瓜相机"——只要电脑支持虚拟化，复制粘贴命令，不会红。

## 这是啥，能干啥

Hermes Agent 是 NousResearch 出的自我进化型 AI 助手，GitHub 10 万星。装好之后，它会从你的使用习惯里学习，越用越懂你。

支持接 OpenRouter（200+ 模型）、OpenAI、X、NVIDIA NIM、小米 MiMo 等。

## 第一阶段：Windows 准备（把开关打开）

在 Windows 搜索框输入 **PowerShell**，右键点 **"以管理员身份运行"**。

⚠️ **必须是管理员**，普通打开等会会报错。

一键安装 WSL：

```powershell
wsl --install
```

✅ **验证**：弹窗点"是"，然后**必须重启电脑**。

重启后如果弹出黑色窗口在装 Ubuntu，说明一切顺利。没弹的话，再开一个 PowerShell，输入 `wsl` 能进 Linux 就行。

## 第二阶段：让 WSL 能正常上网（这步最关键）

装完 WSL，第一件事是要让它能访问外网。这步搞不定，后面的命令都会超时。

**在 Windows 上操作：**

打开你的网络加速工具（ Surge、Stash、Clash 等），进设置，把 **"允许局域网"** 或同类型选项打开。

**在 WSL 终端操作：**

直接粘贴这两行（自动识别 Windows 宿主机 IP）：

```bash
export host_ip=$(grep -m 1 nameserver /etc/resolv.conf | awk '{print $2}')
export https_proxy="http://${host_ip}:你的端口"
export http_proxy="http://${host_ip}:你的端口"
```

⚠️ `你的端口` 改成你网络加速工具的端口，Surge/Stash/Clash 系一般是 `7897`，不确定的去工具设置里查。

✅ **验证**：输入 `curl -I https://www.google.com`。返回 `200` 就通了；超时的话回头检查"允许局域网"有没有开。

## 第三阶段：装基础工具（纯净镜像必做）

WSL 自带的 Ubuntu 镜像非常干净，Python、Git 都没装，要手动补。

```bash
# 1. 更新索引，装 Python、Git
sudo apt update && sudo apt install python3 python3-pip git -y

# 2. 确认版本
python3 --version  # 需要 >= 3.10
git --version
```

✅ **验证**：两条命令都返回版本号，没报错就是成功。

## 第四阶段：下载 Hermes Agent

```bash
# 1. 拉代码
cd ~
git clone https://github.com/NousResearch/hermes-agent.git
cd hermes-agent

# 2. 安装依赖（国内建议用清华源，防超时）
pip3 install -e . -i https://pypi.tuna.tsinghua.edu.cn/simple
```

✅ **验证**：装完输入 `hermes --version`，出来版本号就 OK。

⚠️ 如果报错 `ModuleNotFoundError: No module named 'ensurepip'`，先跑：

```bash
sudo apt install python3-venv -y
```

再重试上面的安装命令。

## 第五阶段：配置"一键启动"（精髓在这）

以后每次开机，只需要输入 `hm` 就能启动，不用每次都 cd 进去。

把下面这段粘贴到终端，会自动写入配置：

```bash
cat >> ~/.bashrc <<EOF

# 自动设置网络通道
host_ip=\$(grep -m 1 nameserver /etc/resolv.conf | awk '{print \$2}')
export https_proxy="http://\${host_ip}:你的端口"
export http_proxy="http://\${host_ip}:你的端口"

# hm 命令
alias hm='cd ~/hermes-agent && hermes'
EOF
source ~/.bashrc
```

⚠️ 别忘了把 `你的端口` 换成真实端口号。

✅ **验证**：关掉终端重开，输入 `echo $https_proxy`，出来一个 IP 地址（格式类似 `http://172.x.x.x:7897`）就说明永久生效了。

## 第六阶段：验收

告诉对方，他只需要：

1. 打开 WSL 终端
2. 输入 `hm`

Hermes Agent 的界面直接出来，可以开始用了。

---

## 避坑 Checklist（远程帮忙必看）

帮人远程装了上百台，总结出这三个高频翻车点：

### BIOS 拦住了
`wsl --install` 直接报错，最常见原因是主板把虚拟化关了。去 BIOS 里找 Virtualization Technology 项，开启就行。**这一步只能视频指导**，没法远程代操作。

**自助排查**：任务管理器 → 性能 → CPU，看"虚拟化"那行写的是不是"已启用"。

### 网络不通
最常见的是加速工具没开"允许局域网"，或者防火墙拦了端口。先让对方把 Windows 防火墙临时关掉（公用网络），验证 `curl -I https://www.google.com` 返回 200，再把防火墙开回去。

### 模型名填错了
让对方在配置界面（Provider）选 **Custom**，然后手动填模型名，比如 `gpt-4o`。**别让他手抖填错**，填成 API 服务商不支持的格式就会连不上。

---

这套 SOP 把所有变量都固定了。只要硬件支持虚拟化，复制粘贴过去，不会红。

下次有人问你 Windows 怎么装 Hermes，直接把这篇甩给他。
