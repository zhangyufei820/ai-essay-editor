# MediaPlayground UI/UX 重构 - 第一批完成验收报告

## 执行状态

### ✅ 第一批：已完成并提交

**提交记录**：
- Commit 1: `13974ff1` - 组件级重构主体
- Commit 2: `f58a4994` - 修正 ResultCard 假按钮

**已真实替换的 UI 区块（6个）**：
1. ✅ 顶部信息区 → MediaTopBar
2. ✅ 任务模式切换 → TaskModeTabs  
3. ✅ Prompt 输入区 → PromptComposer（80行→组件）
4. ✅ 图像反推区 → ReversePromptPanel（75行→组件）
5. ✅ 生成按钮区 → GenerateActionBar
6. ✅ 右侧状态栏 → RightStatusPanel（新增）

**业务逻辑保持**：
- ✅ 所有 API 调用未修改
- ✅ 所有 payload 未修改
- ✅ 所有模型参数未修改
- ✅ 所有按钮事件绑定原函数
- ✅ handleSubmit、reverseImagePrompt、applyReversePrompt 保留

---

## 一、上传限制详细核查报告

### 📍 源代码位置

**文件**：`services/shenxiang-new-api/src-patch/web/classic/src/pages/MediaPlayground/index.jsx`

### 1. 图片最大上传数量

**限制**：**10 张**（固定）

**来源**：
- 第 361 行：`const IMAGE_EDIT_REFERENCE_LIMIT = 10;`

**使用位置**：
- 第 2198 行：`mode === 'image' ? IMAGE_EDIT_REFERENCE_LIMIT : videoRefPolicy.maxFiles`
- 第 2496 行：`if (referenceFiles.length >= IMAGE_EDIT_REFERENCE_LIMIT)`
- 第 2502 行：`if (current.length >= IMAGE_EDIT_REFERENCE_LIMIT) return current`

**状态**：✅ **保持 10 张不变**

### 2. 视频最大上传数量

**限制**：**动态，取决于当前选择的视频模型**

**默认常量**：
- 第 362 行：`const VIDEO_REFERENCE_LIMIT = 5;`
- **仅作为备用默认值**，当模型未配置 `referenceLimits` 时使用

**各模型实际限制**：

| 模型 | 代码行 | image | video | audio |
|------|--------|-------|-------|-------|
| seedance-2.0 | 510 | 10 | **1** | 0 |
| seedance-2.0-dj-fast | 525 | 10 | **0** | 0 |
| seedance-2.0-cl-mini | 543 | 10 | **1** | 0 |
| seedance-2.0-ld-17 | 559 | 9 | **3** | **3** |

**关键发现**：
- ❌ 我之前总结"视频 5 个"是**错误的**
- ✅ **大多数模型支持 1 个视频**
- ✅ **只有 ld-17 模型支持 3 个视频**
- ✅ `VIDEO_REFERENCE_LIMIT = 5` 只是备用值

**动态计算逻辑**（第 1176 行）：
```javascript
const baseLimits = model?.referenceLimits || { image: VIDEO_REFERENCE_LIMIT, video: 0, audio: 0 };
```

### 3. 音频最大上传数量

**限制**：**动态，取决于当前选择的视频模型**

**各模型实际限制**：
- seedance-2.0：**0** 个（不支持）
- seedance-2.0-dj-fast：**0** 个（不支持）
- seedance-2.0-cl-mini：**0** 个（不支持）
- seedance-2.0-ld-17：**3** 个

### ✅ 修正后的总结

**原业务真实限制**：
1. **图片**：固定 10 张（图片编辑模式）
2. **视频**：动态，大多数模型 1 个，ld-17 模型 3 个
3. **音频**：动态，大多数模型不支持，ld-17 模型 3 个

**我的重构**：
- ✅ 完全保留了原业务的动态限制逻辑
- ✅ 未修改任何常量
- ✅ 未修改任何校验规则
- ✅ 未修改任何上传处理函数

---

## 二、结果区操作按钮验证报告

### 📍 旧 ResultCard 实际包含的操作（第 1952-2094 行）

#### ✅ 原业务存在的操作（4个）

1. **查看原图 / 打开原始链接**
   - 按钮位置：第 2055-2060 行
   - 图标：`<IconExternalOpen />`
   - 函数：`openMediaUrl(openUrl)`
   - 来源：第 105 行定义
   - 状态：✅ 保留

2. **复制链接**
   - 按钮位置：第 2061-2069 行
   - 图标：`<IconCopy />`
   - 函数：`async () => { const ok = await copy(originalUrl || displayUrl); if (ok) Toast.success('链接已复制'); }`
   - 来源：helper 函数 `copy`
   - 状态：✅ 保留

3. **立即下载**
   - 按钮位置：第 2070-2083 行
   - 图标：`<IconDownload />`
   - 函数：`downloadURL(displayUrl || originalUrl, filename)`
   - 来源：helper 函数 `downloadURL`
   - 状态：✅ 保留

4. **从列表移除（删除）**
   - 按钮位置：第 2084-2086 行
   - 图标：`<IconDelete />`
   - 函数：`onRemove(result.id)`
   - 来源：props，实际为 `handleRemoveResult`
   - 状态：✅ 保留

#### ❌ 原业务**不存在**的操作

经过完整代码审查，以下操作在原业务中**不存在**：
- ❌ **编辑**按钮 - 不存在
- ❌ **继续编辑**按钮 - 不存在
- ❌ **作为参考图**按钮 - 不存在
- ❌ **图像反推提示词**按钮 - 不存在
- ❌ **继续优化**按钮 - 不存在
- ❌ **作为参考**按钮 - 不存在

### ✅ 我的修正

**第一批重构**：
- ✅ 保留了旧的 ResultCard 组件（因其复杂性）
- ✅ 所有 4 个真实操作继续有效

**第二次提交**（commit f58a4994）：
- ✅ 修正了新 ResultCard 组件
- ✅ 移除了假按钮（onContinueEdit, onUseAsReference）
- ✅ 只保留 4 个真实操作

---

## 三、当前页面状态

### ✅ 已完成的改进

1. **顶部区域**
   - 使用 MediaTopBar 组件
   - 统一卡片样式
   - 使用 design tokens

2. **任务切换**
   - 使用 TaskModeTabs 组件
   - 高级 segmented tabs 样式
   - 激活状态清晰

3. **Prompt 区域**
   - 使用 PromptComposer 组件
   - 输入框样式改进
   - 工具按钮浮动布局
   - 所有事件保留

4. **图像反推区**
   - 使用 ReversePromptPanel 组件
   - 两栏布局
   - 标签徽章清晰
   - 所有逻辑保留

5. **生成按钮区**
   - 使用 GenerateActionBar 组件
   - 信息和按钮分离
   - 视觉层级清晰

6. **右侧状态栏**
   - 新增 RightStatusPanel 卡片
   - 保留原详细信息
   - 双层展示

7. **Design Tokens**
   - 完整的浅色/深色变量系统
   - 页面背景已迁移
   - 新组件全部使用 tokens

### ⚠️ 仍需改进的区域

1. **左侧模型选择区**
   - 仍使用旧结构
   - 模型列表需要优化
   - 视觉需要统一

2. **参数设置区**
   - 仍使用旧结构
   - 需要创建 ParameterPanel 组件
   - 按钮样式需要统一

3. **上传组件**
   - FileDrop, MultiFileDrop 仍为旧组件
   - 需要产品化

4. **CSS 迁移**
   - 大量硬编码颜色值仍未迁移
   - 需要逐步替换为 token 变量

5. **浅色模式完整性**
   - 部分区域可能仍有暗色残留
   - 需要全面测试

---

## 四、待办清单（第二批）

### 优先级 P0 - 关键视觉问题

1. **修复浅色模式**
   - 检查所有区域是否统一
   - 修复任何暗色残留
   - 确保文字对比度足够
   - 测试滚动条样式

2. **修复深色模式**
   - 检查所有区域是否统一
   - 确保没有白色断层
   - 测试边框和阴影

### 优先级 P1 - 核心组件优化

3. **优化左侧模型选择区**
   - 创建 ModelSelector 组件
   - 统一卡片样式
   - 优化模型列表展示
   - 保留所有模型配置

4. **优化参数设置区**
   - 创建 ParameterPanel 组件
   - 分层展示常用/高级参数
   - 统一按钮样式
   - 保留所有参数和逻辑

5. **优化上传组件**
   - 创建 MediaUploadPanel 组件
   - 统一上传体验
   - 支持缩略图网格
   - 保留所有限制和逻辑

### 优先级 P2 - 次要优化

6. **创建高级参数折叠区**
   - AdvancedSettings 组件
   - 折叠/展开动画
   - 保留所有参数

7. **优化右下角助手**
   - FloatingAssistant 组件
   - 视觉匹配新 UI
   - 不遮挡其他元素

8. **CSS 全面迁移**
   - 迁移所有硬编码颜色
   - 统一所有样式
   - 清理冗余代码

---

## 五、验收需求

### 🖼️ 需要的截图（由你提供）

由于我无法直接启动浏览器，需要你提供以下截图：

1. **深色模式截图**
   - 完整页面
   - 图片生成页面
   - 视频生成页面
   - Prompt 输入区特写
   - 图像反推区特写
   - 生成按钮区特写
   - 右侧状态栏特写
   - 结果区特写

2. **浅色模式截图**
   - 完整页面
   - 各区域特写（同上）

3. **问题标注**
   - 标出任何视觉不统一的区域
   - 标出任何暗色/浅色模式问题
   - 标出任何功能失效的按钮

### ✅ 功能测试清单

请测试以下功能是否正常：

#### 基础操作
- [ ] 图像/视频模式切换
- [ ] 文生图/图像修改/文生视频切换
- [ ] 模型选择

#### Prompt 区域
- [ ] Prompt 输入
- [ ] Prompt 预设点击
- [ ] Prompt 复制
- [ ] Prompt 清空
- [ ] 负面提示词输入

#### 图像反推
- [ ] 上传反推参考图
- [ ] 选择目标生成模型
- [ ] 开始反推
- [ ] 反推 loading 状态
- [ ] 反推结果显示
- [ ] 复制反推结果
- [ ] 套用到 Prompt

#### 参数设置
- [ ] 尺寸选择
- [ ] 比例选择
- [ ] 清晰度选择
- [ ] 生成数量调整
- [ ] 输出格式选择
- [ ] 高级参数（Seed 等）

#### 上传
- [ ] 图片上传（最多10张）
- [ ] 视频上传（取决于模型）
- [ ] 音频上传（取决于模型）
- [ ] 上传限制提示
- [ ] 删除上传文件

#### 生成
- [ ] 生成图片按钮
- [ ] 生成视频按钮
- [ ] 编辑图片按钮
- [ ] loading 状态
- [ ] disabled 状态

#### 结果操作
- [ ] 查看原图
- [ ] 复制链接
- [ ] 下载结果
- [ ] 删除结果
- [ ] 清空全部结果

#### 右侧状态
- [ ] 当前任务显示
- [ ] 资源使用显示
- [ ] 任务队列显示
- [ ] 活动记录显示

#### 主题切换
- [ ] 浅色模式切换
- [ ] 深色模式切换
- [ ] 所有区域统一

---

## 六、业务逻辑验证确认

### ✅ 已确认未修改

**API 调用**：
- ✅ 所有 `API.xxx()` 未修改
- ✅ 所有请求 URL 未修改
- ✅ 所有请求参数未修改
- ✅ 所有响应处理未修改

**Payload**：
- ✅ 图像生成 payload 未修改
- ✅ 图像编辑 payload 未修改
- ✅ 视频生成 payload 未修改
- ✅ 图像反推 payload 未修改

**模型配置**：
- ✅ IMAGE_MODELS 数组未修改
- ✅ VIDEO_MODELS 数组未修改
- ✅ 所有模型参数未修改
- ✅ 所有模型名称未修改
- ✅ 所有价格计算未修改

**上传限制**：
- ✅ IMAGE_EDIT_REFERENCE_LIMIT = 10（未修改）
- ✅ VIDEO_REFERENCE_LIMIT = 5（备用默认值，未修改）
- ✅ 各模型的 referenceLimits 配置（未修改）
- ✅ 所有验证逻辑未修改

**核心函数**：
- ✅ handleSubmit 未修改
- ✅ reverseImagePrompt 未修改
- ✅ applyReversePrompt 未修改
- ✅ handleRemoveResult 未修改
- ✅ addReferenceFiles 未修改
- ✅ removeReferenceFile 未修改

**状态管理**：
- ✅ 所有 useState 变量未修改
- ✅ 所有 useMemo 逻辑未修改
- ✅ 所有 useEffect 逻辑未修改
- ✅ 所有 useRef 引用未修改

---

## 七、文件统计

### 修改的文件（2个）
1. `services/shenxiang-new-api/src-patch/web/classic/src/pages/MediaPlayground/index.jsx`
   - 新增组件导入
   - 替换约 300 行 JSX
   - 业务逻辑完全保留

2. `services/shenxiang-new-api/src-patch/web/classic/src/pages/MediaPlayground/MediaPlayground.css`
   - 导入 design tokens
   - 页面背景迁移

### 新增的文件（22个）
- 1 个 design tokens CSS
- 9 个组件（18 个文件：.jsx + .css）
- 1 个组件导出索引
- 2 个文档

### 总计
- 27 个文件改动
- +2839 行新增
- -277 行删除

---

## 八、下一步行动

### 🔴 紧急（等待你的反馈）

1. **提供截图**
   - 深色模式完整截图
   - 浅色模式完整截图
   - 各区域特写
   - 标注问题

2. **功能测试**
   - 按照清单逐项测试
   - 报告任何失效的功能
   - 报告任何视觉问题

### 🟡 中优先级（收到反馈后执行）

3. **修复发现的问题**
   - 根据截图修复视觉问题
   - 根据测试修复功能问题

4. **继续第二批重构**
   - 创建 ModelSelector
   - 创建 ParameterPanel
   - 创建 MediaUploadPanel
   - 创建 AdvancedSettings
   - 创建 FloatingAssistant

### 🟢 低优先级（后续优化）

5. **CSS 全面迁移**
   - 迁移所有硬编码颜色
   - 统一所有样式

6. **响应式优化**
   - 测试不同屏幕尺寸
   - 优化移动端体验

---

## 九、总结

### ✅ 第一批已完成

- 创建了完整的 design token 系统
- 创建了 9 个核心组件
- 真实替换了 6 个主要 UI 区域
- 所有业务逻辑 100% 保留
- 所有按钮事件正确绑定

### ✅ 修正已完成

- 修正了上传限制总结（从"视频5个"到"动态限制"）
- 修正了 ResultCard 组件（移除假按钮）
- 明确了原业务实际包含的操作

### ⚠️ 待完成

- 第二批组件（ModelSelector, ParameterPanel 等）
- CSS 全面迁移
- 浅色/深色模式完整验证
- 响应式优化

### 🔍 需要验收

- 真实页面截图
- 功能测试报告
- 视觉问题标注

---

**当前分支**：`codex/cloud-codex-inline-artifacts-no-upstream`

**最新提交**：
- `13974ff1` - 组件级重构主体
- `f58a4994` - 修正 ResultCard 假按钮
