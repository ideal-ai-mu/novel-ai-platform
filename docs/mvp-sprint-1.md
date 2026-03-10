# MVP Sprint 1 (最小可运行目标)

## 1. Sprint 目标

在 Windows 上交付一个可运行的 Electron 桌面应用，形成最小闭环：

1. 应用启动初始化（`app.init`）  
2. 创建/管理小说项目  
3. 创建/编辑章节（含关键规划字段）  
4. 触发 AI 章节总结并生成建议  
5. 在“待确认更新”面板中接受/拒绝建议  
6. 严格保证 AI 不自动覆盖 `user_confirmed` 内容

## 2. In Scope（第一阶段必须完成）

- 桌面壳：Electron + React + TypeScript 可启动、可打包运行。
- 存储拓扑：单应用 SQLite + 多 `NovelProject`（暂不做每项目物理目录）。
- 初始化：`app.init` 完成配置加载、数据库初始化、迁移检查。
- 项目管理：`NovelProject` 基础 CRUD。
- 章节管理：`Chapter` 基础 CRUD + 正文编辑与保存，至少支持字段：
  - `status`
  - `goal`
  - `outline_ai`
  - `outline_user`
  - `next_hook`
- AI 总结：按章节触发，输出结构化建议并写入 `AiSuggestion(pending)`。
- 建议处理：支持 `接受/拒绝`，`suggestion.apply` 返回 `status`、`appliedChanges`、`blockedFields`。
- 覆盖保护：应用建议前校验确认字段，命中则 `blocked`，不得自动改写。

## 3. Out of Scope（第一阶段不做）

- 每项目一个目录 + `project.db` 的物理存储结构。
- Character / LoreEntry / Foreshadowing / TimelineEvent 的完整 UI CRUD。
- 云同步、多端协作、账号系统。
- 高级一致性规则引擎与复杂冲突合并。
- 多模型路由、提示词配置中心、流式细粒度推送。

## 4. 交付物

1. Windows 桌面应用（开发环境可运行，产物可打包）。  
2. 应用级 SQLite 持久化（单库多项目，重启后数据不丢失）。  
3. `app.init` 初始化链路与初始化结果回传。  
4. 项目与章节基础操作页面（含章节规划字段）。  
5. AI 建议面板与处理动作（接受/拒绝）。  
6. 基础错误提示（参数错误、资源不存在、确认冲突、初始化失败）。  

## 5. 验收标准（DoD）

- 启动应用后调用 `app.init` 成功，返回 `ready: true` 与 `single-db-multi-project` 拓扑标识。
- 可创建项目并持久化；应用重启后项目数据可读取。
- 在同一项目下可新增/编辑/删除章节，且可保存并读取：
  - `status`
  - `goal`
  - `outline_ai`
  - `outline_user`
  - `next_hook`
- 对章节执行“AI 总结”后，能看到 `pending` 建议。
- 调用 `suggestion.apply` 后返回结构包含：
  - `status`
  - `appliedChanges`
  - `blockedFields`
- 点击“接受”后：
  - 未命中确认字段：建议被应用，状态 `accepted`。
  - 命中确认字段：禁止覆盖，状态 `blocked`。
- 点击“拒绝”后：业务实体不变，建议状态 `rejected`。

## 6. 建议任务顺序

1. 工程骨架与进程通信基础（main/preload/renderer）。  
2. `app.init` 与单库初始化（migrations + health check）。  
3. `NovelProject` + `Chapter` 数据访问与 IPC。  
4. 章节编辑与保存链路（含规划字段）。  
5. AI 总结适配与 `AiSuggestion` 落库。  
6. 建议面板与接受/拒绝流程。  
7. 覆盖保护规则与最小回归测试。  
