# 数据模型

## 1. 状态标识规则
- `[主流程]`：当前主界面和当前用户主路径直接使用的数据。
- `[兼容保留（非当前主流程）]`：数据结构仍然真实存在于 schema、repository、IPC 和服务层中，但当前首页主流程没有重新露出对应入口。
- `[已废弃/已删除]`：只有在数据结构或语义真的移除后才使用；如果仍存在兼容代码，必须先标记为兼容保留，而不是直接视作已删除。

## 2. 总体原则
- 当前项目采用单应用 SQLite、本地单库、多作品模式。
- `Chapter.outline_user` 仍然是章节正式梗概的唯一真源。
- 数据模型优先服务当前小说工作台语义，而不是通用任务系统。
- 作品与章节采用软删除，分别进入作品回收和章节回收站。
- 当前 `schemaVersion = 8`。

## 3. [主流程] 当前主流程直接使用的数据

### 3.1 [主流程] NovelProject
字段：
- `id`
- `title`
- `description`
- `created_at`
- `updated_at`
- `source`
- `is_deleted`
- `deleted_at`

语义：
- 当前作品主实体。
- 首页、作品管理、作品回收直接使用。
- 首页中的 `ProjectSummaryStrip` / `DeletedProjectSummaryStrip` 只是基于 `NovelProject` 的展示形态，不新增任何首页专用实体。

### 3.2 [主流程] Chapter
字段：
- `id`
- `project_id`
- `index_no`
- `title`
- `status`
- `pits_enabled`
- `goal`
- `outline_ai`
- `outline_user`
- `planning_clues_json`
- `foreshadow_notes_json`
- `content`
- `next_hook`
- `word_count`
- `revision`
- `confirmed_fields_json`
- `created_at`
- `updated_at`
- `source`
- `is_deleted`
- `deleted_at`

语义：
- 当前章节管理页、章节回收站、写作页直接使用。
- 章节删除后进入章节回收站。
- 恢复章节时重新进入当前作品章节列表。
- 首页作品横向信息带中的章节数、字数、状态，直接由 `Chapter` 聚合得出，不复制存储首页统计快照。
- 章节管理页组件化后，`ChapterListRow`、`ChapterRecycleRow`、`ChapterEmptyState` 仍然只是 `Chapter` 及其聚合字段的展示层，不新增任何章节页专用实体。

## 4. [兼容保留（非当前主流程）] 已保留但当前首页主流程未完全重新接回的数据能力

### 4.1 [兼容保留（非当前主流程）] ChapterRefs
字段（逻辑视图）：
- `chapterId`
- `characterIds`
- `loreEntryIds`

底层表：
- `chapter_character_links`
- `chapter_lore_links`

语义：
- 当前章节关联角色与设定的最小关系层。
- 数据与 IPC 已保留，前台入口未完全重新整合。

### 4.2 [兼容保留（非当前主流程）] ChapterContextRef
字段：
- `id`
- `chapter_id`
- `ref_chapter_id`
- `mode`
- `weight`
- `note`
- `created_at`
- `updated_at`

语义：
- 当前章节引用哪些历史章节作为上下文。
- 仅允许引用前文章节，不能引用未来章节。
- `mode` 支持 `auto / manual / pinned`。
- 章节梗概总览直接读取 `Chapter.outline_user`，不会复制一套新的摘要实体。

### 4.3 [兼容保留（非当前主流程）] Character
字段：
- `id`
- `project_id`
- `name`
- `role_type`
- `summary`
- `details`
- `source`
- `created_at`
- `updated_at`

语义：
- 角色最小结构化实体。
- 数据和 IPC 完整保留，当前首页主流程未完全重新接回设定库入口。

### 4.4 [兼容保留（非当前主流程）] LoreEntry
字段：
- `id`
- `project_id`
- `type`
- `title`
- `summary`
- `content`
- `tags_json`
- `source`
- `created_at`
- `updated_at`

语义：
- 设定 / 世界观 / 条目类知识实体。

### 4.5 [兼容保留（非当前主流程）] StoryPit
字段：
- `id`
- `project_id`
- `type`
- `origin_chapter_id`
- `creation_method`
- `content`
- `status`
- `progress_status`
- `resolved_in_chapter_id`
- `sort_order`
- `note`
- `created_at`
- `updated_at`

语义：
- 坑 / 伏笔 / 线索的正式实体。
- `type` 仍区分 `chapter / manual`。
- `creation_method` 当前仍保留在数据层，但产品层不再强调它是核心长期标签。

### 4.6 [兼容保留（非当前主流程）] ChapterPitPlan
字段：
- `id`
- `chapter_id`
- `pit_id`
- `created_at`
- `updated_at`

语义：
- 表示当前章节计划回应哪些已有坑。

### 4.7 [兼容保留（非当前主流程）] ChapterPitReview
字段：
- `id`
- `chapter_id`
- `pit_id`
- `outcome`
- `note`
- `created_at`
- `updated_at`

语义：
- 表示正文完成后，对计划回应坑的实际处理结果。

### 4.8 [兼容保留（非当前主流程）] ChapterPitCandidate
字段：
- `id`
- `chapter_id`
- `content`
- `status`
- `story_pit_id`
- `created_at`
- `updated_at`

语义：
- 本章伏笔 / 埋坑候选。

### 4.9 [兼容保留（非当前主流程）] AiSuggestion
字段：
- `id`
- `entity_type`
- `entity_id`
- `kind`
- `patch_json`
- `status`
- `summary`
- `source`
- `result_json`
- `created_at`

语义：
- AI 建议 / 待确认更新项。
- `status` 当前支持：`pending / applied / rejected / partially_applied`。
- `result_json` 记录 `appliedChanges` 与 `blockedFields`。

## 5. 枚举与语义补充

### Source
- `NovelProject.source`: `user | imported`
- `EntitySource`: `user | ai_summary | imported`

### ChapterStatus
- `draft`
- `review`
- `final`

### ChapterContextRefMode
- `auto`
- `manual`
- `pinned`

### StoryPitType
- `chapter`
- `manual`

### StoryPitStatus
- `open`
- `resolved`

### StoryPitProgressStatus
- `unaddressed`
- `partial`
- `clear`
- `resolved`

### ChapterPitReviewOutcome
- `none`
- `partial`
- `clear`
- `resolved`

### ChapterPitCandidateStatus
- `draft`
- `weak`
- `confirmed`
- `discarded`

### AiSuggestionStatus
- `pending`
- `applied`
- `rejected`
- `partially_applied`

## 6. 删除 / 恢复规则

### 6.1 作品
- 删除作品：进入作品回收
- 恢复作品：重新进入作品管理
- 永久删除：从作品回收中清除

### 6.2 章节
- 删除章节：进入章节回收站
- 恢复章节：重新进入当前作品章节列表
- 永久删除：从章节回收站彻底清除

## 7. 当前实现映射（不是 schema，新旧边界说明）
- `src/main/db/database.ts`：database facade
- `src/main/db/schema.ts`：schema 初始化与补丁
- `src/main/db/mappers.ts`：行映射 / JSON 解析 / 字段归一化
- `src/main/db/suggestion-helpers.ts`：suggestion patch helper
- `src/main/db/entity-loaders.ts`：实体装载与通用 loader helper
- `src/main/db/repository-contexts.ts`：repository context 组装
- `src/main/db/repositories/project-repository.ts`：项目与作品回收
- `src/main/db/repositories/chapter-repository.ts`：章节与章节回收站
- `src/main/db/repositories/context-ref-repository.ts`：章节引用、历史章节上下文、章节梗概总览
- `src/main/db/repositories/pit-repository.ts`：坑与收束相关读写
- `src/main/db/repositories/knowledge-repository.ts`：Character / LoreEntry
- `src/main/db/repositories/suggestion-repository.ts`：AI Suggestion
- `src/renderer/hooks/workspace/useWorkspaceMenus.ts`、`useHomeController.tsx`、`useChapterManagementController.tsx`、`useWriterController.ts`：renderer controller 子 hook，属于状态编排层，不引入新数据模型

## 8. 当前整体口径
- 本文档同时覆盖 `[主流程]` 数据与 `[兼容保留（非当前主流程）]` 数据能力。
- 以后新增字段或实体时，应在对应实体段落中直接新增或修改，而不是用“本轮同步”替代完整模型说明。
