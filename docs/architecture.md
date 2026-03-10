# Desktop Architecture (Sprint 1)

## 1. 目标与约束

- 平台：Windows 桌面应用（不是网站）。
- 主路线：Electron + React + TypeScript。
- 数据策略：本地优先（Local-first）。
- 核心原则：
  - 用户确认内容优先级最高。
  - AI 不允许自动覆盖 `user_confirmed` 内容。
  - AI 只能提出建议，最终落库由用户确认驱动。

## 2. Sprint 1 存储拓扑（明确）

- 采用“单应用 SQLite + 多 NovelProject”方案。
- 当前只使用一个应用级数据库文件（示例：`%APPDATA%/NovelAIStudio/app.db`）。
- 所有业务实体共用同一库，通过 `project_id` 进行多项目隔离。
- Sprint 1 暂不实现“每项目一个目录 + project.db”的物理结构。

## 3. 分层架构

```text
Renderer (React UI)
   │  window.appApi.*
   ▼
Preload (contextBridge + typed API)
   │  ipcRenderer.invoke(...)
   ▼
Main Process (IPC handlers + services)
   ├─ Local Storage Layer (single app.db + migrations)
   └─ AI Layer (LLM adapter + structured output parser)
```

## 4. 各层职责

### 4.1 Main Process

- 应用生命周期：窗口创建、菜单、配置加载。
- IPC 路由与权限边界：文件与数据库访问仅在 main 执行。
- 业务服务编排：
  - ProjectService（项目）
  - ChapterService（章节）
  - SuggestionService（AI 建议）
- 一致性规则执行：
  - 写入前检查 `confirmed_fields_json`。
  - AI 输出先进入 `AiSuggestion`，不直接改业务实体。

### 4.2 Preload

- 通过 `contextBridge` 暴露最小 API 面。
- 不暴露 Node 原始能力给 renderer。
- 只转发白名单 IPC，做基础参数校验（建议配合 `zod`）。

### 4.3 Renderer (React)

- 负责 UI 与交互状态。
- 不直接访问文件系统/数据库。
- 典型页面结构：
  - 左侧：项目/章节/设定导航
  - 中间：正文编辑区
  - 右侧：AI 建议与待确认更新面板

### 4.4 Local Storage

- Sprint 1 存储范围：
  - `app.db`：唯一 SQLite 数据库文件（多项目）。
  - 可选应用级资源目录（例如日志、临时导出文件）。
- 数据约束：事务写入、外键约束、WAL 模式。
- 不在 Sprint 1 引入项目级物理目录切分。

### 4.5 AI Layer

- 输入：章节正文与上下文。
- 输出：结构化 JSON 建议。
- 落库策略：只写 `AiSuggestion(status=pending)`，不直接写核心实体。

## 5. 关键流程（Sprint 1）

1. 应用启动后 renderer 调用 `app.init`。
2. main 初始化 `app.db`、执行必要迁移并返回应用初始化信息。
3. 用户编辑章节并保存。
4. renderer 调用 `ai.summarizeChapter`。
5. main 调用 AI layer，解析结构化输出并写入 `AiSuggestion(pending)`。
6. 用户在“待确认更新”面板执行接受/拒绝。
7. 接受时 main 校验字段保护：
   - 命中 `confirmed_fields_json`：返回 `blocked`，不应用变更。
   - 未命中：应用变更并返回已应用字段。

## 6. 后续可演进方向（非 Sprint 1）

- 演进到“每项目一个目录 + project.db + assets”的物理结构。
- 为导入导出提供项目级可移植包（例如 `.nasproj`）。
- 演进方式：
  - 保持逻辑模型不变（仍以 `project_id` 关联）。
  - 通过迁移脚本将单库数据按项目拆分至项目目录。

## 7. 安全与一致性策略

- Electron 安全基线：
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: true`（可行时）
- IPC 规则：
  - 统一请求/响应结构。
  - 输入校验失败直接拒绝。
- 写入规则：
  - AI 建议与业务实体分离存储。
  - 用户确认后才允许实体变更。

## 8. 建议目录映射

```text
src/
  main/       # Electron main + IPC + services
  preload/    # contextBridge API
  renderer/   # React UI
  shared/     # 类型、schema、常量
database/
  migrations/
  schema/
```
