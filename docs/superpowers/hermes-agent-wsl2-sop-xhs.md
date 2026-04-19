# Windows装AI工具？照着这三步做，一路绿灯

说个真事儿：

帮人装开发环境，按教程做到第三步，弹出来一个红框。花了两个小时，最后发现——网络加速没开。

今天这套 SOP，就是为了消灭这种低级错误。

---

**第一步：开管理员PowerShell，输入这行代码**
```
wsl --install
```
点"是"，然后**重启电脑**。

装好后会让你设Ubuntu账号密码，设一下就行。

---

**第二步：让WSL能正常上网（这步卡死过90%的人）**

打开加速工具 → 设置 → 开启"允许局域网"。

在Ubuntu终端粘贴这两行：
```bash
export host_ip=$(grep -m 1 nameserver /etc/resolv.conf | awk '{print $2}')
export https_proxy="http://${host_ip}:你的端口"
export http_proxy="http://${host_ip}:你的端口"
```
⚠️ "你的端口"换成真实数字，常见是7897

验证：`curl -I https://www.google.com`，返回200就通了。

**一直卡住？** 先回去检查加速工具的"允许局域网"有没有开。

---

**第三步：装基础工具**
```bash
sudo apt update && sudo apt install python3 python3-pip git -y
```
可能要让输入密码，屏幕不显示字，正常现

---

**第四步：下载并安装hermes-agent**
```bash
cd ~
git clone https://github.com/NousResearch/hermes-agent.git
cd hermes-agent
pip3 install -e . -i https://pypi.tuna.tsinghua.edu.cn/simple
```

---

**第五步：一键启动配置**

以后每次只需输入 `hm` 就能用。把下面这段粘贴进去：
```bash
cat >> ~/.bashrc <<EOF
host_ip=\$(grep -m 1 nameserver /etc/resolv.conf | awk '{print \$2}')
export https_proxy="http://\${host_ip}:你的端口"
export http_proxy="http://\${host_ip}:你的端口"
alias hm='cd ~/hermes-agent && hermes'
EOF
source ~/.bashrc
```

---

**搞定！**

打开Ubuntu终端，输入 `hm`，直接开始。

---

**三个高频翻车点：**

① BIOS关了虚拟化 → 任务管理器看CPU那栏"虚拟化"是否已启用
② 网络不通 → 先把Windows防火墙临时关掉再测
③ 模型连不上 → `hermes model` 重新配置一遍，URL和Key别填错

---

照着做，不会红。
