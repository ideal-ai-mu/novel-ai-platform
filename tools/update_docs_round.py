from pathlib import Path


APPENDS = {
    "docs/architecture.md": """
## 35. 本轮补充：填坑 / 埋坑改为“正文前计划 + 正文后验收”

1. 填坑层在正文前的语义改为“本章计划回应哪些旧坑”，不再表示已经填完。
2. 埋坑层在正文前的语义改为“本章准备埋哪些候选线索”，不再在候选出现时直接视为正式坑。
3. 因此正文前的坑位信息只分为：
   - 计划回应的坑
   - 埋坑候选
4. 正文完成后，再进入单独的“本章收束 / 验收层”完成最终判断。

## 36. 本轮补充：本章收束 / 验收层

该层位于“正文层”之后，至少包含三个区块：

1. 本章正式摘要
   - 这是当前章节最终确认的正式摘要。
   - 仍然写入 `Chapter.outline_user`。
   - 可手动编辑，也可 AI 提炼后确认应用。
2. 填坑总结
   - 面向正文前计划回应的坑。
   - 正文完成后，逐条判断本章对这些坑的实际处理结果。
   - 结果至少支持：`未回应 / 部分回应 / 明确回应 / 完整填完`。
   - 每条可附简短说明。
3. 埋坑确认
   - 面向正文前的埋坑候选。
   - 正文完成后，逐条判断这些候选是否真的在正文中成立。
   - 结果至少支持：`未埋成 / 埋下但较弱 / 有效埋下 / 放弃`。
   - 只有“有效埋下”的候选，才会转成正式 `StoryPit(type=chapter)` 并进入项目级坑总览。

## 37. 本轮补充：章节坑的正式入库时机

1. 作者手动设定坑，仍然可以直接作为正式坑入库。
2. 章节坑不再在“新增候选”时立刻进入项目总览。
3. 章节坑的正式入库时机改为：
   - 正文完成后
   - 在“埋坑确认”中被作者确认为“有效埋下”
4. 这保证项目级坑总览展示的是“已成立的正式坑”，而不是正文前的草案候选。

## 38. 本轮补充：埋坑候选的 AI 参考来源

埋坑候选的 AI 生成能力在产品语义上服务于“写前规划”，因此：

1. 核心参考来源优先是：
   - 当前正文草稿（如果已有）
   - 章节标题
   - 本章目标
   - 已关联角色
   - 已关联设定
   - 参考章节
   - 本章计划回应的坑
   - AI 参考层上下文
2. 不应把 `Chapter.outline_user` 作为前置依赖或主要输入，因为写前阶段正式摘要可能为空。

## 39. 本轮补充：AI 参考层与坑位信息

AI 参考层继续作为只读的提示词上下文视图，但本轮其坑位语义调整为：

1. 【本章计划回应的坑】
   - 展示当前章节准备回应的前文坑位。
2. 【本章埋坑候选】
   - 展示当前章节准备埋下的候选线索。
3. 正文完成后的【填坑总结】与【埋坑确认】属于收束层，不与正文前计划混在一起。

## 40. 本轮补充：章末钩子 / 下一章引子的 AI 提示

`next_hook` 新增 AI 提示能力，且应兼容正文前与正文后两个阶段：

1. 正文前
   - 用于规划这章希望把读者带向哪里。
   - 主要参考：标题、目标、角色、设定、参考章节、计划回应的坑、埋坑候选、AI 参考层。
   - 不依赖 `outline_user` 作为前置条件。
2. 正文后
   - 用于根据最终正文优化章末钩子。
   - 优先参考：正文、正式摘要、填坑总结、埋坑确认、AI 参考层。
3. 两种阶段都只返回候选文本，用户确认后才写入 `Chapter.next_hook`。
""".strip(),
    "docs/data-model.md": """
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
""".strip(),
    "docs/ipc-plan.md": """
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
""".strip(),
    "docs/mvp-sprint-1.md": """
## 16. 本轮补充：正文前计划 + 正文后验收闭环

本轮阶段目标新增：

1. 填坑 / 埋坑的正文前语义调整完成。
2. 新增“本章收束 / 验收层”。
3. 章节坑的正式入库时机后移到正文后确认。
4. 章末钩子 / 下一章引子的 AI 提示能力可用。

## 17. 本轮补充：DoD

1. 填坑层在正文前只表示“计划回应哪些旧坑”，不再在选择时直接标记为已填。
2. 埋坑层在正文前只保存“埋坑候选”，不再在候选生成时直接进入项目级正式坑总览。
3. 正文层之后存在明确的“本章收束 / 验收层”。
4. 收束层至少包括：
   - 本章正式摘要
   - 填坑总结
   - 埋坑确认
5. 填坑总结至少支持：
   - 未回应
   - 部分回应
   - 明确回应
   - 完整填完
6. 埋坑确认至少支持：
   - 未埋成
   - 埋下但较弱
   - 有效埋下
   - 放弃
7. 只有“有效埋下”的埋坑候选，才转成正式 `StoryPit(type=chapter)` 并进入项目级坑总览。
8. 作者手动设定坑仍可直接进入正式坑总览。
9. `Chapter.outline_user` 仍然是本章正式摘要唯一真源。
10. 章末钩子 / 下一章引子的 AI 提示在正文前、正文后都能工作，并且只返回候选，用户确认后才写回。
11. 正文后完成摘要 / 填坑总结 / 埋坑确认后，章节详情、AI 参考层、摘要总览、正式坑总览保持同步刷新。
""".strip(),
}


def read_text(path: Path) -> str:
    raw = path.read_bytes()
    for encoding in ("utf-8", "gbk", "cp936", "mbcs"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="ignore")


for relative_path, append_text in APPENDS.items():
    path = Path(relative_path)
    text = read_text(path)
    if append_text not in text:
        text = text.rstrip() + "\n\n" + append_text + "\n"
    with path.open("w", encoding="utf-8", newline="\n") as file:
        file.write(text)
