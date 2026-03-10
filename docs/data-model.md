# Data Model (Core Entities, Sprint 1)

## 1. 建模原则

- Sprint 1 采用“单应用 SQLite + 多 `NovelProject`”。
- 以 `NovelProject` 为聚合根，其他实体通过 `project_id` 关联。
- 核心实体统一保留最小字段：
  - `source`：数据来源（用户、AI、导入）。
  - `status`：当前状态（按实体定义最小枚举）。
  - `confirmed_fields_json`：用户确认字段保护列表。
- AI 输出不直接写实体，统一先写入 `AiSuggestion`。
- 不引入复杂审计系统（无事件溯源、无多表审计流水）。

## 2. 核心实体定义

## 2.1 NovelProject

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT (PK) | 项目 ID（建议 ULID/UUID） |
| name | TEXT | 项目名 |
| description | TEXT | 项目简介 |
| source | TEXT | `user` / `imported` |
| status | TEXT | `active` / `archived` |
| confirmed_fields_json | TEXT(JSON) | 用户确认字段列表 |
| created_at | TEXT | 创建时间（ISO8601） |
| updated_at | TEXT | 更新时间（ISO8601） |

## 2.2 Character

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT (PK) | 角色 ID |
| project_id | TEXT (FK) | 所属项目 |
| name | TEXT | 角色名 |
| role | TEXT | 主角/配角/反派等 |
| profile | TEXT | 人物设定正文 |
| tags_json | TEXT(JSON) | 标签数组 |
| source | TEXT | `user` / `ai_summary` / `imported` |
| status | TEXT | `active` / `inactive` |
| first_appearance_chapter_id | TEXT (FK, nullable) | 初次出场章节 |
| confirmed_fields_json | TEXT(JSON) | 用户确认字段列表 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

## 2.3 LoreEntry

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT (PK) | 设定条目 ID |
| project_id | TEXT (FK) | 所属项目 |
| title | TEXT | 条目标题 |
| category | TEXT | 世界观/组织/地点/规则等 |
| content | TEXT | 设定正文 |
| source | TEXT | `user` / `ai_summary` / `imported` |
| status | TEXT | `active` / `deprecated` |
| source_chapter_id | TEXT (FK, nullable) | 来源章节 |
| tags_json | TEXT(JSON) | 标签数组 |
| confirmed_fields_json | TEXT(JSON) | 用户确认字段列表 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

## 2.4 Chapter

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT (PK) | 章节 ID |
| project_id | TEXT (FK) | 所属项目 |
| index_no | INTEGER | 章节序号 |
| title | TEXT | 章节标题 |
| content | TEXT | 正文内容 |
| status | TEXT | `draft` / `review` / `final` |
| goal | TEXT | 本章目标 |
| outline_ai | TEXT | AI 生成大纲 |
| outline_user | TEXT | 用户确认/编辑后大纲 |
| next_hook | TEXT | 下一章钩子 |
| summary_json | TEXT(JSON, nullable) | 结构化章节总结 |
| word_count | INTEGER | 字数（可缓存） |
| source | TEXT | `user` / `ai_summary` / `imported` |
| confirmed_fields_json | TEXT(JSON) | 用户确认字段列表 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

## 2.5 Foreshadowing

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT (PK) | 伏笔 ID |
| project_id | TEXT (FK) | 所属项目 |
| setup_chapter_id | TEXT (FK) | 埋设章节 |
| payoff_chapter_id | TEXT (FK, nullable) | 回收章节 |
| setup_text | TEXT | 埋设描述 |
| payoff_text | TEXT | 回收描述 |
| source | TEXT | `user` / `ai_summary` / `imported` |
| status | TEXT | `planned` / `revealed` / `closed` |
| confirmed_fields_json | TEXT(JSON) | 用户确认字段列表 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

## 2.6 TimelineEvent

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT (PK) | 时间线事件 ID |
| project_id | TEXT (FK) | 所属项目 |
| event_time | TEXT | 时间点（ISO 日期或剧情时点） |
| chapter_id | TEXT (FK, nullable) | 关联章节 |
| title | TEXT | 事件标题 |
| description | TEXT | 事件描述 |
| order_no | INTEGER | 同时间点排序 |
| source | TEXT | `user` / `ai_summary` / `imported` |
| status | TEXT | `planned` / `confirmed` / `deprecated` |
| confirmed_fields_json | TEXT(JSON) | 用户确认字段列表 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

## 2.7 AiSuggestion

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT (PK) | 建议 ID |
| project_id | TEXT (FK) | 所属项目 |
| source | TEXT | `chapter_summary` 等来源 |
| source_chapter_id | TEXT (FK, nullable) | 来源章节 |
| target_entity_type | TEXT | `Character`/`LoreEntry`/`Chapter`/`Foreshadowing`/`TimelineEvent` |
| target_entity_id | TEXT (nullable) | 目标实体 ID（新增时可空） |
| operation | TEXT | `create` / `update` |
| patch_json | TEXT(JSON) | 结构化变更内容 |
| reason | TEXT | 建议理由 |
| confidence | REAL | 置信度（0~1） |
| status | TEXT | `pending` / `accepted` / `rejected` / `blocked` |
| result_json | TEXT(JSON, nullable) | 应用结果（`appliedChanges`/`blockedFields` 快照） |
| created_at | TEXT | 创建时间 |
| resolved_at | TEXT (nullable) | 处理时间 |

`patch_json` 示例（`field` 使用 dot-path）：

```json
{
  "changes": [
    {
      "field": "summary_json.core_conflict",
      "value": "主角与议会公开决裂"
    },
    {
      "field": "next_hook",
      "value": "密信落到反派手中"
    }
  ]
}
```

## 3. `source` / `status` 最小语义

- `source` 建议统一枚举（按需选用）：`user`、`ai_summary`、`imported`。
- `status` 使用实体最小集合，不在 Sprint 1 扩展工作流引擎。
- `AiSuggestion.status` 仅使用：`pending`、`accepted`、`rejected`、`blocked`。

## 4. `confirmed_fields_json` 规范（dot-path）

- 字段类型：`TEXT(JSON)`，内容为字符串数组。
- 路径格式：统一 `dot-path`，示例：`segment.segment`。
- 建议规则：`[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*`
- Sprint 1 不使用数组下标路径（如 `items[0].name`）。

示例：

```json
[
  "title",
  "goal",
  "outline_user",
  "summary_json.core_conflict",
  "summary_json.turning_point"
]
```

## 5. 实体关系（简化）

- `NovelProject` 1:N `Chapter`
- `NovelProject` 1:N `Character`
- `NovelProject` 1:N `LoreEntry`
- `NovelProject` 1:N `Foreshadowing`
- `NovelProject` 1:N `TimelineEvent`
- `NovelProject` 1:N `AiSuggestion`

## 6. 覆盖保护规则（关键）

1. AI 只写 `AiSuggestion`，不直接改核心实体。
2. 应用建议前，检查 `patch_json.changes[].field` 是否命中目标实体 `confirmed_fields_json`。
3. 若命中，禁止自动覆盖，`AiSuggestion.status` 置为 `blocked`。
4. 只有用户显式确认（接受建议或手工编辑）才能写入实体。

## 7. Sprint 1 实现范围建议

- Sprint 1 优先实现完整读写：`NovelProject`、`Chapter`、`AiSuggestion`。
- `Character`、`LoreEntry`、`Foreshadowing`、`TimelineEvent` 先完成建模与基础建表。
