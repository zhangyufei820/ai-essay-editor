# 纯净 Windows 系统 WSL2 + Hermes Agent 全程无错 SOP

装过开发环境的同学，大概都懂这种痛——按教程做到第三步，弹出来一个红框。然后开始搜报错，看了三篇帖子，试了四种方法，最后发现是某个配置没对上。

今天这套 SOP，就是把 Hermes Agent 在 Windows 上的安装做成"傻瓜相机"。只要电脑支持虚拟化，复制粘贴命令，不会红。

## 这是啥，能干啥

Hermes Agent 是 NousResearch 出的开源 AI 助手，GitHub 10 万星。装好之后，它会从你的使用习惯里学习，越用越懂你。

支持接 OpenRouter（200+ 模型）、OpenAI、X、NVIDIA NIM、小米 MiMo 等。

---

## 第一阶段：Windows 准备

在 Windows 搜索框输入 **PowerShell**，右键点 **"以管理员身份运行"**。

⚠️ **必须是管理员**，普通打开等会会报错。

在终端里输入：

```powershell
wsl --install
```

回车，等提示"正在请求操作"，点"是"。**然后必须重启电脑。**

⚠️ **Windows 10 用户注意**：`wsl --install` 在旧版 Windows 10 上可能报"找不到命令"。先按 `Win + R`，输入 `winver` 看版本号。如果低于 1903，建议先到微软官网更新系统，或搜索"Windows 10 手动开启 WSL"。

重启后一般会弹出一个黑色窗口在装 Ubuntu。稍等几分钟，装好后会让你输入 Ubuntu 的账号和密码，设一下就行。

如果什么都没弹出来，再次打开 PowerShell，输入 `wsl` 回车，能进入 Linux 环境就说明装好了。

---

## 第二阶段：让 WSL 能正常上网

这步是最多人翻车的地方。装完 WSL 第一件事，是让它能访问外网。不做这步，后面的命令都会卡住。

**在 Windows 上操作：**

打开你的网络加速工具（Surge、Stash、Clash 等），进设置，把 **"允许局域网"** 或同类型的选项打开。

**在 WSL 终端操作：**

打开 Ubuntu 终端，粘贴这两行：

```bash
export host_ip=$(grep -m 1 nameserver /etc/resolv.conf | awk '{print $2}')
export https_proxy="http://${host_ip}:你的端口"
export http_proxy="http://${host_ip}:你的端口"
```

⚠️ 把"你的端口"换成真实端口号，Surge/Stash/Clash 系一般是 `7897`。不确定的话去加速工具的设置里找"代理端口"或"HTTP 代理"那行数字。

✅ **验证**：输入 `curl -I https://www.google.com`，回车。如果返回 `HTTP/1.1 200 OK`，说明网络通了。

**卡住了怎么办：**
- 如果报错 `Connection timeout`，回头检查加速工具的"允许局域网"有没有打开
- 如果报 `Could not resolve host`，说明代理没生效，重启 WSL：`wsl --shutdown`，再重开终端重试

---

## 第三阶段：装基础工具

WSL 自带的 Ubuntu 镜像非常干净，Python 和 Git 都没装，要手动补。

```bash
sudo apt update && sudo apt install python3 python3-pip python3-dev build-essential git -y
```

回车，可能要输入一次 Ubuntu 的密码（设好的那个），输入时屏幕不会显示字，正常，输完回车就行。

✅ **验证**：两条命令都跑完，没报错。输入 `python3 --version` 和 `git --version`，都返回版本号就说明装好了。

**卡住了怎么办：**
- 如果 `apt update` 卡住不动，说明第二步网络没通，先回去检查代理
- 如果报错 `Unable to acquire dpkg frontend lock`，等 30 秒再试，可能是之前有进程没跑完

---

## 第四阶段：下载 Hermes Agent

```bash
cd ~
git clone https://github.com/NousResearch/hermes-agent.git
cd hermes-agent
pip3 install -e . -i https://pypi.tuna.tsinghua.edu.cn/simple
```

⚠️ 安装过程会下载一堆依赖，网速慢的话可能等几分钟，正常现象，不要中途关掉。

✅ **验证**：装完之后，输入 `hermes --version`，出来版本号（比如 `hermes v0.x.x`）就说明装好了。

**卡住了怎么办：**
- 如果报错 `ModuleNotFoundError: No module named 'ensurepip'`，先跑下面这行，再重试安装：
  ```bash
  sudo apt install python3-venv -y
  ```
- 如果 `git clone` 一直卡住，试试换个国内镜像：
  ```bash
  git clone https://gitcode.com/NousResearch/hermes-agent.git ~/hermes-agent
  cd ~/hermes-agent
  ```

---

## 第五阶段：配置"一键启动"

以后每次开机，只需要打开 Ubuntu 终端，输入 `hm`，就能直接用。

把下面这段完整粘贴到终端，回车：

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

⚠️ 别忘了把两个"你的端口"都改成真实端口号。

✅ **验证**：关掉终端，重新打开。输入 `echo $https_proxy`，出来 `http://172.x.x.x:端口号` 这样的格式就说明配置成功了。

---

## 第六阶段：启动

打开 Ubuntu 终端，输入：

```
hm
```

如果一切正常，你会看到 Hermes Agent 的界面出现了。直接可以开始对话。

---

## 常见翻车点清单

帮人远程装了几十台，总结出这三个高频问题：

**1. BIOS 拦住了**

`wsl --install` 直接报错，最常见原因是主板把虚拟化关了。需要进 BIOS 开启，不同电脑按键不一样，一般是开机时按 `F2` / `DEL` / `ESC` 进去找 Virtualization Technology 项。

自助排查：按 `Ctrl + Shift + ESC` 打开任务管理器 → 性能 → CPU，看"虚拟化"那行写的是不是"已启用"。

**2. 一直报网络超时**

大概率是第二步的代理没配对。确认加速工具的"允许局域网"已开，然后重试 `curl -I https://www.google.com`。

**3. 模型连不上**

在 Hermes 界面里输入 `hermes model`，重新配置一遍。Provider 选 `Custom`，API Base URL 和 Key 填你用的服务商给你的，别填错了。

---

这套 SOP 把所有变量都固定了。只要硬件支持虚拟化，复制粘贴，不会红。

环境配好了，AI 才是生产力；配不好，折腾环境就是最大的生产力流失。

下次有人问你 Windows 怎么装 Hermes，直接把这篇甩给他。
