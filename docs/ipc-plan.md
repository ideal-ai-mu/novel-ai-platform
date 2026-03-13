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

### 9.1 `chapter.listPlannedPits`

用途：
- 读取当前章节“计划回应哪些坑”

### 9.2 `chapter.listPitReviews`

用途：
- 读取当前章节正文后的填坑验收结果

### 9.3 `chapter.listPitCandidates`

用途：
- 读取当前章节的埋坑候选

### 9.4 `chapter.getPitSuggestions`

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

### 9.5 `chapter.planPitResponse`

用途：
- 将一条前文旧坑加入“本章计划回应”

说明：
- 这不等于已经填坑完成

### 9.6 `chapter.reviewPitResponse`

用途：
- 在正文完成后，为计划回应坑记录验收结果

说明：
- 支持 `none / partial / clear / resolved`
- 可附简短说明
- 更新后需要同步刷新：
  - 当前章节收束层
  - AI 参考层
  - 项目级正式坑总览

### 9.7 `chapter.reviewPitCandidate`

用途：
- 在正文完成后，为埋坑候选记录确认结果

说明：
- 支持 `draft / weak / confirmed / discarded`
- 只有 `confirmed` 时，main 才转成正式 `StoryPit(type=chapter)`

### 9.8 `chapter.createPitFromSuggestion`

用途：
- 旧文档中的直接建正式坑语义已弱化；当前阶段应优先改为“创建埋坑候选”，而不是立刻成为正式章节坑

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

### 9.9 `chapter.createPitManual`

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

### 9.10 旧语义说明

当前阶段删除或废弃与“本章是否埋坑”开关强绑定的 IPC 语义：
- 不再要求用户先开启埋坑，才能新增坑
- 不再以开关限制 AI 候选生成
- 一个章节是否埋坑，由该章是否实际新增了坑自然体现

## 10. AI 参考层的数据来源

renderer 需要组合以下数据：

1. 当前章节
2. 当前章节关联角色 / 设定
3. 当前章节参考章节
4. 当前章节计划回应坑
5. 当前章节埋坑候选
6. 当前章节正文后的填坑总结 / 埋坑确认结果

然后渲染 AI 参考层。

注意：
- AI 参考层是用户可读的只读视图
- 真正给模型用的上下文必须来自 main 侧 `ContextAssembler`

## 30. 本轮补充：收束层缩略卡片与完成度提示

renderer 侧新增两类纯视图层规则：

1. 填坑总结 / 埋坑确认默认显示缩略卡片，不常驻完整编辑表单。
2. 点击详情后再进入弹窗编辑。
3. 收束层顶部提供完成度提示，至少统计：
   - 已完成填坑验收条数 / 总计划回应坑条数
   - 已确认埋坑候选条数 / 总候选条数
   - 正式摘要是否已存在

这些提示不新增 IPC，也不新增数据库字段；renderer 基于现有查询结果实时计算。

## 31. 本轮补充：正文后 AI 收束 IPC

新增两类收束层 AI IPC：

1. `ai.reviewChapterPitResponses`
   - 输入：`chapterId`、可选 `promptText`
   - main 侧职责：
     - 读取当前章节正文
     - 读取当前章节的 `ChapterPitPlan`
     - 通过 `ContextAssembler / PromptBuilder` 组装
     - 调用 AI provider
     - 返回每条计划回应坑的候选验收结果
   - 不直接落库

2. `ai.reviewChapterPitCandidates`
   - 输入：`chapterId`、可选 `promptText`
   - main 侧职责：
     - 读取当前章节正文
     - 读取当前章节现有 `ChapterPitCandidate`
     - 通过 `ContextAssembler / PromptBuilder` 组装
     - 调用 AI provider
     - 返回：
       - 现有埋坑候选的建议确认状态
       - 从正文中额外识别出的新埋坑候选
   - 不直接落库

返回后的应用规则：
- renderer 允许用户逐项编辑
- 用户确认后，再分别调用：
  - `chapter.reviewPitResponse`
  - `chapter.updatePitCandidate`
  - `chapter.reviewPitCandidate`
  - 必要时 `chapter.createPitCandidateManual`

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

## 16. 本轮补充：摘要入口调整后的 IPC 语义

本轮不强制新增新的摘要 IPC，优先复用现有接口完成闭环：

- `ai.extractOutline`
- `chapter.update`
- `chapter.listOutlinesByProject`

### 16.1 `ai.extractOutline`

职责继续保持：
1. 根据 `chapter_id` 查询当前章节所需上下文
2. 通过 `ContextAssembler` 组装结构化上下文
3. 通过 `PromptBuilder` 生成摘要提炼任务输入
4. 调用 AI provider
5. 返回候选摘要，不直接落库

本轮额外强调：
- 摘要提炼任务以当前正文为主
- 当正文为空但 AI 参考上下文充足时，可降级生成候选摘要
- 当前 `outline_user` 不应重新作为摘要提炼任务的主要输入

### 16.2 `chapter.update`

本轮继续复用 `chapter.update` 作为摘要写回接口：

- 用户在正文层确认 AI 候选摘要后，通过 `chapter.update({ patch: { outline_user } })` 写回
- 用户在 `章节摘要总览` 中直接编辑摘要时，同样通过 `chapter.update` 写回
- 写回成功后，`updated_at` 应同步更新

### 16.3 `chapter.listOutlinesByProject`

该接口继续返回项目内所有章节的：
- `chapter id`
- `chapter number`
- `chapter title`
- `outline_user`
- `updated_at`

本轮补充要求：
- renderer 允许在总览中直接编辑摘要
- 自动保存完成后应立即刷新或局部同步该列表
- 数据源仍然是 `Chapter.outline_user`，不维护冗余副本

### 16.4 刷新要求

当 `outline_user` 被更新后，renderer 至少需要同步以下内容：
- 当前章节详情
- 章节摘要总览
- AI 参考层
- 任何引用本章 `outline_user` 的参考章节展示

## 17. 本轮补充：`ai.extractOutline` 的严格输入限制

本轮对 `ai.extractOutline` 做强约束：

1. 输入仍为 `chapter_id`
2. main 层继续负责读取章节数据并调用统一 AI service
3. 但摘要提取时，模型输入只允许来自当前章节正文 `chapter.content`
4. 不再把 AI 参考层内容拼入 `ai.extractOutline` 的模型输入
5. 当前正文为空时，`ai.extractOutline` 应直接返回可理解错误，而不是回退到其他上下文继续生成

### 17.1 相关写回接口

- 继续使用 `chapter.update({ patch: { outline_user } })` 写回正式摘要
- 适用入口：
  - 正文层中的“本章摘要”直接编辑
  - 章节摘要总览中的直接编辑
  - AI 提取摘要候选确认后应用

## 18. 本轮补充：`ai.extractOutline` 的一次性提示词参数

本轮为 `ai.extractOutline` 增加可选的一次性提示词参数，例如：

```ts
{
  chapterId: string,
  promptText?: string
}
```

约束：
- `promptText` 仅用于本次 AI 提取摘要调用
- main 层可以将其并入 `PromptBuilder` 生成的模型输入
- 该参数不落库，不写入章节数据
- 该参数不应影响“参考正文只来自当前 content”这一规则

## 19. ֲ䣺AI  IPC ĵǰý

ͳһԼ IPC ǰ˽ʽ
- `ai.extractOutline`
- `ai.generateChapterTitle`
- `ai.generateChapterGoal`


1. renderer 㰴ťֻ򿪵 IPC
2. û޸ıʾʡ
3. ûڡAI ɡrenderer ٵöӦ IPC
4. `promptText` 汾 IPC ͣ⡣

## 20. ֲ䣺 / ĿҲ֧һʾ

`ai.generateChapterTitle`  `ai.generateChapterGoal` ֲѡ룺

```ts
{
  chapterId: string,
  promptText?: string
}
```

Ҫ
- main ⡢װġ AI
- renderer ƴ promptֻʾı
- ʾʽڵǰã档

## 21. ֲ䣺ӺѡҲ֧һʾ

`chapter.getPitSuggestions` ֲѡ룺

```ts
{
  chapterId: string,
  promptText?: string
}
```


1. renderer ӡȴ򿪵 IPC
2. ûڵڱ༭ʾʲAI ɡ󣬲ŵ `chapter.getPitSuggestions`
3. `promptText` ڱӺѡɣ档

## 22. ֲ䣺ĿųǰĿֶ

`ai.generateChapterGoal` Ҫ
- main װ AI ʱٰѵǰ `chapter.goal` οġ
- ԱĿֶζеݹд

## 23. 本轮补充：坑位流程改为“计划 -> 验收 -> 正式入库”

坑相关 IPC 需要支持以下闭环：

1. 正文前：
   - 选择“本章计划回应哪些旧坑”
   - 创建或编辑“本章埋坑候选”
2. 正文后：
   - 对计划回应坑逐条做验收
   - 对埋坑候选逐条确认是否成立
3. 只有“埋坑确认 = confirmed”时，main 才把候选转成正式 `StoryPit(type=chapter)`。

## 24. 计划回应坑 IPC

- `chapter.listPlannedPits`
- `chapter.planPitResponse`
- `chapter.unplanPitResponse`

关键规则：

1. 只能计划回应当前章节之前已经存在的正式坑。
2. 不能计划回应未来章节产生的坑。
3. `planPitResponse` 仅写入计划关系，不改变正式坑状态。

## 25. 填坑验收 IPC

- `chapter.listPitReviews`
- `chapter.reviewPitResponse`
- `chapter.clearPitReview`

关键规则：

1. 仅对已经计划回应的坑做正文后验收。
2. `reviewPitResponse` 至少提交：
   - `outcome`
   - `note`
3. 当 `outcome = resolved` 时，main 可同步更新正式 `StoryPit` 的：
   - `progress_status`
   - `resolved_in_chapter_id`

## 26. 埋坑候选 IPC

- `chapter.listPitCandidates`
- `chapter.getPitSuggestions`
- `chapter.createPitCandidateManual`
- `chapter.updatePitCandidate`
- `chapter.deletePitCandidate`
- `chapter.reviewPitCandidate`

关键规则：

1. `chapter.getPitSuggestions`
   - 输入 `chapter_id`
   - 基于正文草稿、标题、目标、角色、设定、参考章节、计划回应坑、AI 参考层生成候选
   - 不要求 `outline_user` 必须存在
   - 不直接落库正式坑
2. `chapter.createPitCandidateManual`
   - 直接创建正文前候选
   - 不进入正式坑总览
3. `chapter.reviewPitCandidate`
   - 用于正文后确认候选状态：`draft / weak / confirmed / discarded`
   - 只有 `confirmed` 才转成正式 `StoryPit(type=chapter)`

## 27. 章末钩子 AI IPC

- `ai.generateChapterNextHook`

职责：

1. 输入 `chapterId` 与可选 `promptText`
2. main 读取当前章节相关上下文
3. 通过 `ContextAssembler / PromptBuilder` 组装
4. 调用 AI provider
5. 返回候选 `next_hook`
6. 用户确认后，再通过 `chapter.update` 写回

## 28. 本轮补充：renderer 与 main 的职责边界

1. renderer 不直接决定“某条候选是否成为正式坑”。
2. renderer 不直连数据库。
3. main 负责：
   - 查询正式坑 / 计划 / 验收 / 候选
   - 校验“只能引用前文坑”
   - 根据候选确认结果决定是否生成正式 `StoryPit`
   - 在正文后验收时更新正式坑进度

## 29. 本轮补充：收束层完成后的联动刷新

当正文后的“本章正式摘要 / 填坑总结 / 埋坑确认”发生变化后，renderer 至少需要同步刷新：

- 当前章节详情
- AI 参考层
- 项目级摘要总览
- 项目级正式坑总览
- 任何引用本章正式摘要或正式坑的展示
## 32. 本轮补充：前置线索层不展示正文后状态

- 现有坑位相关 IPC 不新增新表语义，但 renderer 在使用这些结果时需要分层：
  - `chapter.listPlannedPits`
  - `chapter.listPitCandidates`
  用于正文前“线索与伏笔管理”
  - `chapter.listPitReviews`
  - `chapter.reviewPitCandidate`
  用于正文后“本章收束 / 验收层”
- 同一条坑位数据可以同时存在于前置层与收束层，但前置层不直接展示验收状态标签。
- AI 参考层读取前置层的规划内容时，应只展示线索 / 伏笔内容本身，不直接展示验收结论。

## 33. 本轮补充：伏笔规划与埋坑确认的数据边界

- `chapter.update` 新增对 `planning_clues_json` / `foreshadow_notes_json` 的读写支持，用于正文前规划层。
- `chapter.listPitCandidates` / `chapter.reviewPitCandidate` 继续只服务正文后“埋坑确认”。
- `ai.reviewChapterPitCandidates` 输入可包含 `foreshadow_notes_json` 作为分析上下文，但输出仍写入 `ChapterPitCandidate` 验收流。
- renderer 不再把前置“本章伏笔”直接渲染为“埋坑确认”列表。

## 34. 本轮同步：IPC 执行模式对齐（2026-03-13）

### 34.1 关联角色 / 设定快速添加

- renderer 在“添加角色 / 添加设定”下拉 `onChange` 后，直接进入保存链：
  - `saveChapterDraft`
  - `chapter.update`
- 当前阶段不新增独立 `chapter.addCharacterLink` / `chapter.addLoreLink` IPC。

### 34.2 收束层 AI 一键执行

- `AI 总结填坑`：
  - 调用 `ai.reviewChapterPitResponses({ chapterId, promptText })`
  - 将返回项逐条写回 `chapter.reviewPitResponse`
- `AI 分析埋坑`：
  - 调用 `ai.reviewChapterPitCandidates({ chapterId, promptText })`
  - 按结果调用：
    - `chapter.reviewPitCandidate`
    - 必要时 `chapter.createPitCandidateManual`
- 以上链路默认不再要求二次候选确认弹窗才能落库。

### 34.3 一次性提示词参数

- 收束层输入框提供 `promptText`，只作用本次 AI 请求。
- main 接收并参与本次生成，但不写入持久字段。

### 34.4 预览交互边界

- 收束层卡片 `...` 仅打开完整内容预览，不触发业务状态写入。
