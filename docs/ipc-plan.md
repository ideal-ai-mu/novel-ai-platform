# IPC Plan

## 1. 范围说明

本文档描述当前阶段需要的最小 IPC 集合，重点覆盖：
- 应用初始化
- 项目 / 章节 / 设定基础读写
- AI 提炼梗概真实闭环
- 标题 / 目标 AI 生成
- 参考章节系统
- 填坑 / 埋坑线索管理
- 章节梗概总览
- 全部坑内容总览

约束：
- renderer 不直连数据库
- renderer 不直接拼 prompt
- 所有查询、校验、上下文组装和落库都由 main 完成

## 2. 统一响应结构

```ts
type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
```

## 3. 当前核心 IPC

### app

- `app.init`

### project

- `project.list`
- `project.create`
- `project.get`
- `project.delete`

### chapter

- `chapter.list`
- `chapter.create`
- `chapter.get`
- `chapter.update`
- `chapter.delete`
- `chapter.refs.get`
- `chapter.refs.update`
- `chapter.getContextRefs`
- `chapter.addContextRef`
- `chapter.removeContextRef`
- `chapter.updateContextRef`
- `chapter.autoPickContextRefs`
- `chapter.listOutlinesByProject`
- `chapter.listCreatedPits`
- `chapter.listResolvedPits`
- `chapter.getPitSuggestions`
- `chapter.createPitFromSuggestion`
- `chapter.createPitManual`
- `chapter.resolvePit`
- `chapter.unresolvePit`

### ai

- `ai.extractOutline`
- `ai.generateChapterTitle`
- `ai.generateChapterGoal`

### pit

- `pit.listByProject`
- `pit.listGroupedByProject`
- `pit.listAvailableForChapter`
- `pit.createManual`
- `pit.update`
- `pit.delete`

### suggestion

- `suggestion.listByEntity`
- `suggestion.createMock`
- `suggestion.apply`
- `suggestion.reject`

### character / lore

- `character.list/create/get/update/delete`
- `lore.list/create/get/update/delete`

## 4. 统一上下文组装与模型调用职责

main 层负责：
- 查询项目、章节、关联角色 / 设定、参考章节、填坑 / 埋坑
- 调用 `ContextAssembler` 生成结构化 `ChapterAiContext`
- 调用 `PromptBuilder` 生成模型输入
- 调用 provider
- 根据用户确认结果决定是否落库

renderer 只负责：
- 触发 IPC
- 展示候选结果
- 让用户确认是否应用

## 5. AI 相关 IPC

### 5.1 `ai.extractOutline`

用途：
- 从当前章节发起 AI 提炼梗概

请求：

```ts
{ chapterId: string }
```

职责：
1. 根据 `chapterId` 读取需要的上下文
2. 通过 `ContextAssembler` 组装统一 AI 上下文
3. 通过 `PromptBuilder` 生成模型输入
4. 调用 AI provider
5. 返回候选梗概
6. 不直接落库，不直接覆盖 `outline_user`

### 5.2 `ai.generateChapterTitle`

用途：
- 基于当前 AI 参考上下文生成章节标题候选

请求：

```ts
{ chapterId: string }
```

职责：
1. main 层读取当前章节上下文
2. 通过 `ContextAssembler / PromptBuilder` 组装
3. 调用 AI provider
4. 返回候选文本
5. 不直接落库

### 5.3 `ai.generateChapterGoal`

用途：
- 基于当前 AI 参考上下文生成本章目标候选

请求：

```ts
{ chapterId: string }
```

职责与 `ai.generateChapterTitle` 一致：
- 读取上下文
- 统一组装
- 调用 provider
- 返回候选文本
- 不直接落库

### 5.4 `chapter.update`

当前阶段继续复用 `chapter.update` 作为以下确认应用的落库接口：
- 应用候选标题
- 应用候选目标
- 应用候选梗概

说明：
- 未确认前不得直接覆盖字段
- 写回后应正常更新 `updated_at`

## 6. AI 完成后的刷新要求

确认应用成功后，renderer 需要刷新或同步以下状态：

1. 当前章节详情
2. AI 参考层
3. 章节梗概总览
4. 任何引用本章 `outline_user` 的展示
5. 坑位相关展示
  - 当前章节埋坑 / 填坑
  - 项目级坑位总览

## 7. 参考章节相关 IPC 约束

main 层必须校验，不能只靠前端限制：

1. 只能引用当前章节之前的历史章节
2. 不允许引用当前章自己
3. 不允许引用后续章节
4. 自动推荐也只能从前文中挑选
5. 若章节不在同一项目中，也必须拒绝

## 8. 坑位相关 IPC

### 8.1 `pit.listByProject`

用途：
- 返回项目内全部坑的扁平列表
- 适用于调试、内部复用或简单同步场景

请求：

```ts
{ projectId: string }
```

### 8.2 `pit.listGroupedByProject`

用途：
- 返回项目级“全部坑内容总览”直接可渲染的数据

请求：

```ts
{ projectId: string }
```

返回结构应便于直接渲染为：
- 章节坑
  - 按 chapter 分组
- 作者手动设定坑

示意：

```ts
{
  chapterGroups: Array<{
    chapterId: string;
    index_no: number;
    title: string;
    pits: StoryPitView[];
  }>;
  manualPits: StoryPitView[];
}
```

### 8.3 `pit.listAvailableForChapter`

用途：
- 返回当前章节可用于“填坑”的坑列表

请求：

```ts
{ chapterId: string }
```

强约束：
- 只能返回当前章节之前已存在的坑
- 不能返回未来章节产生的坑
- 不返回当前章节自己新埋的坑
- 章节坑和作者手动设定坑都可以返回

### 8.4 `pit.createManual`

用途：
- 在项目级总览中手动添加“作者手动设定坑”

请求：

```ts
{
  projectId: string;
  content: string;
}
```

落库语义：
- `type = manual`
- `origin_chapter_id = null`

说明：
- 当前产品层不再把 `creation_method` 作为用户可见核心字段

### 8.5 `pit.update`

用途：
- 更新坑内容

说明：
- 修改的是 `StoryPit.content` 本身
- 编辑后必须联动刷新：
  - 当前章节填坑 / 埋坑层
  - 全部坑内容总览
  - AI 参考层中涉及本章填坑 / 埋坑的摘要

### 8.6 `pit.delete`

用途：
- 删除坑

## 9. 章节内坑位 IPC

### 9.1 `chapter.listCreatedPits`

用途：
- 读取当前章节产生的坑

### 9.2 `chapter.listResolvedPits`

用途：
- 读取当前章节填掉的坑

### 9.3 `chapter.getPitSuggestions`

用途：
- 打开“新增坑”面板时，获取 AI 推荐坑候选

请求：

```ts
{ chapterId: string }
```

职责：
1. 读取当前章节正文、章节标题、本章目标、本章梗概
2. 读取 AI 参考层对应上下文
3. 通过 `ContextAssembler / PromptBuilder` 组装
4. 调用 AI provider
5. 返回 2 到 4 条候选
6. 不直接落库

强约束：
- 当前上下文明显不足时，应返回可理解错误，而不是硬调 AI

### 9.4 `chapter.createPitFromSuggestion`

用途：
- 用户选中 AI 候选后，创建一条章节坑

请求：

```ts
{
  chapterId: string;
  content: string;
}
```

落库语义：
- `type = chapter`
- `origin_chapter_id = 当前章节`

说明：
- 用户可以在应用前微调内容
- 不在 UI 中长期强调“AI 生成”标签

### 9.5 `chapter.createPitManual`

用途：
- 当前章节直接手动创建一条章节坑

请求：

```ts
{
  chapterId: string;
  content: string;
}
```

落库语义：
- `type = chapter`
- `origin_chapter_id = 当前章节`

### 9.6 `chapter.resolvePit`

用途：
- 在当前章节中选择一条旧坑并标记为已填

请求：

```ts
{
  chapterId: string;
  pitId: string;
}
```

强约束：
- 当前章节“填坑”时，只能选择当前章节之前已存在的坑
- 不能填未来章节产生的坑

### 9.7 `chapter.unresolvePit`

用途：
- 撤销当前章节对某条坑的填坑标记

### 9.8 旧语义说明

当前阶段删除或废弃与“本章是否埋坑”开关强绑定的 IPC 语义：
- 不再要求用户先开启埋坑，才能新增坑
- 不再以开关限制 AI 候选生成
- 一个章节是否埋坑，由该章是否实际新增了坑自然体现

## 10. AI 参考层的数据来源

renderer 需要组合以下数据：

1. 当前章节
2. 当前章节关联角色 / 设定
3. 当前章节参考章节
4. 当前章节已填坑
5. 当前章节已埋坑

然后渲染 AI 参考层。

注意：
- AI 参考层是用户可读的只读视图
- 真正给模型用的上下文必须来自 main 侧 `ContextAssembler`

## 11. preload 暴露建议

```ts
window.appApi = {
  app: { init, onAutosaveIntervalChanged },
  project: { list, create, get, delete },
  chapter: {
    list,
    create,
    get,
    update,
    delete,
    getRefs,
    updateRefs,
    getContextRefs,
    addContextRef,
    removeContextRef,
    updateContextRef,
    autoPickContextRefs,
    listOutlinesByProject,
    listCreatedPits,
    listResolvedPits,
    getPitSuggestions,
    createPitFromSuggestion,
    createPitManual,
    resolvePit,
    unresolvePit
  },
  ai: {
    extractOutline,
    generateChapterTitle,
    generateChapterGoal
  },
  pit: {
    listByProject,
    listGroupedByProject,
    listAvailableForChapter,
    createManual,
    update,
    delete
  },
  character: { list, create, get, update, delete },
  lore: { list, create, get, update, delete },
  suggestion: { listByEntity, createMock, apply, reject }
}
```

## 12. 当前阶段不做

- 章节记忆卡 / 摘要卡新体系
- embedding / 复杂语义检索
- issue tracker 式任务系统
- 导入导出
- 云同步
- renderer 直连数据库

## 13. 本轮补充：填坑选择面板语义

- `pit.listAvailableForChapter` 继续作为“填坑”候选来源，但 renderer 不再把它直接渲染成常驻下拉框。
- 章节层点击“选择填坑”后，先读取前文可填坑列表，再在弹窗内选择、编辑、确认。
- 确认流程为：
  1. 选中某条可填坑
  2. 如有需要，先通过 `pit.update` 更新 `StoryPit.content`
  3. 再调用 `chapter.resolvePit`
- 这样可保证“填坑”与“埋坑”在交互层都保持按钮入口 + 面板确认的统一方式。

## 14. 本轮补充：`ai.extractOutline` 的输入约束

- `ai.extractOutline` 当前阶段应以“当前章节正文”为核心输入。
- main 层在构造该任务的 `PromptPayload` 时，不应把现有 `Chapter.outline_user` 作为摘要提炼的主要输入回灌。
- 目标是生成“基于正文更新后的候选摘要”，而不是对旧摘要做递归改写。
- renderer 继续只负责触发、展示候选、让用户确认；不直接拼 prompt。

## 15. 本轮补充：`ai.extractOutline` 的回退行为

- 当当前正文为空时，`ai.extractOutline` 不必强制失败。
- 若当前章节已经具备足够 AI 参考上下文，则 main 仍可：
  1. 查询章节上下文
  2. 通过 `ContextAssembler / PromptBuilder` 组装结构化输入
  3. 生成一版基于章节规划与参考信息的候选摘要
- 但该任务中必须继续排除当前 `outline_user`，避免摘要递归套娃。
