# Windows装AI工具？按这三步走，一路绿灯

**说个真事儿：**

帮人装开发环境，按教程做到第三步报错，花两小时排查，最后发现——代理没配对。

今天这套 SOP，就是为了消灭这种低级错误。

---

**第一步：开管理员PowerShell，输入这行代码**
```
wsl --install
```
弹窗点"是"，然后**重启电脑**。

---

**第二步：让WSL能正常上网**

打开Clash Verge → 设置 → 开启"允许局域网"。

然后在WSL终端粘贴：
```bash
export host_ip=$(grep -m 1 nameserver /etc/resolv.conf | awk '{print $2}')
export https_proxy="http://${host_ip}:7897"
export http_proxy="http://${host_ip}:7897"
```
验证：输入 `curl -I https://www.google.com`，返回200就通了。

---

**第三步：装依赖**
```bash
sudo apt update && sudo apt install python3 python3-pip git -y
```

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

把这段代码粘贴到终端，它会自动把代理和`hm`快捷命令写死：
```bash
cat >> ~/.bashrc <<EOF
host_ip=\$(grep -m 1 nameserver /etc/resolv.conf | awk '{print \$2}')
export https_proxy="http://\${host_ip}:7897"
export http_proxy="http://\${host_ip}:7897"
alias hm='cd ~/hermes-agent && hermes'
EOF
source ~/.bashrc
```

---

**搞定！**

以后每次用，打开WSL终端，输入 `hm`，直接开玩。

---

**三个坑，提前避开：**

① BIOS关了虚拟化 → 任务管理器看CPU那栏"虚拟化"是否已启用
② 代理不通 → 关Windows防火墙再测
③ 模型填错 → Provider选Custom，填标准模型名如gpt-4o

---

照着做，不会红。
