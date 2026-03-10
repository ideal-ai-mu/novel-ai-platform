# IPC Plan (Sprint 1 Only)

## 1. 范围说明

本文件只定义 Sprint 1 最小可运行所需 IPC，不做二期过度设计。  
第一阶段聚焦：应用初始化、项目、章节、AI 建议（待确认更新）闭环。

## 2. 设计约束

- 存储拓扑：单应用 SQLite + 多 `NovelProject`（不做每项目物理数据库拆分）。
- renderer 不直接访问 DB/文件系统；统一通过 preload 暴露的 IPC API。
- IPC 统一响应结构：

```ts
type IpcResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
```

- AI 相关 IPC 只能创建 `AiSuggestion`，不能直接修改业务实体。
- 应用建议时必须执行 `confirmed_fields_json` 覆盖检查。

## 3. 第一阶段 IPC 清单

| Channel | 用途 | Request（简化） | Response（简化） |
|---|---|---|---|
| `app.init` | 启动初始化（配置、数据库、迁移） | `{}` | `{ ready: true, storageTopology: 'single-db-multi-project', dbPath: string, schemaVersion: number }` |
| `project.list` | 获取项目列表 | `{}` | `NovelProject[]` |
| `project.create` | 创建项目 | `{ name, description? }` | `NovelProject` |
| `project.get` | 获取项目详情 | `{ projectId }` | `NovelProject` |
| `project.update` | 更新项目 | `{ projectId, patch }` | `NovelProject` |
| `project.delete` | 删除项目 | `{ projectId }` | `{ deleted: true }` |
| `chapter.list` | 获取章节列表 | `{ projectId }` | `Chapter[]` |
| `chapter.create` | 创建章节 | `{ projectId, title, indexNo?, status?, goal?, outline_user?, next_hook? }` | `Chapter` |
| `chapter.get` | 获取章节 | `{ chapterId }` | `Chapter` |
| `chapter.update` | 更新章节 | `{ chapterId, patch }` | `Chapter` |
| `chapter.delete` | 删除章节 | `{ chapterId }` | `{ deleted: true }` |
| `ai.summarizeChapter` | 生成章节总结建议 | `{ projectId, chapterId }` | `{ suggestionIds: string[] }` |
| `suggestion.list` | 获取建议列表 | `{ projectId, status?: 'pending' }` | `AiSuggestion[]` |
| `suggestion.apply` | 接受建议并尝试应用 | `{ suggestionId }` | `SuggestionApplyResult` |
| `suggestion.reject` | 拒绝建议 | `{ suggestionId, reason? }` | `{ status: 'rejected' }` |

`SuggestionApplyResult`（Sprint 1）：

```ts
type SuggestionApplyResult = {
  status: 'accepted' | 'blocked';
  appliedChanges: Array<{
    targetEntityType: string;
    targetEntityId: string;
    field: string; // dot-path
    value: unknown;
  }>;
  blockedFields: string[]; // dot-path 列表
};
```

## 4. preload 暴露 API（建议）

```ts
window.appApi = {
  app: { init },
  project: { list, create, get, update, delete },
  chapter: { list, create, get, update, delete },
  ai: { summarizeChapter },
  suggestion: { list, apply, reject }
}
```

## 5. 第一阶段不包含

- Character / LoreEntry / Foreshadowing / TimelineEvent 的 IPC CRUD。
- 每项目目录数据库切分与项目级导入导出 IPC。
- 云同步、在线协作、权限系统。
- 背景任务队列与流式推送（先用请求-响应模型）。

## 6. 错误码建议（最小集）

- `NOT_FOUND`：资源不存在
- `VALIDATION_ERROR`：参数非法
- `CONFLICT_USER_CONFIRMED`：命中确认字段，不可覆盖
- `AI_OUTPUT_INVALID`：AI 输出结构不合法
- `INIT_FAILED`：应用初始化失败
- `INTERNAL_ERROR`：未分类错误
