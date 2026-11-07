# 个人助理 · 架构规划（v1）

> 写于 MVP 功能补齐之后：待办、提醒、天气、语音、课表、AI 对话、取件码都已在纯前端跑通。
> 这份文档回答两件事：**现在是什么结构**、**接后端时怎么演进**。

> **更新（已落地）**：路线 B 的第一步已经完成代码骨架——
> `cloud.js`（Supabase REST 客户端）、`supabase/schema.sql`（建表 + RLS）、
> `supabase/functions/ai-proxy/index.ts`（AI 代理）。
> 在 `config.js` 填好 `BAAS_CONFIG` 即可启用账号与云同步；模板见 `README.md`。

---

## 一、当前架构（As-Is）

```
┌─────────────────────────────────────────────┐
│  浏览器 / PWA（手机端）                       │
│                                             │
│  index.html                                 │
│  ├─ app.js          界面、状态、AI 工具调用   │
│  ├─ schedule.js     课表数据 + 文件解析       │
│  ├─ weather.js      Open-Meteo 天气          │
│  └─ config.js       AI / 天气 / 课表配置      │
│                                             │
│  本地存储                                    │
│  ├─ localStorage    待办、课表、聊天、缓存     │
│  └─ IndexedDB       语音片段                 │
└──────────────┬──────────────────────────────┘
               │ 直连
       ┌───────┴────────┬─────────────────┐
       ▼                ▼                 ▼
  DeepSeek API     Open-Meteo       浏览器 Web Speech
  (前端裸 key)      (免费无 key)      (语音识别)
```

**优点**

- 零服务器成本，打开就能用
- 数据全在本机，隐私边界清晰
- 部署就是几个静态文件

**硬伤**

| 问题 | 影响 |
|---|---|
| AI key 在前端 | 任何人可提取、无限调用，账单不可控 |
| 提醒依赖页面开着 | 关掉浏览器就收不到，这是最大体验缺口 |
| 数据只在单台设备 | 换手机、清缓存即丢 |
| 无账号 | 无法多端、无法做付费 |
| 文件解析在前端 | 每次多下载代码，旧浏览器兼容差 |
| 无审计/限流 | 被刷、被滥用无法止损 |

---

## 二、演进路线（三选一）

### 路线 A：继续纯前端 + 本地（不接后端）

适合：只自己用、只验证想法。

- 优点：零成本、开发快
- 缺点：上面所有硬伤都留着
- 唯一能补的：把 key 换成本地代理（自己电脑上跑个小服务），但仍然不是产品级

### 路线 B：BaaS 轻后端（推荐先走这步）

用 Supabase / Firebase / LeanCloud 这类托管服务：

```
前端 ──HTTPS──> Supabase
                 ├─ Auth（手机号/微信/邮箱）
                 ├─ Postgres（行级权限 RLS）
                 ├─ Storage（语音、导入文件）
                 └─ Edge Function（AI 代理、定时任务）
```

- 2～3 天能接完登录 + 云同步
- 不用自己运维数据库
- AI key 放进 Edge Function，前端只拿结果
- 缺点：推送能力有限（Supabase 无原生 Push，需要另接）

### 国内 BaaS 选型（**面向国内用户时优先看这段**）

| 方案 | 国内访问 | 账号体系 | 云函数 | 备案 | 结论 |
|---|---|---|---|---|---|
| **LeanCloud** | 快（上海/华北节点） | 用户名 / 邮箱 / 手机号 | Node.js | 生产建议绑定已备案域名 | ✅ 当前实现，推荐 |
| 腾讯云开发 CloudBase | 快 | 微信 / 手机号 / 匿名 | Node.js | 实名 + 备案 | 以后做小程序时优先 |
| Supabase | 慢、不稳定 | 邮箱 | Deno | — | ❌ 仅海外用户 |
| 自建 | 取决于机房 | 自建 | — | 需备案 | 长期形态 |

已落地的是 **LeanCloud 适配器**（`cloud.js`），Supabase 保留为备选；切换只改 `BAAS_CONFIG.provider`。

### 国内上线合规清单

- **ICP 备案**：域名必须备案，否则无法在大陆正常访问；LeanCloud 生产环境要求绑定自己的已备案域名
- **隐私政策 + 用户协议**：首次启动要有勾选同意，不能默认勾选
- **实名认证**：若涉及内容发布/社交需实名；工具类通常要求账号可溯源
- **个人信息最小化**：取件码、课表属于个人信息，需说明收集目的与保存期限
- **数据境内存储**：LeanCloud 国内节点数据在境内；不要用海外节点存国内用户数据
- **未成年人**：大学生为主，但仍建议加「已满 14 周岁」确认
- **注销与导出**：提供「删除账号 + 导出数据」入口（当前有导出能力，删除入口待做）

### 路线 C：自建后端（长期形态，推荐最终走这条）
```
┌──────────┐     ┌─────────────────────────────────┐
│ 手机 App  │────▶│  API 网关（Nginx / Caddy）        │
│ (PWA/原生)│     └────────────┬────────────────────┘
└──────────┘                  ▼
                    ┌──────────────────────┐
                    │ 应用服务（Node/Nest） │
                    │ ├─ 认证 / 用户        │
                    │ ├─ 待办 / 课表        │
                    │ ├─ 提醒调度           │
                    │ ├─ AI 网关            │
                    │ └─ 文件解析           │
                    └───────┬──────────────┘
             ┌──────────────┼───────────────┐
             ▼              ▼               ▼
        PostgreSQL       Redis           对象存储
        (主数据)      (缓存/队列)      (语音/文件)
                            │
                            ▼
                   推送服务（Web Push / FCM / APNs）
```

推荐技术栈：

| 层 | 选型 | 理由 |
|---|---|---|
| 运行时 | Node.js 20 + TypeScript | 与前端同语言，团队成本低 |
| 框架 | NestJS 或 Hono | 模块化、DI、好测试；Hono 更轻 |
| 数据库 | PostgreSQL + Prisma | 关系型适合待办/课表，迁移方便 |
| 缓存/队列 | Redis + BullMQ | 提醒调度、AI 限流 |
| 推送 | Web Push(VAPID) + FCM | 安卓免费用 FCM，iOS 走 Safari Push |
| 文件解析 | 服务端 SheetJS + mammoth | 前端包体从 1MB 降到 0，兼容性更好 |
| 部署 | Docker + 云主机 / Fly.io / Railway | 起步一台 2C4G 足够 |
| 监控 | Sentry + 简单日志 | 先能定位错误即可 |

---

## 三、数据模型

```sql
-- 用户
users(id, phone, nickname, timezone, created_at)

-- 设备（推送凭证）
devices(id, user_id, platform, push_token, last_seen_at)

-- 待办
todos(
  id, user_id, text,
  reminder_at timestamptz, pickup_code text,
  done bool default false, notified_at timestamptz,
  created_at, updated_at
)

-- 课表
terms(id, user_id, name, start_monday date)
courses(
  id, term_id, name, teacher, room,
  weekday smallint,        -- 1-7
  start_period smallint, end_period smallint,
  weeks smallint[],        -- 例如 {1,2,...,16}
  created_at
)
periods(term_id, index, starts_at time, ends_at time)

-- 提醒任务（由待办/课程派生的调度表）
reminders(
  id, user_id, source_type,   -- todo | course
  source_id, fire_at timestamptz,
  sent bool default false, sent_at
)

-- AI 调用审计
ai_logs(id, user_id, model, tokens_in, tokens_out, cost, created_at)
```

要点：

- `weeks` 用 Postgres 数组，查「今天上什么课」只要 `weekday = ? AND week_no = ANY(weeks)`
- `reminders` 是物化表：新增/修改待办或课程时写入，定时任务只扫这张表，比每次现算便宜
- 前端现在的 localStorage 结构可以原样映射，迁移成本低

---

## 四、API 设计（示例）

```
POST   /auth/sms/send          发送验证码
POST   /auth/sms/verify        登录换取 JWT
GET    /me                     用户信息
GET    /todos                  列表（支持 ?done=0）
POST   /todos                  新建
PATCH  /todos/:id              编辑
DELETE /todos/:id              删除
GET    /schedule?from&days     课表展开
POST   /courses                新增课程
POST   /courses/import         上传 xlsx/docx，服务端解析
POST   /ai/chat                代理 AI，带上下文与限额
POST   /devices                注册推送 token
```

原则：

1. **前端不再持有 AI key**，一律走 `/ai/chat`
2. 导入解析放服务端，前端只传文件
3. 提醒由服务端算，前端只展示

---

## 五、提醒与推送（最关键的一块）

当前「页面开着才提醒」必须换掉。落地方案：

```
用户设置提醒
   → 写 reminders(fire_at)
   → 定时任务（每 30s 扫一次到期的）
   → 推送网关
       ├─ Web：Web Push（VAPID，Service Worker 接收）
       ├─ 安卓原生：FCM
       └─ iOS：APNs / Safari Web Push
```

注意事项：

- **iOS 的 Web Push 要求「添加到主屏幕」**，且系统版本 ≥ 16.4
- 推送只是「叫醒用户」，点开后的数据还是走 API
- 断网/关推送时要有兜底：打开 App 时补发未读提醒
- 国内安卓建议接厂商通道（小米/华为/OPPO），否则 FCM 可能收不到

---

## 六、AI 网关

后端代理 AI 的价值不止是藏 key：

| 能力 | 说明 |
|---|---|
| 密钥托管 | 前端拿不到 key |
| 限额 | 按用户/按天限流，防刷 |
| 缓存 | 相同请求命中缓存，省 token |
| 审计 | 记录 tokens、成本，可对账 |
| 降级 | 主模型失败自动切备用 |
| 结构化输出 | 课表解析在服务端做，返回校验后的 JSON |

建议接口：

```
POST /ai/chat        { messages, tools? } → { message }
POST /ai/parse-course { text }             → { courses: [...] }
POST /ai/parse-sms    { text }             → { code, station, deadline }
```

---

## 七、安全与隐私

- 取件码、课表含姓名/学校/地址，属于敏感数据
- 传输必须 HTTPS；数据库字段可考虑应用层加密（至少 push_token 加密）
- 日志里不要打印原文，只记长度/哈希
- 用户可「一键导出 / 一键删除全部数据」（合规需要）
- 未成年人（大学生）场景：不做画像、不做广告

---

## 八、迁移路径（建议按这个顺序）

| 阶段 | 做什么 | 预计工作量 |
|---|---|---|
| 1 | 抽出 `api.js`，把本地读写改成可替换的数据层 | 1 天 |
| 2 | 接 Supabase：登录 + 待办云同步 | 2–3 天 |
| 3 | AI 代理上 Edge Function，前端删 key | 1 天 |
| 4 | 提醒搬到服务端 + Web Push | 3–5 天 |
| 5 | 课表上云 + 服务端导入解析 | 2 天 |
| 6 | 语音上传对象存储（替代 IndexedDB） | 1 天 |
| 7 | 监控、限流、备份 | 持续 |

关键点：**第 1 步先做数据层抽象**。现在 `app.js` 里直接调 `localStorage`，先包一层 `Store.get/set`，后面换后端只改这一层，业务代码不动。

---

## 九、成本粗估（自建，1 万用户量级）

| 项 | 估算 |
|---|---|
| 云主机 2C4G | ¥60–120 / 月 |
| PostgreSQL 托管 | ¥50–100 / 月 |
| 对象存储（语音） | 按量，¥10–30 / 月 |
| AI 调用 | 按量，主要成本，需限额 |
| 域名 + 证书 | ¥100 / 年 |

BaaS 方案起步更便宜（免费额度够小规模用），用户量上来再迁自建。

---

## 十、风险清单

1. **推送达率**：国内安卓厂商通道接入复杂，可能要 1–2 周
2. **教务系统数据**：不做爬虫，坚持文件导入，规避封号与合规风险
3. **AI 成本失控**：必须做用户级限额 + 缓存
4. **多端一致**：离线编辑冲突，建议先用「最后写入获胜」+ 版本号
5. **原生壳**：如果要做读短信，得用 Capacitor，会引入构建链，建议放到最后

---

## 附：现在可以立刻做的三件小事

1. 把 `localStorage` 读写集中到 `Store` 模块（为迁移铺路）
2. `config.js` 里的 key 改成从 `location` 或环境注入，避免仓库泄露
3. 给课表加「导出 JSON」，方便以后导入后端
