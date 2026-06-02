# IPC 规划

## 1. 状态标识规则
- `[主流程]`：当前首页、章节管理页、写作页等主路径正在直接使用的 IPC。
- `[兼容保留（非当前主流程）]`：IPC 仍然真实存在、仍然受支持，但当前首页主流程没有重新把它作为核心前台入口暴露。
- `[已废弃/已删除]`：只有接口已经不再保留或明确准备移除时才使用；若仍在代码中保留兼容处理，则先标为兼容保留。

## 2. 总体原则
- renderer 不直接访问数据库。
- renderer 只通过 `window.appApi` 调用能力。
- preload 只暴露受控 API，不透传 Electron 原生对象。
- IPC 名称尽量稳定，避免前端频繁跟着重构。
- 当前文档描述的是整个项目当前 IPC 全貌，而不是单轮拆分说明。

## 3. 当前调用链

```text
renderer page / modal
  -> window.appApi (preload)
  -> ipcRenderer.invoke / ipcRenderer.on
  -> ipcMain.handle / 领域 handler
  -> AppDatabase / AIService
  -> repository / local SQLite
```

## 4. IPC 文件组织（当前实现）
- `src/main/ipc/register-handlers.ts`：聚合注册入口
- `src/main/ipc/app-project-ipc.ts`：app + project 相关注册
- `src/main/ipc/chapter-ipc.ts`：chapter 相关注册
- `src/main/ipc/knowledge-ipc.ts`：character / lore 相关注册
- `src/main/ipc/pit-suggestion-ipc.ts`：pit / suggestion 相关注册
- `src/main/ipc/ai-ipc.ts`：AI 能力注册
- `src/main/ipc/ai-support.ts`：AI 相关上下文辅助
- `src/main/ipc/runtime.ts`、`types.ts`：注册运行时上下文与类型

## 5. [主流程] 当前主流程 UI 直接使用的 IPC

### 5.1 [主流程] app
- `app.init`
- `app.autosaveIntervalChanged`

### 5.2 [主流程] project
- `project.list`
- `project.listDeleted`
- `project.create`
- `project.get`
- `project.delete`
- `project.restore`
- `project.deletePermanent`

说明：
- 当前首页完成组件抽取后，`HomeHeader`、`HomeEmptyState`、`ProjectSummaryStrip`、`DeletedProjectSummaryStrip` 仍然复用 `project.* / chapter.* / app.*` IPC；组件本身不直接调用 IPC，统一由 controller 编排。

### 5.3 [主流程] chapter
当前主流程直接用到的章节接口主要包括：
- `chapter.list`
- `chapter.listDeleted`
- `chapter.create`
- `chapter.get`
- `chapter.update`
- `chapter.delete`
- `chapter.restore`
- `chapter.deletePermanent`

说明：
- 这些接口支撑当前章节管理页、章节回收站和写作页。
- 章节管理页完成组件抽取后，`ChapterHeaderBar`、`ChapterTabs`、`ChapterToolbar`、`ChapterFilterBar`、`ChapterListRow`、`ChapterRecycleRow`、`ChapterEmptyState` 仍然复用同一组 `chapter.* / project.*` IPC；组件本身不直接调用 IPC。
- `useWorkspaceController` 已继续按 `hooks/workspace/*` 拆成顶层装配 + 页面级 controller（`useHomeController` / `useChapterManagementController` / `useWriterController`）+ 局部状态 hook（`useWorkspaceMenus`）；IPC 编排边界不变，controller 子 hook 只负责 renderer 状态与行为拆分，不改变 preload / IPC 名称。

## 6. [兼容保留（非当前主流程）] 已保留但尚未完全重新接回首页的 IPC 能力

### 6.1 [兼容保留（非当前主流程）] 章节关联与上下文引用
- `chapter.refs.get`
- `chapter.refs.update`
- `chapter.getContextRefs`
- `chapter.addContextRef`
- `chapter.removeContextRef`
- `chapter.updateContextRef`
- `chapter.autoPickContextRefs`
- `chapter.listOutlinesByProject`

### 6.2 [兼容保留（非当前主流程）] AI
- `ai.extractOutline`
- `ai.generateChapterTitle`
- `ai.generateChapterGoal`
- `ai.generateChapterNextHook`
- `ai.reviewChapterPitResponses`
- `ai.reviewChapterPitCandidates`

说明：
- AI 服务链仍然可用。
- 当前首页主流程只保留了开书灵感入口，没有把完整 AI 写作工作流重新接回前台。

### 6.3 [兼容保留（非当前主流程）] pit
- `pit.listByProject`
- `pit.listGroupedByProject`
- `pit.listAvailableForChapter`
- `pit.createManual`
- `pit.update`
- `pit.delete`

以及章节下的坑位接口：
- `chapter.listCreatedPits`
- `chapter.listResolvedPits`
- `chapter.listPlannedPits`
- `chapter.planPitResponse`
- `chapter.unplanPitResponse`
- `chapter.listPitReviews`
- `chapter.reviewPitResponse`
- `chapter.clearPitReview`
- `chapter.listPitCandidates`
- `chapter.createPitCandidateManual`
- `chapter.updatePitCandidate`
- `chapter.deletePitCandidate`
- `chapter.reviewPitCandidate`
- `chapter.getPitSuggestions`
- `chapter.createPitFromSuggestion`
- `chapter.createPitManual`
- `chapter.createPit`
- `chapter.generatePitsFromContent`
- `chapter.applyGeneratedPits`
- `chapter.resolvePit`
- `chapter.unresolvePit`

### 6.4 [兼容保留（非当前主流程）] character / lore
- `character.list`
- `character.create`
- `character.get`
- `character.update`
- `character.delete`
- `lore.list`
- `lore.create`
- `lore.get`
- `lore.update`
- `lore.delete`

### 6.5 [兼容保留（非当前主流程）] suggestion
- `suggestion.listByEntity`
- `suggestion.createMock`
- `suggestion.apply`
- `suggestion.reject`

说明：
- Suggestion 工作流仍保留在后端和 IPC 层。
- 当前主界面收敛后，没有把它作为首页核心入口保留。

## 7. shared / preload 契约
- `src/shared/ipc.ts`：IPC channel 常量、输入输出类型、核心实体类型
- `src/shared/preload-api.ts`：renderer 可见 API 形状
- `src/preload/preload.ts`：通过 `contextBridge` 挂载 `window.appApi`

当前要求：
- renderer 不直接 new 数据层对象
- renderer 不自行拼装数据库查询
- renderer 不直接碰 Electron `ipcRenderer`

## 8. 当前实现边界
- handler 负责接收参数、最小校验、调用门面/服务。
- 复杂 SQL 不再堆在 IPC 文件中。
- `AppDatabase` 作为稳定 facade，对外保持方法形状相对稳定。
- repository 是 SQL 与领域读写的主要承载位置。
- `shared/ipc.ts` 是 renderer / preload / main 共同依赖的类型单一来源。

## 9. 当前兼容原则
- 近期重构中，优先保持 IPC 名称与 payload 向前兼容。
- 结构拆分（如 `main/ipc`、`main/db`）属于实现边界调整，不应迫使 renderer 逐轮改接口。
- 如果后续确实要废弃某个 IPC，应先在文档中标记废弃，再统一迁移，不直接静默删除。

## 10. 当前整体口径
- 本文档明确区分：`[主流程]` 与 `[兼容保留（非当前主流程）]` 两类 IPC。
- 以后新增接口，应加到对应领域下；修改已有接口，应直接修改原条目；废弃接口，应明确标记，而不是用局部“本轮同步”替代全局说明。
