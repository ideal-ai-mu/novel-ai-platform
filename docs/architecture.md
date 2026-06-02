# 架构说明

## 1. 状态标识规则
为避免把“当前仍在代码里”误判成“当前仍是主流程”，本项目文档统一使用以下状态标识：

- `[主流程]`：当前用户在主界面中可以直接进入、直接操作、并且是当前产品主路径的一部分。
- `[兼容保留（非当前主流程）]`：能力仍然真实存在于代码、数据层、IPC 或 AI 服务层中，但当前首页/主界面没有把它重新接回主流程入口。
- `[已废弃/已删除]`：能力已经不再建议使用，或已从当前实现中移除。只有真正删除时，才从文档中移除；若仍保留兼容代码，则应先标成兼容保留，而不是直接抹掉。

后续所有文档更新，都应先判断内容属于哪一种状态，再做新增、修改、废弃或删除。

## 2. 项目定位
`Novel AI Studio` 是一个基于 Electron 的 Windows 桌面创作工作台，目标是服务长篇小说创作，而不是通用后台或简单 CRUD 工具。

当前整体产品语义分为四层：
- 作品层：作品管理、作品回收、创建新书、开书灵感
- 结构层：章节管理、章节回收站、历史章节引用
- 写作层：轻量写作页、章节标题、正文、自动保存
- AI / 结构化辅助层：AI 提炼梗概、章节字段生成、坑位建议、章节上下文引用、Suggestion 工作流、知识与设定数据层

## 3. 当前整体技术栈
- Electron
- React
- TypeScript
- SQLite（通过 `sql.js` 做本地单库持久化）
- Local-first

## 4. 当前目录结构（关键部分）

```text
src/
  main/
    ai/
      ai-service.ts
      context-assembler.ts
      prompt-builder.ts
      provider.ts
      mock-provider.ts
      real-provider.ts
    db/
      database.ts
      schema.ts
      errors.ts
      mappers.ts
      suggestion-helpers.ts
      entity-loaders.ts
      repository-contexts.ts
      repositories/
        project-repository.ts
        chapter-repository.ts
        context-ref-repository.ts
        pit-repository.ts
        knowledge-repository.ts
        suggestion-repository.ts
    ipc/
      register-handlers.ts
      app-project-ipc.ts
      chapter-ipc.ts
      knowledge-ipc.ts
      pit-suggestion-ipc.ts
      ai-ipc.ts
      ai-support.ts
      runtime.ts
      types.ts
    main.ts
  preload/
    preload.ts
  renderer/
    App.tsx
    types.ts
    hooks/
      useWorkspaceController.tsx
      workspace/
        useHomeController.tsx
        useChapterManagementController.tsx
        useWriterController.ts
        useWorkspaceMenus.ts
    pages/
      HomePage.tsx
      ChapterManagementPage.tsx
      WriterPage.tsx
    components/
      SidebarNav.tsx
      chapters/
        ChapterHeaderBar.tsx
        ChapterTabs.tsx
        ChapterToolbar.tsx
        ChapterFilterBar.tsx
        ChapterListRow.tsx
        ChapterRecycleRow.tsx
        ChapterEmptyState.tsx
      home/
        HomeHeader.tsx
        HomeEmptyState.tsx
        ProjectSummaryStrip.tsx
        DeletedProjectSummaryStrip.tsx
      modals/
        CreateBookModal.tsx
        InspirationModal.tsx
    styles/
      base.css
      home.css
      chapter-management.css
      writer.css
      modals.css
      responsive.css
    styles.css
  shared/
    ipc.ts
    preload-api.ts
```

## 5. 当前分层职责

### 5.1 main process
职责：
- Electron 生命周期管理
- `BrowserWindow` 创建与 preload 挂载
- 应用菜单注册
- IPC 注册入口调用

当前文件：
- `src/main/main.ts`

### 5.2 IPC 层
职责：
- 作为 renderer 与主进程之间的受控边界
- 做最小参数接收与分发
- 调用 `AppDatabase` 和 AI 服务
- 保持 renderer 不直接接触数据库和 Electron 原生对象

当前按领域拆分：
- `app-project-ipc.ts`
- `chapter-ipc.ts`
- `knowledge-ipc.ts`
- `pit-suggestion-ipc.ts`
- `ai-ipc.ts`
- `register-handlers.ts` 仅保留聚合注册职责

### 5.3 DB / Repository 层
职责：
- 本地 SQLite 初始化、持久化和 schema bootstrap
- 门面 `AppDatabase` 向 IPC 提供稳定调用接口
- 领域 repository 负责按实体边界组织 SQL 与写入逻辑
- mapper、entity loader、context 组装与 suggestion helper 下沉，避免 `database.ts` 继续膨胀

当前边界：
- `database.ts`：门面、初始化、事务/底层查询入口、公共装配
- `schema.ts`：建表、索引、schema 升级补丁
- `mappers.ts`：行映射、JSON 解析、字段归一化
- `suggestion-helpers.ts`：patch 解析、mock 建议生成等纯 helper
- `entity-loaders.ts`：实体装载、删除联动、通用加载逻辑
- `repository-contexts.ts`：repository context 组装
- `repositories/*`：项目、章节、上下文引用、坑、知识、建议等领域仓储

### 5.4 AI 层
职责：
- 统一 AI provider 抽象
- ContextAssembler 负责组装结构化上下文
- PromptBuilder 负责把上下文转成模型输入
- AIService 对外提供统一能力接口

当前文件：
- `src/main/ai/context-assembler.ts`
- `src/main/ai/prompt-builder.ts`
- `src/main/ai/ai-service.ts`
- `src/main/ai/provider.ts`
- `src/main/ai/mock-provider.ts`
- `src/main/ai/real-provider.ts`

### 5.5 preload
职责：
- 通过 `contextBridge.exposeInMainWorld('appApi', ...)` 暴露受控 API
- 保持 renderer 只通过 `window.appApi` 调用 IPC

当前文件：
- `src/preload/preload.ts`
- `src/shared/preload-api.ts`

### 5.6 renderer
职责：
- 当前 UI 主流程渲染
- 页面切换与弹窗编排
- 通过 preload API 调用主进程
- 不直接连接数据库

当前页面与组件：
- 页面：`HomePage`、`ChapterManagementPage`、`WriterPage`
- 侧栏：`SidebarNav`
- 章节页组件：`ChapterHeaderBar`、`ChapterTabs`、`ChapterToolbar`、`ChapterFilterBar`、`ChapterListRow`、`ChapterRecycleRow`、`ChapterEmptyState`
- 首页组件：`HomeHeader`、`HomeEmptyState`、`ProjectSummaryStrip`、`DeletedProjectSummaryStrip`
- 弹窗：`CreateBookModal`、`InspirationModal`
- 顶层控制器：`useWorkspaceController.tsx`
- 页面级 controller：`useHomeController.tsx`、`useChapterManagementController.tsx`、`useWriterController.ts`
- 局部状态 hook：`useWorkspaceMenus.ts`

### 5.7 样式层
职责：
- 按页面与弹窗分文件管理样式
- `styles.css` 作为聚合入口，不再承载全部样式内容

当前分文件：
- `base.css`
- `home.css`
- `chapter-management.css`
- `writer.css`
- `modals.css`
- `responsive.css`

## 6. [主流程] 当前主流程 UI

当前主流程 UI 指的是：用户现在打开应用后，在简化首页体系中可以直接进入并稳定操作的界面。

### 6.1 [主流程] 首页（Home）
左侧只有三个一级导航：
- `作品管理`
- `开书灵感`
- `作品回收`

首页主区当前支持：
- 默认空状态：开书灵感 / 去写作 / 创建新书入口
- 正常作品概览：封面、书名、最近更新、章节数、字数、状态、作品相关、章节管理、创建章节
- 回收作品概览：封面、删除时间、恢复作品、永久删除
- 首页结构已按“头部 / 空状态 / 作品信息带 / 回收信息带”拆成独立组件，`HomePage` 主要承担装配职责，而不再直接承载大段首页 JSX

### 6.2 [主流程] 章节管理页（ChapterManagementPage）
当前直接可用的章节管理页面主要包含：
- 返回首页
- 当前作品标题
- `章节管理`
- `章节回收站`
- `设置`
- `新建章节`
- 搜索章节
- 章节列表 / 章节回收站列表
- 页面结构已按“头部 / 页签 / 工具栏 / 筛选栏 / 列表行 / 空状态”拆成独立组件，`ChapterManagementPage` 主要承担装配职责

### 6.3 [主流程] 写作页（WriterPage）
当前写作页已接入主流程，支持：
- 当前章节标题编辑
- 正文编辑
- 保存状态显示
- 自动保存提示
- 返回首页或返回章节管理页

### 6.4 [主流程] 当前弹窗
- `CreateBookModal`：创建新书
- `InspirationModal`：开书灵感

## 7. [兼容保留（非当前主流程）] 已保留但尚未重新接回首页的能力

这一部分指的是：后端、数据层、IPC、AI 服务层仍然完整保留，且在代码结构中是真实存在的能力，但当前简化首页主流程还没有把它们重新整合成新的前台入口。

### 7.1 [兼容保留（非当前主流程）] AI 能力
当前已保留：
- `ai.extractOutline`
- `ai.generateChapterTitle`
- `ai.generateChapterGoal`
- `ai.generateChapterNextHook`
- `ai.reviewChapterPitResponses`
- `ai.reviewChapterPitCandidates`

### 7.2 [兼容保留（非当前主流程）] 知识与设定能力
当前已保留：
- Character / LoreEntry 数据模型
- 对应 IPC
- 对应 repository
- 对应关联章节关系数据

### 7.3 [兼容保留（非当前主流程）] 章节上下文引用与章节梗概总览
当前已保留：
- `ChapterContextRef`
- `chapter.getContextRefs` 等接口
- `chapter.listOutlinesByProject`
- `context-ref-repository.ts`

### 7.4 [兼容保留（非当前主流程）] 坑位 / 伏笔 / Suggestion 工作流
当前已保留：
- `StoryPit`
- `ChapterPitPlan`
- `ChapterPitReview`
- `ChapterPitCandidate`
- `AiSuggestion`
- 对应的 IPC、repository 与 AI 审核能力

说明：
- “兼容保留”不等于“已经废弃删除”。
- 当前这部分能力仍然在代码和数据结构中真实存在，只是尚未重新接回当前首页主流程。

## 8. 当前关键业务流

### 8.1 应用启动
1. Electron 启动 main process
2. 创建 BrowserWindow，并挂载 preload
3. renderer 启动后调用 `window.appApi.app.init()`
4. main 侧初始化数据库、schema 与应用基础配置
5. renderer 拉取项目列表、回收作品、章节与章节回收数据

### 8.2 作品管理
- 作品删除进入作品回收
- 作品恢复后重新出现在作品管理列表
- 作品永久删除后从作品回收中清除

### 8.3 章节管理与章节回收站
- 新建章节直接归入当前作品
- 章节删除进入章节回收站
- 章节恢复后重新进入当前作品章节列表
- 章节永久删除后，从章节回收站移除

### 8.4 开书灵感与创建新书
- 首页空状态与右上角 `创建新书` 都提供开书入口
- `开书灵感` 当前仍走弹窗交互
- `去写作` / `创建新书` 通过 hover / click 打开轻量入口菜单

## 9. 当前存储拓扑
- 单应用 SQLite
- 多 `NovelProject`
- 不做每项目独立数据库
- 当前 topology：`single-db-multi-project`
- 数据库路径由 `app.init` 返回给 renderer 用于只读展示

## 10. 当前架构拆分状态

### 已完成
- `main.ts` 已回到入口职责
- `main/ipc` 已按领域拆分
- `database.ts` 已从超重单文件收敛为 facade
- `schema`、`repository`、`mapper`、`helper` 已拆出
- renderer 页面、侧栏、弹窗、样式已开始分文件
- `App.tsx` 已不再承载全部 JSX
- `styles.css` 已成为聚合入口

### 仍待继续拆分
- `useWorkspaceController.tsx` 已继续按页面与局部状态拆到 `hooks/workspace/*`
- 当前已拆出的 controller 子 hook 包括：
  - `useWorkspaceMenus.ts`
  - `useHomeController.tsx`
  - `useChapterManagementController.tsx`
  - `useWriterController.ts`
- `useWorkspaceController.tsx` 仍作为顶层工作台编排入口，但当前主要保留共享数据加载、自动保存链路、跨页面协调与页面/弹窗装配职责
- `mappers.ts` 与 `entity-loaders.ts` 仍然偏大，后续可继续按领域拆细
- 当前主流程 UI 与已保留结构化能力之间，仍有重新整合工作

## 11. 当前约束与边界
- Local-first
- 不接云同步
- 不做富文本编辑器
- 不引入复杂 migration 系统
- preload API 仍然是 renderer 的唯一系统边界
- 当前文档口径以“整个项目的真实现状”为准，而不是单轮改动说明
- 当前文档明确区分：`[主流程]` 与 `[兼容保留（非当前主流程）]`
