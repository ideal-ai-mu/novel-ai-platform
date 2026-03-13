# Data Model

## 1. 建模原则

- 当前采用“单应用 SQLite + 多 `NovelProject`”
- `NovelProject` 是聚合根，其余实体通过 `project_id` 或章节关系组织
- 不新增“每章记忆卡”“章节记忆卡”“额外摘要卡”等独立机制
- `Chapter.outline_user` 仍然是章节正式梗概，也是后续章节引用时优先读取的章节摘要
- “章节梗概总览”不新增表，不复制摘要，只聚合展示 `Chapter.outline_user`
- “全部坑内容总览”直接读取 `StoryPit`，不额外复制坑数据
- “填坑 / 埋坑”里的内容编辑直接修改 `StoryPit.content`，章节层与总览看到的是同一份全局数据

## 2. 核心实体

## 2.1 NovelProject

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT (PK) | 项目 ID |
| title | TEXT | 项目标题 |
| description | TEXT | 项目简介 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |
| source | TEXT | `user` / `imported` |

## 2.2 Chapter

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT (PK) | 章节 ID |
| project_id | TEXT (FK) | 所属项目 |
| index_no | INTEGER | 章节序号 |
| title | TEXT | 章节标题 |
| status | TEXT | 轻量状态字段，当前 UI 不重点展示 |
| goal | TEXT | 本章目标 |
| outline_ai | TEXT | AI 参考梗概缓存，可选，不自动覆盖 `outline_user` |
| outline_user | TEXT | 本章正式梗概，同时承担“供后续章节参考的章节摘要”作用 |
| content | TEXT | 正文 |
| next_hook | TEXT | 章末钩子 / 下一章引子 |
| word_count | INTEGER | 字数缓存 |
| revision | INTEGER | 版本递增 |
| confirmed_fields_json | TEXT(JSON) | dot-path 字段保护列表 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |
| source | TEXT | `user` / `ai_summary` / `imported` |

说明：
- 章节标题在 UI 语义上属于章节规划层，但数据上仍属于 `Chapter` 基础字段
- `outline_user` 是全局唯一正式章节梗概真源
- 参考章节、章节梗概总览都直接读取 `outline_user`
- 当前产品语义不再依赖“是否埋坑”总开关字段
- 如代码内部暂时保留旧列用于兼容，不应再作为产品层核心概念

## 2.3 Character

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT (PK) | 角色 ID |
| project_id | TEXT (FK) | 所属项目 |
| name | TEXT | 角色名 |
| role_type | TEXT | 角色类型 |
| summary | TEXT | 摘要 |
| details | TEXT | 详细设定 |
| source | TEXT | `user` / `ai_summary` / `imported` |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

## 2.4 LoreEntry

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT (PK) | 设定条目 ID |
| project_id | TEXT (FK) | 所属项目 |
| type | TEXT | 设定类型 |
| title | TEXT | 标题 |
| summary | TEXT | 摘要 |
| content | TEXT | 内容 |
| tags_json | TEXT(JSON) | 标签数组 |
| source | TEXT | `user` / `ai_summary` / `imported` |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

## 2.5 StoryPit

用于表示项目中的“坑 / 伏笔 / 未解问题 / 待回应线索”。

建议表名：`story_pits`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT (PK) | 坑 ID |
| project_id | TEXT (FK) | 所属项目 |
| type | TEXT | `chapter` / `manual` |
| origin_chapter_id | TEXT nullable | 来源章节；`manual` 类型可为空 |
| content | TEXT | 坑内容 |
| status | TEXT | `open` / `resolved` |
| resolved_in_chapter_id | TEXT nullable | 在哪一章被填 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |
| sort_order | INTEGER nullable | 内部轻量排序辅助字段，可选 |
| note | TEXT nullable | 内部轻量备注字段，可选 |
| creation_method | TEXT nullable | 内部辅助字段，可保留，但不是产品层核心概念，也不在 UI 中强调 |

### 业务语义

- `type = chapter`：表示由某一章产生的坑
- `type = manual`：表示作者手动设定的坑
- `origin_chapter_id`：表示坑最初来自哪一章
- `resolved_in_chapter_id`：表示在哪一章被填
- MVP 阶段填坑直接通过 `resolved_in_chapter_id` 表示，不引入复杂多对多系统

### 产品层约束

- 坑只保留两类核心来源语义：
  - 章节坑
  - 作者手动设定坑
- 不再把“AI 生成 / 手动编辑”作为用户可见核心分类
- AI 只在“新增坑”时提供候选建议

### 时间方向规则

- 章节坑只能被后续章节填
- 不允许在当前章节填未来章节产生的坑
- 作者手动设定坑没有来源章节时，可作为项目级人工坑存在

### 全局唯一真源

- 章节层编辑坑内容时，修改的是 `StoryPit.content`
- 项目级总览直接读取同一条 `StoryPit`
- 不允许出现章节层与总览各自维护不同文本

### 是否埋坑的推导

- 不再需要独立 `chapter.has_pits` 或类似总开关字段
- 一个章节是否埋坑，可由是否存在：
  - `StoryPit.type = chapter`
  - `origin_chapter_id = 当前章节`
  这一事实自然推导

## 2.6 AiSuggestion

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT (PK) | 建议 ID |
| entity_type | TEXT | 当前阶段主要处理 `Chapter` |
| entity_id | TEXT | 目标实体 ID |
| kind | TEXT | 建议类型 |
| patch_json | TEXT(JSON) | 结构化字段变更 |
| status | TEXT | `pending` / `applied` / `rejected` / `partially_applied` |
| summary | TEXT | 建议摘要 |
| source | TEXT | `mock` / `chapter_summary` / `manual` |
| result_json | TEXT(JSON) | `appliedChanges` / `blockedFields` |
| created_at | TEXT | 创建时间 |

## 3. ChapterContextRef

用于表示“当前章节引用了哪些其他章节作为上下文”。

这不是新的长期记忆层，也不是新的摘要实体；它只是章节级上下文引用关系。

建议表名：`chapter_context_refs`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT (PK) | 关系 ID |
| chapter_id | TEXT (FK) | 当前章节 ID |
| ref_chapter_id | TEXT (FK) | 被引用章节 ID |
| mode | TEXT | `auto` / `manual` / `pinned` |
| weight | REAL | 排序或推荐权重 |
| note | TEXT nullable | 轻量备注 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

### 业务约束

- `ref_chapter_id` 必须属于同一项目
- `ref_chapter_id` 不能等于 `chapter_id`
- `ref_chapter_id` 对应章节的 `index_no` 必须小于当前章节的 `index_no`
- 不允许引用未来章节
- 自动推荐和手动选择都必须遵守上述规则

## 4. 领域组装对象：ChapterAiContext

`ContextAssembler` 不一定对应数据库表，但它是明确的领域组装对象。

示例：

```ts
type ChapterAiContext = {
  project: {
    id: string;
    title: string;
    description?: string;
  };
  chapter: {
    id: string;
    number: number;
    title: string;
    goal: string;
    outlineUser: string;
    nextHook: string;
    content: string;
  };
  linkedCharacters: Array<{
    id: string;
    name: string;
    roleType?: string;
    summary?: string;
    details?: string;
  }>;
  linkedLore: Array<{
    id: string;
    title: string;
    type?: string;
    summary?: string;
    content?: string;
  }>;
  referenceChapters: Array<{
    id: string;
    number: number;
    title: string;
    mode: 'auto' | 'manual' | 'pinned';
    outlineUser: string;
    updatedAt: string;
  }>;
  plannedPits: Array<{
    id: string;
    content: string;
    originLabel: string;
    progressStatus: 'unaddressed' | 'partial' | 'clear' | 'resolved';
  }>;
  pitReviews: Array<{
    id: string;
    content: string;
    outcome: 'none' | 'partial' | 'clear' | 'resolved';
    note?: string | null;
  }>;
  pitCandidates: Array<{
    id: string;
    content: string;
    status: 'draft' | 'weak' | 'confirmed' | 'discarded';
  }>;
  task: {
    type:
      | 'summarizeChapterFromContent'
      | 'generateChapterTitle'
      | 'generateChapterGoal'
      | 'generateChapterNextHook'
      | 'getPitSuggestions';
  };
};
```

说明：
- 这是领域组装对象，不要求数据库逐字段一一对应
- 后续 AI 标题 / 目标 / 梗概 / 坑位候选都应基于这一统一结构

## 5. AI 候选结果

当前阶段不引入复杂新实体。

可接受的做法：
- 默认作为临时返回对象，不入库
- 用户确认后，再通过正常更新流程写回对应字段或创建 `StoryPit`

示例：

```ts
type AiTextCandidate = {
  text: string;
  provider: string;
  model?: string | null;
  referenceText: string;
};

type PitSuggestionResult = {
  items: string[];
  provider: string;
  model?: string | null;
  referenceText: string;
};
```

## 6. AI 参考层的数据来源

AI 参考层是动态汇总，不新增独立存储。

当前汇总来源：
- `Chapter.title`
- `Chapter.goal`
- `Chapter.outline_user`
- `Chapter.next_hook`
- 当前章节关联角色
- 当前章节关联设定
- `ChapterContextRef` 对应的参考章节
- 当前章节已填坑
- 当前章节已埋坑

其中参考章节优先读取：
- 被引用章节的 `outline_user`

说明：
- UI 中的 AI 参考层是用户可读视图
- 真正给模型的结构化输入来自 `ChapterAiContext`

## 7. 章节梗概总览的数据定义

“章节梗概总览”不是新表，不是新实体，只是按项目维度聚合 `Chapter` 列表。

建议返回字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| chapterId | TEXT | 章节 ID |
| index_no | INTEGER | 章节序号 |
| title | TEXT | 章节标题 |
| outline_user | TEXT | 本章梗概 |
| updated_at | TEXT | 更新时间 |

说明：
- 数据直接读取 `Chapter` 当前真实数据
- 不维护冗余副本
- 当 `outline_user` 更新后，总览应即时反映

## 8. 全部坑内容总览的数据定义

“全部坑内容总览”是项目级视图，直接读取 `StoryPit`。

建议分组返回：

```ts
type StoryPitGroupedOverview = {
  chapterGroups: Array<{
    chapterId: string;
    index_no: number;
    title: string;
    pits: StoryPitView[];
  }>;
  manualPits: StoryPitView[];
};
```

说明：
- 章节坑按来源章节分组
- 作者手动设定坑单独成组
- 每条坑仍然指向同一份 `StoryPit`

## 9. 本轮补充：填坑编辑与选择流程

- “填坑”不再依赖章节内常驻下拉框；它改为打开选择面板后再选中某条 `StoryPit`。
- 在填坑确认面板中，作者编辑的是 `StoryPit.content` 本身，因此修改后章节层与项目级总览读取的是同一份数据。
- 是否埋坑仍然不需要独立布尔字段；当前章只要实际创建了至少一条 `type = chapter` 的坑，即可自然视为本章已埋坑。

## 10. 本轮补充：Chapter.outline_user 的摘要语义

- `Chapter.outline_user` 继续作为当前章的正式摘要 / 梗概真源。
- AI 提炼任务不会把已有 `outline_user` 再次作为摘要生成输入回灌，以避免递归式重复。
- 用户在写作前可先手写一版摘要 / 梗概用于创作约束；章节完成后，可再基于正文生成新的候选摘要并确认覆盖。
- 无新增摘要卡、记忆卡或额外摘要实体。

## 11. 本轮补充：摘要生成的上下文回退

- `ai.extractOutline` 的摘要候选优先根据当前正文生成。
- 若当前正文为空，但当前章已有足够 AI 参考上下文，仍可生成候选摘要。
- 该回退只使用：
  - 章节标题
  - 本章目标
  - 章末钩子
  - 已关联角色 / 设定
  - 参考章节
  - 填坑 / 埋坑
- 不把当前 `outline_user` 本身重新作为输入回灌。

## 12. 本轮补充：章节摘要的入口与真源

1. `Chapter.outline_user` 继续作为章节正式摘要的唯一真源。
2. 本轮不新增任何“章节记忆卡 / 摘要卡”实体。
3. “章节规划层中不再直接编辑摘要”只是 UI 入口调整，不改变 `outline_user` 的数据语义。
4. `章节摘要总览` 继续直接聚合与编辑 `Chapter.outline_user`。

### 12.1 UI 语义调整

- 章节规划层不再展示 `outline_user` 的常驻编辑框。
- 正文层通过 `AI 提取摘要` 生成候选摘要并写回 `outline_user`。
- 项目级 `章节摘要总览` 允许直接编辑并自动保存 `outline_user`。

### 12.2 新建章节时的初始摘要

本轮允许系统在创建章节后立即为 `outline_user` 写入一版初始摘要，用于：

- 让新章节在 `章节摘要总览` 中立即可见
- 让 AI 续写 / 参考链在创建后就拥有最小摘要上下文

该初始摘要仍然写入 `Chapter.outline_user`，不是单独的新字段。

### 12.3 摘要提炼时的输入约束

`ContextAssembler` 可以继续组装完整章节上下文，但在 `summarizeChapterFromContent` 任务中：

- `chapter.content` 是首要输入
- `title / goal / next_hook / linkedCharacters / linkedLore / referenceChapters / pits` 可作为辅助输入
- 当前 `chapter.outlineUser` 不重新作为摘要提炼的主要输入

### 12.4 领域对象说明

可继续沿用：

```ts
type ChapterAiContext = {
  project: { id: string; title: string; description?: string }
  chapter: {
    id: string
    number: number
    title: string
    goal: string
    outlineUser: string
    nextHook: string
    content: string
  }
  linkedCharacters: Array<...>
  linkedLore: Array<...>
  referenceChapters: Array<...>
  resolvedPits: Array<...>
  createdPits: Array<...>
}
```

其中：
- `outlineUser` 作为当前正式摘要继续保留在领域对象中，供非摘要任务使用
- 但摘要提炼任务可以选择不把该字段重新拼入模型主输入

## 13. 本轮补充：摘要字段的可见位置与提取约束

1. `Chapter.outline_user` 继续作为正式摘要唯一真源。
2. 本轮不改变字段本身，但改变其主要 UI 入口：
   - 不再在章节规划层直接展示
   - 改为在正文层下方编辑
   - 改为在章节摘要总览中集中编辑
3. `outline_user` 的保存逻辑继续复用 `chapter.update`，不新增新摘要实体。

### 13.1 摘要提取任务的输入边界

在 `summarizeChapterFromContent` 任务中：

- 只使用 `chapter.content`
- 不再把其他上下文对象拼入摘要提取输入
- 当前 `outline_user` 也不得回灌进摘要生成

这是一条严格边界，用于避免：
- 摘要递归套娃
- 规划信息混入“已发生正文摘要”
- 参考章节内容覆盖当前章节正文事实

## 14. 本轮补充：一次性提示词不是持久化数据

- `AI 提取摘要` 的提示词可以在 UI 中临时编辑。
- 该提示词只作为一次性调用参数传给 main / AI provider。
- 不新增数据库字段，不写入 `Chapter`，也不写入其他实体。
- `Chapter.outline_user` 仍然是唯一需要保存的正式摘要结果。

## 15. ֲ䣺һʾȻǳ־û

ְժҪ /  / Ŀ AI ͳһĳɵڱ༭ʾʣģͲ־ûֶΣ

- `promptText` ֻ renderer ǰ״̬ IPC òС
- д `Chapter`
- д `NovelProject`
-  prompt ñ

`Chapter.outline_user` Ȼʽ½ժҪΨһԴ

## 16. ֲ䣺ʾȻ־ûĿȥ

1. `generateChapterGoal` ģȥ `chapter.goal` ûعࡣ
2. ⲻκݿֶΡ
3. ӡһʾֻͬڵǰ״̬ IPC У־û

## 17. 本轮补充：正式坑、计划回应、验收结果、埋坑候选分层

### StoryPit

正式坑实体仍命名为 `StoryPit`，建议字段至少包括：

- `id`
- `project_id`
- `type`：`chapter` / `manual`
- `origin_chapter_id`：nullable
- `content`
- `progress_status`：`unaddressed` / `partial` / `clear` / `resolved`
- `resolved_in_chapter_id`：nullable
- `created_at`
- `updated_at`

语义说明：

1. `type = chapter`
   - 表示经正文确认后成立的章节坑。
2. `type = manual`
   - 表示作者手动设定并直接入库的正式坑。
3. 章节坑不是 AI 候选一出现就入库，而是在“埋坑确认 = 有效埋下”后才生成正式 `StoryPit(type=chapter)`。

### ChapterPitPlan

`ChapterPitPlan` 表示当前章节准备回应哪些既有坑。

- `id`
- `chapter_id`
- `pit_id`
- `created_at`
- `updated_at`

语义说明：

1. 它表示“计划回应”。
2. 它不等于已经填完。

### ChapterPitReview

`ChapterPitReview` 表示正文完成后，当前章节对计划回应坑的验收结果。

- `id`
- `chapter_id`
- `pit_id`
- `outcome`：`none` / `partial` / `clear` / `resolved`
- `note`：nullable
- `created_at`
- `updated_at`

语义说明：

1. 这是正文后的验收记录。
2. 它记录本章对既有坑的实际处理程度，而不是正文前的计划。

### ChapterPitCandidate

`ChapterPitCandidate` 表示当前章节的埋坑候选。

- `id`
- `chapter_id`
- `content`
- `status`：`draft` / `weak` / `confirmed` / `discarded`
- `created_at`
- `updated_at`

语义说明：

1. 这是正文前的候选，不是正式坑。
2. 只有 `confirmed` 后，才转成正式 `StoryPit(type=chapter)`。

## 18. 本轮补充：Chapter.outline_user 仍然是本章正式摘要

1. `Chapter.outline_user` 继续作为本章正式摘要的唯一真源。
2. “本章正式摘要”属于正文后的收束结果，不新增新的摘要实体。
3. 项目级摘要总览仍然直接聚合和展示 `Chapter.outline_user`。

## 19. 本轮补充：坑位语义与唯一真源

1. 项目级正式坑总览直接读取 `StoryPit`。
2. 当前章节计划回应哪些坑，读取 `ChapterPitPlan`。
3. 当前章节对这些坑的最终处理结果，读取 `ChapterPitReview`。
4. 当前章节准备埋哪些候选线索，读取 `ChapterPitCandidate`。
5. 正文前的候选和计划，不应混入项目级正式坑总览。

## 20. 本轮补充：收束层交互不新增新表

1. “填坑总结 / 埋坑确认”改成缩略卡片 + 详情弹窗，只是 renderer 交互变化。
2. 详情弹窗编辑后仍然分别写回：
   - `ChapterPitReview`
   - `ChapterPitCandidate`
   - `StoryPit`
3. “收束完成度”只是运行时聚合信息，不新增数据库表。

## 21. 本轮补充：收束层 AI 候选结果不新增持久化实体

1. 填坑总结 AI 的返回结果，作为临时候选对象存在于当前会话，不新增新表。
2. 埋坑确认 AI 的返回结果，同样作为临时候选对象存在于当前会话，不新增新表。
3. 当用户确认应用后，再分别写入：
   - `ChapterPitReview`
   - `ChapterPitCandidate`
   - `StoryPit`
4. AI 从正文中额外识别出的“新埋坑线索”，先以临时候选文本返回；只有用户确认后，才创建新的 `ChapterPitCandidate`。
## 22. 本轮补充：前置规划数据与正文后验收数据分开展示

- `ChapterPitPlan` 仍表示“本章计划回应哪些已有坑”。
- `ChapterPitCandidate` 仍表示“本章准备埋下哪些伏笔候选”。
- `ChapterPitReview` 仍表示正文完成后对计划回应坑的实际验收结果。
- `ChapterPitCandidate.status` 仍表示正文完成后对伏笔候选的确认结果。
- 但在产品展示层：
  - `ChapterPitPlan` 和 `ChapterPitCandidate` 的列表不直接显示正文后验收状态
  - `ChapterPitReview` 与 `ChapterPitCandidate.status` 主要用于“本章收束 / 验收层”
- 也就是说：
  - 数据层可以继续复用同一组实体
  - 展示层必须把“正文前计划”与“正文后结果”拆开

## 23. 本轮补充：本章伏笔独立字段

- `Chapter.foreshadow_notes_json: string[]` 用于正文前“本章伏笔”规划。
- `ChapterPitCandidate` 继续用于正文后“埋坑确认”。
- 两者不做实时双向绑定，不共享同一 UI 列表。
- 在“AI 分析埋坑”流程中，可将 `foreshadow_notes_json` 作为输入上下文，生成或更新 `ChapterPitCandidate` 候选。

## 24. 本轮同步：数据层口径对齐（2026-03-13）

1. 本轮未新增数据库实体，核心仍为：
   - `Chapter`
   - `StoryPit`
   - `ChapterPitPlan`
   - `ChapterPitReview`
   - `ChapterPitCandidate`
2. 以下为会话态信息，不落库：
   - 关联小卡片随机色映射（renderer 运行时状态）
   - AI 识别新增埋坑候选的 UI 标识
   - 各 AI 操作的“本次提示词”
3. 收束层一键 AI 应用后的落库口径保持：
   - 填坑总结写入 `ChapterPitReview`，并按规则同步 `StoryPit.progress_status` / `resolved_in_chapter_id`
   - 埋坑确认写入 `ChapterPitCandidate.status`
   - AI 识别出的新增候选先创建为 `ChapterPitCandidate`，确认后再进入转正流程
4. 仅 `confirmed` 的埋坑候选可转为正式 `StoryPit(type=chapter)`。
5. `Chapter.outline_user` 仍是章节正式摘要唯一真源，不新增摘要副本表。
