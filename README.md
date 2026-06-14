# 简历 × JD 匹配分析助手

一个 Chrome 插件:在职位页面选中 JD 文本,一键调用 Claude API 分析与你简历的匹配程度,并给出改进建议。

## 功能

- 上传 PDF 简历,本地自动解析并调用 Claude 提取结构化信息(姓名、教育经历、工作经历、项目经历、技能等)
- 解析结果可在结构化表单中手工核对、修正、增删,确认后保存(存在 `chrome.storage.local`,不上传第三方)
- 在职位页面一键**自动识别 JD**(读取整页文本 → Claude 提取),识别结果可编辑确认;也支持手动选中文本作为兜底
- 输出:匹配分数、匹配的技能/经历、缺失项、改进建议

---

## 一、加载到 Chrome

1. 解压本项目(Chrome 加载的是**文件夹**,不是 zip)
2. 打开 `chrome://extensions`
3. 开启右上角 **开发者模式**
4. 点击 **加载已解压的扩展程序**,选择 `resume-jd-matcher` 文件夹

---

## 二、首次使用

1. 点击插件图标 → 底部 **设置 API Key** → 填入 Claude API Key 并保存
   （API Key 在 https://console.anthropic.com 获取,仅保存在本地浏览器)
2. 再次打开插件 popup → **上传 / 填写简历**,会打开一个新标签页
   - 上传 PDF 简历 → 自动解析并填充姓名、教育经历、工作经历、项目经历、技能等字段
   - **请仔细核对并修正自动识别的内容**(解析结果可能有误或不全),也可手动增删条目
   - 确认无误后点击 **保存简历**
3. 去职位页面(LinkedIn / Boss直聘等),点击插件图标
4. 点击 **自动识别本页JD**(会读取整页文本并调用 Claude 提取 JD),或在页面上**手动选中 JD 文本**作为兜底
5. 在文本框中**核对/编辑**识别出的 JD,确认无误后点击 **分析匹配度**

简历信息保存后,可随时通过 popup 中的 **编辑简历** 重新打开修改。

---

## 三、开发与调试

### 迭代循环

> 改代码(VSCode / Claude Code) → 去 `chrome://extensions` 点插件卡片上的 **刷新按钮**(转圈图标) → 重新打开插件看效果

**注意:每次改完代码,Chrome 不会自动重新加载,必须手动点刷新按钮。**
改了 `background.js` 后刷新最保险;改了 popup 代码有时需要关掉 popup 重开。

### 三个调试入口

| 改的是 | 在哪看报错 |
| --- | --- |
| **popup**(popup.js/html/css) | 右键插件图标 → "审查弹出内容",打开 popup 专用 DevTools |
| **background**(background.js) | `chrome://extensions` → 插件卡片 → "检查视图 service worker" |
| **content script**(content.js) | 直接在网页本身按 F12,看页面的 console |

出问题时,把对应入口的报错信息整段复制给 Claude Code,比只说"不工作"高效得多。

---

## 四、文件结构

```
resume-jd-matcher/
├── manifest.json          # 插件配置 (Manifest V3)
├── popup/
│   ├── popup.html         # 弹窗界面
│   ├── popup.js           # 弹窗逻辑:读取选中文本、发起分析、展示结果
│   └── popup.css
├── resume/
│   ├── resume.html         # 简历编辑页:PDF上传解析 + 结构化表单
│   ├── resume.js
│   └── resume.css
├── content/
│   └── content.js         # 注入页面,记录用户选中的 JD 文本
├── background/
│   └── background.js      # service worker:调用 Claude API、消息传递
├── options/
│   ├── options.html        # 设置页:填写 API Key
│   └── options.js
├── lib/
│   ├── resume-data.js      # 简历数据结构与格式化(popup/resume/background共用)
│   └── pdfjs/              # 本地打包的 PDF.js,用于解析PDF文本
└── icons/                 # 图标(占位,可自行替换)
```

---

## 五、已知限制 & 可迭代方向

- **API Key 安全**:当前用 `anthropic-dangerous-direct-browser-access` 让浏览器直连 API,适合自用/原型。若要分发,建议搭一个轻量后端代理,把 Key 放服务端。
- **JD 获取**:当前用"整页文本 → Claude 提取"的通用方案(对网站改版最稳,但每次识别会多花一次 API,且页面噪音多时可能提取偏差,所以结果可编辑、并保留手动选中兜底)。后续可针对 LinkedIn / Boss直聘 等的 DOM 结构写专用选择器,优先精准抓取、失败再回退到当前通用方案,以提速省钱。
- **状态不持久**:popup 关闭即丢失结果。可加"分析历史"存到 storage。
- **PDF解析依赖API**:PDF文本提取在本地完成,但"提取为结构化字段"这一步会调用一次 Claude API,因此上传简历时也需要先配置好 API Key;若该次调用失败,可在表单中手动填写。
- **扫描版PDF**:若PDF是图片扫描件(没有可选中的文字层),本地无法提取文本,需要手动填写表单。
