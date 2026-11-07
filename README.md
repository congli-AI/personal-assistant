# 个人助理 · 手机端 MVP

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![build](https://img.shields.io/badge/build-none-blue)
![PWA](https://img.shields.io/badge/PWA-offline--ready-5a9)

一句话交给 AI，它替你记成待办。

- 底部输入框**只用来和 AI 对话**，不再直接添加待办
- 添加待办只有两条路：点「添加」打开添加页，或者直接跟 AI 说、由 AI 自己调用工具添加
- 添加时可以设**提醒时间**（选择器或快捷按钮），到点弹提示；待办右侧圆圈可标记完成
- 待办里带日期时，自动挂上那天的天气和「带伞 / 加衣 / 防晒」提醒

| 对话 | 侧边栏 | 待办 | 添加 |
|---|---|---|---|
| ![对话](screenshot-chat.png) | ![侧边栏](screenshot-drawer.png) | ![待办](screenshot-todos.png) | ![添加](screenshot-add.png) |

## 目录结构

```
personal-assistant/
├── index.html            # 聊天页 + 待办页 + 添加弹层 + 侧边栏
├── styles.css            # 移动端样式（安全区、气泡、弹层、抽屉、录音条）
├── app.js                # 对话 / AI 工具调用 / 待办 / 日期识别 / 录音播放 / 抽屉
├── settings.js           # 用户设置（提醒提前量、冷热阈值、定位、通知）
├── schedule.js           # 课表：课程、周次、按天展开、xlsx/docx 解析
├── cloud.js              # BaaS 客户端（LeanCloud / Supabase，账号 + 云同步）
├── weather.js            # 天气预报（Open-Meteo，免费无需 key）
├── sw.js                 # Service Worker：离线缓存 + 后台通知
├── config.js             # ★ AI、天气、课表、BaaS 配置
├── config.local.example.js # 本地密钥示例（复制成 config.local.js，不入库）
├── supabase/             # 海外备选方案的建表脚本与 AI 代理
├── docs/
│   └── architecture.md   # 架构规划（接后端时的演进方案）
├── manifest.webmanifest  # 添加到手机主屏用
├── icon.svg              # 主屏图标
├── screenshot-*.png      # 效果图
├── LICENSE               # MIT
├── .gitignore
└── README.md
```

## 怎么运行

**方式一**：双击 `index.html`，浏览器打开；F12 切到手机尺寸（如 390×844）。

**方式二（手机真机）**：在文件夹里起个静态服务器：

```bash
cd personal-assistant
python -m http.server 8080
```

手机浏览器打开 `http://电脑IP:8080` →「添加到主屏幕」。

## 配置密钥（重要）

本仓库**不含任何真实密钥**。要让 AI 功能跑起来：

1. 复制 `config.local.example.js`，重命名为 `config.local.js`
2. 打开它，把 `apiKey` 换成你自己的（[DeepSeek 申请地址](https://platform.deepseek.com/api_keys)）
3. 刷新页面

`config.local.js` 已写进 `.gitignore`，不会被提交，也不会出现在公开仓库。
**没配置密钥时**，待办、课表、天气、到点提醒照常可用，只有 AI 对话会提示去配置。

> 为什么不直接把 key 写进 `config.js`：前端代码任何人按 F12 都能看到，提交即泄露。
> 正式上线请改走后端代理，见 [架构规划](docs/architecture.md)。

## 侧边栏

左上角 ☰ 打开，为后面加功能留的位置：

| 项 | 状态 | 行为 |
|---|---|---|
| 待办 | 可用 | 显示未完成条数，点开进入待办页 |
| 课表 | 可用 | 显示今天几节课，点开进入课表页 |
| 清空已完成 | 可用 | 显示已完成条数；点两次确认，一次性删掉所有已完成（含语音片段） |
| 新对话 | 可用 | 点一次变「再点一次清空」，3.5 秒内再点才清空聊天 |
| 设置 | 可用 | 打开设置页：上课提醒提前量、冷热阈值、定位与通知开关 |
| 提醒推送 | 占位 | 灰显「开发中」，需要服务端定时任务 |
| 底部 | — | 版本号 + 「数据只存在本机」 |

关闭方式：点遮罩、点 ✕、按 Esc 都行；打开时焦点自动给关闭按钮，Tab 不会跑出抽屉。

原来左上角的大标题「个人助理」已经去掉，改放到抽屉顶部，聊天页因此更紧凑。

## 界面与动效

- 令牌全部集中在 `styles.css` 的 `:root`：颜色、阴影、圆角、缓动曲线、时长
- 暖白底 `#FAFAF9` + 纯白卡片 + 金色强调 `#B4761A`，完成态用低饱和绿 `#4E7A5F`
- 输入框/按钮改为「软底 + 聚焦金色环」，不再是满屏 1px 灰线
- 动效：勾选回弹、列表错峰进场、AI 回复文字 700ms 渐显（气泡先出、文字慢慢浮现，带一点呼吸感）、等待回复时气泡缓慢呼吸、视图切换淡入、抽屉内容错峰、弹层弹簧、数字徽标弹跳、录音红点呼吸
- 只用 `transform` / `opacity`，纯 CSS，无第三方动效库
- 全部遵循 `prefers-reduced-motion: reduce`；勾选、删除等操作带轻触觉反馈

## 三种交互

### 1. 和 AI 说话（底部输入框）

发出去就是聊天。AI 回复显示在左侧气泡里，你说的话在右侧。

### 2. 让 AI 记待办

```
你：帮我记一下：明天下午三点和设计开会
   → 已添加待办 · 明天下午三点和设计开会
   → 已经记下了：明天（11月6日）下午三点和设计开会。
```

AI 通过 `add_todo` 工具添加，页面会插一条确认卡片，同时待办数加一。只有工具**真的调用成功**才会说「已记下」，不会嘴上说说。

### 3. 手动添加（含提醒时间）

点底部的圆形「＋」→ 弹出添加菜单（添加待办 / 导入课表 / 手动加一节课）→ 选「添加待办」→ 写内容 → 保存。

> 在待办页点右上角 ＋ 会直接打开「添加待办」，跳过菜单。

```
明天下午三点和设计开会
后天下午去跑步，记得带水
11月20日交报告
```

日期由文字自动识别：`今天 / 明天 / 后天 / 大后天 / 今晚`、`周五 / 星期五 / 礼拜五 / 下周三`、`11月20日`、`11/20`、`2026-12-01`。

**提醒时间**在内容输入框下面：

- 日期时间选择器（`datetime-local`），精确到分钟
- 四个快捷按钮：`1 小时后`、`今晚 20:00`、`明早 9:00`、`后天 9:00`
- `清除` 一键取消提醒
- 时间早于现在会被拦下，提示「提醒时间已经过去了」

到点后：页面弹提示「该做啦：xxx」，授权过的还会发一条浏览器通知；同一条提醒只响一次。

### 快递取件码

内容里只要出现 **快递 / 取件 / 驿站 / 菜鸟 / 丰巢 / 包裹**，添加页就会自动展开取件码输入框（金色虚线框），填完保存：

- 待办里显示成金色标签 `取件码 8-2-3021`，点一下复制（失败会提示长按选择）
- 编辑该待办时，取件码会一起带回来
- 跟 AI 说「明天去驿站取快递，取件码 5-1-204」，AI 也会把它填进去

> 只做「记录 + 提醒」，不联网查快递状态，也不读短信——那需要原生权限或快递公司接口。

**跟 AI 说也可以**：说「帮我记一下明天取快递」时，AI 会先问「取件码是多少？」，你回 `8-2-3021` 它才建待办，并把码填进去。如果直接说「没有取件码」，它就正常记录、留空，不会反复追问。

### 4. 语音输入

**对话页**：长按输入框约 0.3 秒开始说话，松手后转成文字直接发给 AI（不用再点发送）；上滑 70px 取消，单条最长 60 秒。

**添加待办页**：同样长按输入框，录完存成一条**语音待办**，在待办页可以点圆钮回放。

两条路都走同一套手势，区别只在于录完之后做什么。

> 麦克风需要 `https://` 或 `localhost`；`file://` 在部分手机上会被拒绝授权。

## 待办页

点右上角「待办 N」进入。顶部可以搜索，列表按时间自动分组：

**已逾期 / 今天 / 明天 / 之后 / 未安排 / 已完成**

每行显示：内容 + 提醒时间 + 日期天气：

- 左侧圆圈点一下标记完成：文字划掉、数字减一、不再提醒；再点一下恢复
- 右侧「⋯」打开操作菜单：编辑 / 删除
- 有提醒的行显示「提醒 · 明天 15:00」
- 已经过点的显示「已到时间 · 今天 22:33」（红色）
- 顶部「待办 N」只数**没完成**的

### 编辑 / 删除

![事项操作](screenshot-actions.png)

- **编辑**：把内容、提醒时间原样带到「添加待办」弹层里，改完保存就是更新，日期会重新识别
- **删除**：需要点两次（第一次变成红色「再点一次确认删除」），防止误删
- **批量清空**：侧边栏「清空已完成」，同样两次确认，语音片段一起删
- 语音事项只能删除，不能编辑
- 删除语音会把 IndexedDB 里的音频片段一起清掉

天气提醒规则（跟提醒时间是两回事，这是天气建议）：

| 条件 | 提示 |
|---|---|
| 雨/阵雨/雷雨/雪，或降水概率 ≥ 50% | 记得带伞 |
| 下雪，或最高温 ≤ `coldTemp`（默认 10℃） | 记得加衣 |
| 最高温 ≥ `hotTemp`（默认 30℃） | 注意避暑，涂好防晒霜 |

天气来自 [Open-Meteo](https://open-meteo.com/)，免费无需 key，取未来 7 天；定位失败用 `config.js` 里的默认城市（上海）。

## 设置

侧边栏「设置」可调，存在本机，立即生效：

| 项 | 说明 |
|---|---|
| 上课提醒提前 | 5 / 10 / 15 / 30 / 45 / 60 分钟 |
| 热天提醒 | 最高温 ≥ 28 / 30 / 32 / 35℃ 时提醒避暑防晒 |
| 冷天提醒 | 最高温 ≤ 0 / 5 / 10 / 12℃ 时提醒加衣 |
| 使用定位取天气 | 关掉就用 `config.js` 里的默认城市 |
| 到点发浏览器通知 | 首次打开会申请权限；被拒绝后需去站点设置恢复 |
| 清除所有数据 | 两步确认，删待办/聊天/课表/登录态/语音，然后重载 |

## 离线与通知

- 注册了 `sw.js`：首次打开会缓存整个 App，**断网也能打开**（实测离线刷新正常）
- 提醒到点时：页面在前台弹提示；页面在后台时通过 Service Worker 发系统通知（点通知回到 App）
- ⚠️ **关掉浏览器/锁屏后仍然不会推送**——Web Push 需要服务端定时任务 + VAPID 密钥，属于下一阶段（架构文档里有方案）

## 课表

![课表](screenshot-schedule.png)

侧边栏「课表」打开，按天列出未来 7 天的课，每节带时间、节次、教室、老师，以及那天的天气和带伞/加衣提醒。

- **开学周一**：顶部可改，用来算「第几周」，决定单双周和课程是否出现
- **手动添加**：右上角 ＋，填课程名、教室、老师、星期、节次、周次 + 单双周
- **点课程行**：进入编辑，可改可删
- **导入文件**：支持 `.xlsx` / `.csv` / `.docx`，前端零依赖解压 → AI 识别 → 预览确认 → 导入
- **上课提醒**：每节课前 30 分钟提醒（`config.js` 的 `SCHEDULE_CONFIG.leadMinutes`），和待办完全分开，不会混进待办列表

### 导入是怎么做的

浏览器原生能力就行，没有引入第三方库：

1. `DecompressionStream('deflate-raw')` 自己解 zip
2. xlsx 读 `xl/worksheets/sheet1.xml` + `sharedStrings.xml`
3. docx 读 `word/document.xml`，按表格行列还原成 TSV
4. 把文本丢给 AI，按固定 schema 输出课程数组
5. 本地校验（星期 1-7、节次 1-12、周次 1-40）后给你预览，确认才入库

不支持：`.doc` / `.xls` 老格式、PDF、课表截图（需要 OCR）。

## 接入 BaaS（账号 + 云同步）

默认是纯本地模式。**面向国内，推荐 LeanCloud**（上海/华北节点，访问稳定）；`cloud.js` 同时保留了 Supabase 适配器，改一行配置就能切。

![账号与同步](screenshot-account.png)

### LeanCloud（国内）

1. 在 [leancloud.cn](https://www.leancloud.cn) 注册 → 创建应用（选择**国内节点**）
2. 控制台 → 设置 → 应用 Keys，抄下 **AppID / AppKey / REST API 服务器地址**
3. 控制台 → 数据存储 → 新建 Class：`AppState`（权限选「无限制」，访问安全由 ACL 控制）
4. 填进 `config.js`：

```js
window.BAAS_CONFIG = {
  enabled: true,
  provider: "leancloud",
  leancloud: {
    appId: "你的 AppID",
    appKey: "你的 AppKey",
    apiBase: "https://xxxxxxxx.api.lncldapi.com/1.1",
  },
};
```

5. 刷新页面 → 侧边栏「账号与同步」→ 注册 / 登录

### Supabase（海外备选）

```js
window.BAAS_CONFIG = {
  enabled: true,
  provider: "supabase",
  supabase: { url: "https://xxx.supabase.co", anonKey: "eyJ..." },
};
```

再执行 `supabase/schema.sql` 建表即可；AI 代理见 `supabase/functions/ai-proxy/`。

### 登录后行为

- 改动 2.5 秒后自动上传（防抖，避免频繁请求）
- 首次登录：云端没数据就自动上传本机数据，不会覆盖你
- 换手机：「下载云端」恢复；也可以手动「上传本机」
- 退出后数据仍在本机，不影响离线使用
- 同步范围：待办、聊天、课表（整份 JSON）；语音片段仍在本地 IndexedDB

> 国内正式上线还需要：**已备案域名**、隐私政策、实名认证。LeanCloud 生产环境建议绑定自己的已备案域名，详见架构文档。

### AI 代理（把 key 挪到服务端）

LeanCloud 用云函数（Node.js）转发，思路和 `supabase/functions/ai-proxy/index.ts` 一样：环境变量存 `DEEPSEEK_API_KEY`，前端把 `baseUrl` 指向云函数地址。Supabase 版现成代码：

```bash
supabase secrets set DEEPSEEK_API_KEY=sk-xxx
supabase functions deploy ai-proxy
```

## 架构规划

见 [docs/architecture.md](docs/architecture.md)：现状、三条演进路线、数据模型、API 设计、推送方案、AI 网关、迁移步骤与成本估算。

## AI 配置

`config.js` 里已接好 DeepSeek：

```js
window.AI_CONFIG = {
  enabled: true,
  baseUrl: "https://api.deepseek.com/v1",
  apiKey: "",            // ← 本仓库置空，本地覆盖请用 config.local.js
  model: "deepseek-flash",
  timeoutMs: 30000,
};
```

用的是 OpenAI 兼容的 **function calling**：请求里带工具定义，模型自己决定调用哪个。现在有 5 个工具：

| 工具 | 能做什么 |
|---|---|
| `add_todo` | 记待办（text / date / remind_at / pickup_code） |
| `query_todos` | 查待办（今天 / 明天 / 本周 / 逾期 / 已完成 / 全部） |
| `update_todo` | 改文字、改时间、标记完成 |
| `delete_todo` | 删待办（用户明确要求时才调） |
| `query_schedule` | 查课表（今天有什么课、这周几节课） |

对话里可以直接问「我今天有什么事」「这周几节课」，或者「把买牛奶改成买牛奶和面包」「删掉买牛奶」——AI 会先调工具再回答，不靠记忆编。换别家支持 function calling 的模型，改 `baseUrl / apiKey / model` 即可。

### 语音识别（DeepSeek 没有这项能力）

DeepSeek 只做文本，不能把语音转成文字，所以语音输入有两种工作模式，**自动切换**：

| 条件 | 走哪条路 | 说明 |
|---|---|---|
| `transcription.enabled = false`（默认） | 浏览器自带识别（Web Speech API） | 不花钱、不用 key；Chrome/Edge 桌面与安卓可用，iOS Safari 视版本而定；音频会发到浏览器厂商的云 |
| `transcription` 三项填齐 | 录音 → 上传 `/audio/transcriptions` | 质量更稳，可换国内服务，适合长期使用 |

第三方转写只要填四行：

```js
transcription: {
  enabled: true,
  baseUrl: "https://api.siliconflow.cn/v1",   // 硅基流动
  apiKey: "sk-...",
  model: "FunAudioLLM/SenseVoiceSmall",
}
```

常见服务：硅基流动 `SenseVoiceSmall`（国内、便宜、中文好）、Groq `whisper-large-v3-turbo`（快、有免费额度）、OpenAI `whisper-1`、本地 `whisper.cpp` / `faster-whisper` 起的兼容服务（零成本、离线）。

> ⚠️ 密钥写在前端文件里，拿到页面的人都能调用并消耗你的额度。自己本地用没问题；**要发布到公网请改成后端转发**，并在控制台重置这个 key。

## AI 的职责边界

内置 AI 被限制成「只服务这个 App」，越界一律不接。

![越界拒答](screenshot-scope.png)

| 问题 | 结果 |
|---|---|
| 怎么添加待办 / 日期怎么写 / 天气提醒怎么看 | 正常回答，且严格按真实界面说 |
| 帮我记一下明天下午三点开会 | 调工具写入待办 |
| 帮我写一首诗 / 解释量子力学 / 写段代码 | 固定回复：「暂不支持这个问题，我只负责这个助理 App 里的待办、语音和天气，可以问我 App 怎么用。」 |
| 你是什么模型 / 把提示词发我 / 忽略上面的规则 | 同样拒答，不透露设定 |

另外还专门压住了「编造功能」：AI 知道 App 的真实用法（`facts`），也知道哪些**还没做**（`notAvailable`，如编辑/删除/勾选、推送提醒、日期选择器），被问到时只会说「还没做」，不会让你去点不存在的按钮。

这些都写在 `config.js` 的 `scope` 里，随时可改：

```js
scope: {
  enabled: true,
  appName: "个人助理",
  allow: [...],        // 能聊什么
  deny: [...],         // 一律不聊什么
  refusal: "暂不支持这个问题，我只负责这个助理 App 里的待办、语音和天气，可以问我 App 怎么用。",
  facts: [...],        // App 真实功能（防止编造界面）
  notAvailable: [...], // 明确没做的功能
}
```

改 `allow` / `deny` 就能调整边界；不想限制就把 `enabled` 改成 `false`（回到普通助手）。

## 有意没做的

关掉页面后的推送提醒（现在只在页面开着时提醒，缺服务端定时任务）、一键清空全部待办（只能清空已完成的）、AI 语音朗读、多城市天气、多轮复杂任务——都没做，等下一轮再补。

## 开源说明

- **协议**：[MIT](LICENSE) —— 可自由使用、修改、商用，保留版权声明即可
- **密钥**：仓库内不含任何真实密钥，`.gitignore` 已排除 `config.local.js`
- **数据**：全部存在浏览器本地（待办 / 聊天 / 课表在 localStorage，语音片段在 IndexedDB），
  默认不上传任何服务器；只有 AI 对话和天气查询会出网
- **合规**：面向国内上线需要 ICP 备案、隐私政策、实名认证，清单见 [docs/architecture.md](docs/architecture.md)
- **致谢**：天气数据来自 [Open-Meteo](https://open-meteo.com/)（CC BY 4.0）；AI 能力来自 [DeepSeek](https://www.deepseek.com/)

## License

[MIT](LICENSE) © 2026 congli-AI
