export const IPC_CHANNELS = {
  APP_INIT: 'app.init',
  APP_AUTOSAVE_INTERVAL_CHANGED: 'app.autosaveIntervalChanged',
  APP_SET_AUTOSAVE_INTERVAL: 'app.setAutosaveInterval',
  APP_MENU_ACTION: 'app.menuAction',
  APP_GET_STORAGE_INFO: 'app.getStorageInfo',
  APP_CHANGE_DATA_LOCATION: 'app.changeDataLocation',
  APP_OPEN_DATA_LOCATION: 'app.openDataLocation',
  APP_RESTORE_DEFAULT_LOCATION: 'app.restoreDefaultLocation',
  PROJECT_LIST: 'project.list',
  PROJECT_LIST_DELETED: 'project.listDeleted',
  PROJECT_CREATE: 'project.create',
  PROJECT_GET: 'project.get',
  PROJECT_UPDATE: 'project.update',
  PROJECT_DELETE: 'project.delete',
  PROJECT_RESTORE: 'project.restore',
  PROJECT_DELETE_PERMANENT: 'project.deletePermanent',
  CHAPTER_LIST: 'chapter.list',
  CHAPTER_LIST_DELETED: 'chapter.listDeleted',
  CHAPTER_CREATE: 'chapter.create',
  CHAPTER_GET: 'chapter.get',
  CHAPTER_UPDATE: 'chapter.update',
  CHAPTER_DELETE: 'chapter.delete',
  CHAPTER_RESTORE: 'chapter.restore',
  CHAPTER_DELETE_PERMANENT: 'chapter.deletePermanent',
  CHAPTER_REFS_GET: 'chapter.refs.get',
  CHAPTER_REFS_UPDATE: 'chapter.refs.update',
  CHAPTER_RELATIONSHIP_GRAPH_GET: 'chapter.relationshipGraph.get',
  CHAPTER_RELATIONSHIP_GRAPH_UPDATE: 'chapter.relationshipGraph.update',
  CHAPTER_CONTEXT_REFS_GET: 'chapter.getContextRefs',
  CHAPTER_CONTEXT_REF_ADD: 'chapter.addContextRef',
  CHAPTER_CONTEXT_REF_REMOVE: 'chapter.removeContextRef',
  CHAPTER_CONTEXT_REF_UPDATE: 'chapter.updateContextRef',
  CHAPTER_CONTEXT_REFS_AUTO_PICK: 'chapter.autoPickContextRefs',
  CHAPTER_LIST_OUTLINES_BY_PROJECT: 'chapter.listOutlinesByProject',
  AI_EXTRACT_OUTLINE: 'ai.extractOutline',
  AI_GENERATE_CHAPTER_TITLE: 'ai.generateChapterTitle',
  AI_GENERATE_CHAPTER_GOAL: 'ai.generateChapterGoal',
  AI_GENERATE_CHAPTER_NEXT_HOOK: 'ai.generateChapterNextHook',
  AI_REVIEW_CHAPTER_PIT_RESPONSES: 'ai.reviewChapterPitResponses',
  AI_REVIEW_CHAPTER_PIT_CANDIDATES: 'ai.reviewChapterPitCandidates',
  AI_CHAT: 'ai.chat',
  AI_CONFIG_GET: 'ai.config.get',
  AI_CONFIG_UPDATE: 'ai.config.update',
  AI_CONFIG_DELETE: 'ai.config.delete',
  AI_CONFIG_LIST_MODELS: 'ai.config.listModels',
  CHAPTER_LIST_CREATED_PITS: 'chapter.listCreatedPits',
  CHAPTER_LIST_RESOLVED_PITS: 'chapter.listResolvedPits',
  CHAPTER_GET_PIT_SUGGESTIONS: 'chapter.getPitSuggestions',
  CHAPTER_LIST_PLANNED_PITS: 'chapter.listPlannedPits',
  CHAPTER_PLAN_PIT_RESPONSE: 'chapter.planPitResponse',
  CHAPTER_UNPLAN_PIT_RESPONSE: 'chapter.unplanPitResponse',
  CHAPTER_LIST_PIT_REVIEWS: 'chapter.listPitReviews',
  CHAPTER_REVIEW_PIT_RESPONSE: 'chapter.reviewPitResponse',
  CHAPTER_CLEAR_PIT_REVIEW: 'chapter.clearPitReview',
  CHAPTER_LIST_PIT_CANDIDATES: 'chapter.listPitCandidates',
  CHAPTER_CREATE_PIT_CANDIDATE_MANUAL: 'chapter.createPitCandidateManual',
  CHAPTER_UPDATE_PIT_CANDIDATE: 'chapter.updatePitCandidate',
  CHAPTER_DELETE_PIT_CANDIDATE: 'chapter.deletePitCandidate',
  CHAPTER_REVIEW_PIT_CANDIDATE: 'chapter.reviewPitCandidate',
  CHAPTER_CREATE_PIT_FROM_SUGGESTION: 'chapter.createPitFromSuggestion',
  CHAPTER_CREATE_PIT_MANUAL: 'chapter.createPitManual',
  CHAPTER_CREATE_PIT: 'chapter.createPit',
  CHAPTER_GENERATE_PITS_FROM_CONTENT: 'chapter.generatePitsFromContent',
  CHAPTER_APPLY_GENERATED_PITS: 'chapter.applyGeneratedPits',
  CHAPTER_RESOLVE_PIT: 'chapter.resolvePit',
  CHAPTER_UNRESOLVE_PIT: 'chapter.unresolvePit',
  PIT_LIST_BY_PROJECT: 'pit.listByProject',
  PIT_LIST_GROUPED_BY_PROJECT: 'pit.listGroupedByProject',
  PIT_LIST_AVAILABLE_FOR_CHAPTER: 'pit.listAvailableForChapter',
  PIT_CREATE_MANUAL: 'pit.createManual',
  PIT_UPDATE: 'pit.update',
  PIT_DELETE: 'pit.delete',
  CHARACTER_LIST: 'character.list',
  CHARACTER_CREATE: 'character.create',
  CHARACTER_GET: 'character.get',
  CHARACTER_UPDATE: 'character.update',
  CHARACTER_DELETE: 'character.delete',
  CHARACTER_RELATIONSHIP_LIST: 'character.relationship.list',
  CHARACTER_RELATIONSHIP_UPSERT: 'character.relationship.upsert',
  TIMELINE_EVENT_LIST_BY_PROJECT: 'timeline.event.listByProject',
  TIMELINE_EVENT_REPLACE_CHAPTER: 'timeline.event.replaceChapter',
  TIMELINE_LAYER_LIST_BY_PROJECT: 'timeline.layer.listByProject',
  TIMELINE_LAYER_REPLACE_CHAPTER: 'timeline.layer.replaceChapter',
  LORE_LIST: 'lore.list',
  LORE_CREATE: 'lore.create',
  LORE_GET: 'lore.get',
  LORE_UPDATE: 'lore.update',
  LORE_DELETE: 'lore.delete',
  SUGGESTION_LIST_BY_ENTITY: 'suggestion.listByEntity',
  SUGGESTION_CREATE_MOCK: 'suggestion.createMock',
  SUGGESTION_APPLY: 'suggestion.apply',
  SUGGESTION_REJECT: 'suggestion.reject'
} as const;

export const DEFAULT_AI_CHAT_SYSTEM_PROMPT = [
  '你是小说创作工作台里的中文 AI 助手。',
  '优先帮助作者推进剧情、分析人物动机、检查设定一致性、润色对白、复盘章节结构。',
  '回答要具体、可执行，默认使用简体中文。',
  '如果用户要求续写或改写，请保持作品既有语气，并避免覆盖用户未确认的设定。'
].join('\n');

export const DEFAULT_AI_PROMPT_TEMPLATES = {
  continue: [
    '请基于当前作品设定、人物关系和已有正文进行续写。',
    '保持原有叙事视角、语气和节奏，不要突然改变人物动机。',
    '优先推进当前冲突或场景目标，并自然埋下下一步钩子。'
  ].join('\n'),
  rewrite: [
    '请在不改变核心剧情事实和人物关系的前提下改写这段内容。',
    '优化叙事节奏、画面感、情绪递进和段落衔接。',
    '保留重要信息，避免新增未经确认的设定。'
  ].join('\n'),
  polish: [
    '请润色这段文字，让表达更自然、更有画面感。',
    '保留原意和剧情信息，重点优化措辞、句式、对白和节奏。',
    '不要大幅扩写，不要改变人物立场。'
  ].join('\n'),
  generate: [
    '??????????????????????????????????????????????????????????????????????????????????',
    '???????????????????????????????????????????????????????????????',
    '????????????????????????????????????????????????????????'
  ].join('\n'),
  inspiration: [
    '任务：为当前章节生成接下来可写的灵感和发展方向。',
    '系统会提供与全章生成一致的参考内容：前 5 章时间线、当前章节正文、资料库引用、未回收伏笔、未完成计划和人物关系。',
    '不要直接写正文，不要输出完整段落，不要替作者下最终决定。',
    '请给出 3 到 6 条可选灵感，每条都要说明适合如何接下去写，以及可以牵动哪个冲突、人物关系、伏笔或计划。',
    '优先解决作者补充提示里的卡点；如果没有补充提示，就围绕当前章节正文的下一步行动、冲突升级、情绪转折、伏笔响应或小高潮给方向。',
    '请用清晰短条目输出，不要输出 JSON。'
  ].join('\n'),
  relationshipGraph: [
    '请根据当前章节正文、当前章节引用人物、已有关系摘要，增量更新人物关系图。',
    '一次性更新当前章节涉及的所有人物，不要只更新当前选中的人物。',
    '保留已有的重要关系，补充本章新增或变化的关系，不要编造当前章节和已有摘要里没有依据的关系。',
    '在每个人物的关系内容里尽量显式写出相关人物姓名，方便关系图自动连线。',
    '请只输出 JSON：{"items":[{"characterName":"人物名","details":"更新后的关系内容"}]}，不要输出解释、标题或 Markdown。'
  ].join('\n'),
  timelineStoryTime: [
    '任务：先提取当前章节的具体故事时间。',
    '系统会在输入中提供当前章节正文，并附带前 5 章的时间线摘要作为参考。你要优先结合前文时间判断当前章节处于穿越前、穿越后、回忆、倒叙、插叙或正线推进中的位置。',
    '只根据当前章节正文和前文时间线判断时间，不要使用资料库补写，不要猜测未来剧情。',
    '如果正文明确写了年代、月份、日期、时辰、穿越前后、某事件之后第几天等，就提取出来。',
    '没有日历日期不等于未知。只要正文能直接推出“穿越前/穿越后第几天、刚穿越、回到小时候、几岁、八九十年代、季节、早晨/夜晚”等，就必须写成具体的相对故事时间，timeType 用 relative。',
    '例如：正文写“林风六岁”“晨光”“老式木床”“刚穿越回八九十年代”，应输出 timeText 为“刚穿越回八九十年代的小时候，穿越后第一天清晨”，不能输出未知时间。',
    '只有正文和前文时间线都完全没有任何时代、阶段、先后、昼夜、季节、年龄线索时，才允许 unknown，timeText 留空或写“未知”。',
    '请只输出 JSON，不要输出解释、标题或 Markdown。格式：{"storyTimes":[{"timeText":"具体时间","timeType":"absolute","summary":"一句话说明时间依据","confidence":0.86}]}'
  ].join('\n'),
  timeline: [
    '任务：提取当前章节时间线内容。',
    '系统会先提取本章具体时间，并在输入中提供“本章具体时间”作为锚点；同时会附带前 10 章的时间线摘要，以及当前章节之前未回收/推进中的伏笔候选。',
    '剧情事件、人物状态、伏笔动作、章节总结都必须重点参考本章具体时间，并共同参考前 10 章时间线，保证时间顺序和倒叙/回忆位置一致。',
    '只根据当前章节正文、前文时间线摘要和伏笔候选提取已经发生或已经明示的信息，不要使用资料库补写，不要猜测未来剧情。',
    '一次性输出五层：具体时间、章节总结、剧情事件、人物状态、伏笔动作。五个字段都必须存在；没有内容就返回空数组。',
    '具体时间必须沿用或修正输入中的本章具体时间，只写本章明确出现或能够直接推断的故事时间，timeType 用 absolute、relative 或 unknown。没有明确时间也要返回一条 unknown 记录，timeText 留空或写“未知”。',
    '章节总结只写一条，提炼本章最核心的长期记忆摘要，必须简短、稳定、适合写进规划里的章节摘要。系统会把这个结果同步到“规划 > 章节摘要”，所以不要写临时感想或过长分析。',
    '剧情事件按正文发生顺序排列。事件类型用 2 到 6 个汉字，比如：发现、冲突、转折、决定、线索、危机、收束。',
    '人物状态只写当前章节直接出现或被明确描写的人物，概括其本章情绪、目标、立场、身体状态和一句话状态变化。',
    '伏笔动作要先检查输入里的伏笔候选，再判断本章是否响应、推进或回收了其中某个伏笔；如果命中候选伏笔，必须在该条 foreshadows 里填写 pitId。如果本章产生新伏笔，pitId 留空。',
    'status 用：埋设、响应、推进、回收、误导、揭示。每一层最多输出 8 条，摘要保持简短，优先选影响后续剧情的信息。',
    '新埋设伏笔最多输出 3 条，这是硬限制，只保留最明确、最像伏笔、后续确实可能回收的条目；已有伏笔的响应、推进、回收不受这 3 条上限限制。',
    '请只输出 JSON，不要输出解释、标题或 Markdown。格式：{"storyTimes":[{"timeText":"具体时间","timeType":"absolute","summary":"一句话说明","confidence":0.86}],"chapterSummary":{"summary":"一句话章节总结","confidence":0.86},"events":[{"type":"发现","title":"事件标题","summary":"一句话说明事件影响","characters":["人物名"]}],"characterStates":[{"characterName":"人物名","mood":"情绪","goal":"本章目标","stance":"立场/态度","physicalState":"身体状态","summary":"一句话状态变化"}],"foreshadows":[{"pitId":"已有伏笔ID或空字符串","title":"伏笔名","status":"响应","clue":"本章证据","payoff":"已回收则写结果，否则留空","summary":"一句话说明","confidence":0.86}]}'
  ].join('\n'),
  chapterWrapUp: [
    '任务：对当前章节执行一次 AI 一键总结后的同步判断。',
    '系统会先单独更新时间线，因此你此时要重点根据：当前章节正文、当前章节时间线结果、前 10 章时间线摘要、当前章节创作计划、当前章节关系图、以及本章中实际出现的资料库人物，做后续同步判断。',
    '你需要完成三件事：1. 判断当前章节每条创作计划是否已完成；2. 更新当前章节人物关系图；3. 为本章实际出现且资料库里已存在的人物生成稳定资料更新。',
    '计划判断必须保守。只有正文已经明确完成、兑现或实现该计划，status 才能标记为 done；否则一律保持 open。',
    '人物关系图只根据当前章节正文判断，不要虚构正文没有写出的关系。人物节点应覆盖本章出现的人物，即使资料库里没有也可以出现在章节关系图里。',
    '资料库人物更新只允许更新“资料库中已存在且本章实际出现的人物”。不要创建新人物。只补充稳定信息，比如身份、长期动机、长期关系、经历、能力、背景、持续立场变化；不要写临时情绪和一次性的细碎动作。',
    '请只输出 JSON，不要输出解释、标题或 Markdown。格式：{"plans":[{"index":0,"status":"open","reason":"一句话依据"}],"relationshipGraph":{"characters":[{"name":"人物名","role":"角色定位","summary":"一句话简介"}],"items":[{"from":"人物名","to":"人物名","label":"短关系名","summary":"一句话说明正文依据"}]},"characterUpdates":[{"characterName":"人物名","details":"更新后的稳定资料"}]}'
  ].join('\n'),
  proofread: [
    '任务：纠正当前章节正文中的错别字、漏字、多字、明显误用字和明显标点错误。',
    '只做文字纠错，不改写剧情、不润色风格、不调整叙述节奏、不新增内容、不删减信息。',
    '保留原有段落结构、人物名、专有名词、口语语气和作者风格。拿不准的词不要改。',
    '请输出 JSON，不要输出解释、标题或 Markdown。格式：{"text":"纠错后的完整正文","changes":[{"before":"原文错误片段","after":"修改后片段","reason":"错别字/漏字/多字/标点/误用字"}]}。如果没有发现错误，changes 返回空数组，text 返回原正文。'
  ].join('\n')
} as const;

export type AiPromptTemplateKey = keyof typeof DEFAULT_AI_PROMPT_TEMPLATES;
export type AiPromptTemplates = Record<AiPromptTemplateKey, string>;

export type IpcError = {
  code: string;
  message: string;
};

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError };

export type Topology = 'single-db-multi-project';

export type RecentProject = {
  id: string;
  title: string;
  updated_at: string;
};

export type AppInitData = {
  schemaVersion: number;
  dbPath: string;
  topology: Topology;
  recentProjects: RecentProject[];
  autosaveIntervalSeconds: AutosaveIntervalSeconds;
};

export type AutosaveIntervalSeconds = 0 | 5 | 10 | 30 | 60;

export type AppMenuAction =
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll'
  | 'reload'
  | 'forceReload'
  | 'toggleDevTools'
  | 'resetZoom'
  | 'zoomIn'
  | 'zoomOut'
  | 'toggleFullscreen'
  | 'minimize'
  | 'closeWindow'
  | 'quit'
  | 'about';

export type AppMenuActionInput = { action: AppMenuAction };
export type AppSetAutosaveIntervalInput = { seconds: AutosaveIntervalSeconds };

export type AppStorageInfo = {
  dbPath: string;
  dataDir: string;
  defaultDir: string;
  isCustom: boolean;
};

export type NovelProjectSource = 'user' | 'imported';
export type EntitySource = 'user' | 'ai_summary' | 'imported';

export type ProjectStage = {
  id: string;
  title: string;
  summary: string;
  status: 'complete' | 'incomplete';
};

export type NovelProject = {
  id: string;
  title: string;
  description: string;
  outline_text: string;
  stages_json: ProjectStage[];
  created_at: string;
  updated_at: string;
  source: NovelProjectSource;
  is_deleted: boolean;
  deleted_at: string | null;
};

export type ChapterStatus = 'draft' | 'review' | 'final';
export type ChapterSource = EntitySource;

export type Chapter = {
  id: string;
  project_id: string;
  index_no: number;
  title: string;
  status: ChapterStatus;
  pits_enabled: boolean;
  goal: string;
  outline_ai: string;
  outline_user: string;
  planning_clues_json: string[];
  planning_status_json: string[];
  foreshadow_notes_json: string[];
  content: string;
  next_hook: string;
  word_count: number;
  revision: number;
  confirmed_fields_json: string[];
  created_at: string;
  updated_at: string;
  source: ChapterSource;
  is_deleted: boolean;
  deleted_at: string | null;
};

export type ChapterRefs = {
  chapterId: string;
  characterIds: string[];
  loreEntryIds: string[];
};

export type ChapterRelationshipGraphNode = {
  id: string;
  name: string;
  role_type: string;
  summary: string;
  details: string;
};

export type ChapterRelationshipGraphLink = {
  id: string;
  fromId: string;
  toId: string;
  label: string;
  summary: string;
};

export type ChapterRelationshipGraph = {
  nodes: ChapterRelationshipGraphNode[];
  links: ChapterRelationshipGraphLink[];
};

export type ChapterContextRefMode = 'auto' | 'manual' | 'pinned';

export type ChapterContextRef = {
  id: string;
  chapter_id: string;
  ref_chapter_id: string;
  mode: ChapterContextRefMode;
  weight: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type ChapterContextRefView = ChapterContextRef & {
  ref_chapter_index_no: number;
  ref_chapter_title: string;
  ref_outline_user: string;
  ref_updated_at: string;
  ref_content_excerpt: string;
};

export type ChapterOutlineOverviewItem = {
  chapterId: string;
  index_no: number;
  title: string;
  outline_user: string;
  updated_at: string;
};

export type StoryPitType = 'chapter' | 'manual';
export type StoryPitCreationMethod = 'ai' | 'manual';
export type StoryPitStatus = 'open' | 'resolved';
export type StoryPitProgressStatus = 'unaddressed' | 'partial' | 'clear' | 'resolved';

export type StoryPit = {
  id: string;
  project_id: string;
  type: StoryPitType;
  origin_chapter_id: string | null;
  creation_method: StoryPitCreationMethod;
  content: string;
  status: StoryPitStatus;
  progress_status: StoryPitProgressStatus;
  resolved_in_chapter_id: string | null;
  sort_order: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type StoryPitView = StoryPit & {
  origin_chapter_index_no: number | null;
  origin_chapter_title: string | null;
  resolved_in_chapter_index_no: number | null;
  resolved_in_chapter_title: string | null;
};

export type StoryPitChapterGroup = {
  chapterId: string;
  index_no: number;
  title: string;
  pits: StoryPitView[];
};

export type PitGroupedByProjectResult = {
  chapterGroups: StoryPitChapterGroup[];
  manualPits: StoryPitView[];
};

export type ChapterPitPlan = {
  id: string;
  chapter_id: string;
  pit_id: string;
  created_at: string;
  updated_at: string;
};

export type ChapterPitPlanView = ChapterPitPlan & {
  pit: StoryPitView;
};

export type ChapterPitReviewOutcome = 'none' | 'partial' | 'clear' | 'resolved';

export type ChapterPitReview = {
  id: string;
  chapter_id: string;
  pit_id: string;
  outcome: ChapterPitReviewOutcome;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type ChapterPitReviewView = ChapterPitReview & {
  pit: StoryPitView;
};

export type ChapterPitCandidateStatus = 'draft' | 'weak' | 'confirmed' | 'discarded';

export type ChapterPitCandidate = {
  id: string;
  chapter_id: string;
  content: string;
  status: ChapterPitCandidateStatus;
  story_pit_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Character = {
  id: string;
  project_id: string;
  name: string;
  role_type: string;
  summary: string;
  details: string;
  source: EntitySource;
  created_at: string;
  updated_at: string;
};

export type CharacterRelationshipEventView = {
  id: string;
  relationship_id: string;
  chapter_id: string | null;
  chapter_index_no: number | null;
  chapter_title: string | null;
  label: string;
  summary: string;
  created_at: string;
  updated_at: string;
};

export type CharacterRelationshipView = {
  id: string;
  project_id: string;
  character_a_id: string;
  character_b_id: string;
  current_label: string;
  updated_at: string;
  events: CharacterRelationshipEventView[];
};

export type TimelineEventSource = 'ai' | 'user';

export type TimelineEvent = {
  id: string;
  project_id: string;
  chapter_id: string;
  event_type: string;
  title: string;
  summary: string;
  character_names_json: string[];
  sort_order: number;
  source: TimelineEventSource;
  created_at: string;
  updated_at: string;
};

export type TimelineEventView = TimelineEvent & {
  chapter_index_no: number;
  chapter_title: string;
};

export type TimelineStoryTimeType = 'absolute' | 'relative' | 'unknown';

export type TimelineStoryTime = {
  id: string;
  project_id: string;
  chapter_id: string;
  time_text: string;
  time_type: TimelineStoryTimeType;
  summary: string;
  confidence: number | null;
  source: TimelineEventSource;
  created_at: string;
  updated_at: string;
};

export type TimelineStoryTimeView = TimelineStoryTime & {
  chapter_index_no: number;
  chapter_title: string;
};

export type TimelineChapterSummaryDraft = {
  summary: string;
  confidence: number | null;
};

export type TimelineChapterSummary = {
  id: string;
  project_id: string;
  chapter_id: string;
  summary: string;
  confidence: number | null;
  source: TimelineEventSource;
  created_at: string;
  updated_at: string;
};

export type TimelineChapterSummaryView = TimelineChapterSummary & {
  chapter_index_no: number;
  chapter_title: string;
};

export type TimelineCharacterState = {
  id: string;
  project_id: string;
  chapter_id: string;
  character_name: string;
  mood: string;
  goal: string;
  stance: string;
  physical_state: string;
  summary: string;
  sort_order: number;
  source: TimelineEventSource;
  created_at: string;
  updated_at: string;
};

export type TimelineCharacterStateView = TimelineCharacterState & {
  chapter_index_no: number;
  chapter_title: string;
};

export type TimelineForeshadow = {
  id: string;
  project_id: string;
  chapter_id: string;
  title: string;
  status: string;
  clue: string;
  payoff: string;
  summary: string;
  sort_order: number;
  source: TimelineEventSource;
  created_at: string;
  updated_at: string;
};

export type TimelineForeshadowView = TimelineForeshadow & {
  chapter_index_no: number;
  chapter_title: string;
};

export type LoreEntry = {
  id: string;
  project_id: string;
  type: string;
  title: string;
  summary: string;
  content: string;
  tags_json: string[];
  source: EntitySource;
  created_at: string;
  updated_at: string;
};

export type AiSuggestionStatus = 'pending' | 'applied' | 'rejected' | 'partially_applied';
export type AiSuggestionSource = 'mock' | 'chapter_summary' | 'manual';

export type AppliedChange = {
  field: string;
  previousValue: unknown;
  newValue: unknown;
};

export type SuggestionResult = {
  appliedChanges: AppliedChange[];
  blockedFields: string[];
};

export type AiSuggestion = {
  id: string;
  entity_type: string;
  entity_id: string;
  kind: string;
  patch_json: Record<string, unknown>;
  status: AiSuggestionStatus;
  summary: string;
  source: AiSuggestionSource;
  result_json: SuggestionResult;
  created_at: string;
};

export type AiExtractOutlineResult = {
  chapterId: string;
  candidateOutline: string;
  provider: string;
  model: string | null;
  referenceText: string;
};

export type AiGenerateChapterField = 'title' | 'goal' | 'next_hook';

export type AiGenerateChapterFieldResult = {
  chapterId: string;
  field: AiGenerateChapterField;
  candidateText: string;
  provider: string;
  model: string | null;
  referenceText: string;
};

export type AiPitResponseReviewItem = {
  pitId: string;
  outcome: ChapterPitReviewOutcome;
  note: string;
};

export type AiReviewChapterPitResponsesInput = {
  chapterId: string;
  promptText?: string;
};

export type AiReviewChapterPitResponsesResult = {
  chapterId: string;
  items: AiPitResponseReviewItem[];
  provider: string;
  model: string | null;
  referenceText: string;
};

export type AiPitCandidateReviewItem = {
  candidateId: string;
  status: ChapterPitCandidateStatus;
};

export type AiNewPitCandidateSuggestion = {
  content: string;
  status: ChapterPitCandidateStatus;
};

export type AiReviewChapterPitCandidatesInput = {
  chapterId: string;
  promptText?: string;
};

export type AiReviewChapterPitCandidatesResult = {
  chapterId: string;
  existingItems: AiPitCandidateReviewItem[];
  newItems: AiNewPitCandidateSuggestion[];
  provider: string;
  model: string | null;
  referenceText: string;
};

export type AiChatRole = 'user' | 'assistant';

export type AiChatMessage = {
  role: AiChatRole;
  content: string;
  provider?: string;
  model?: string | null;
};

export type AiChatInput = {
  projectId: string;
  chapterId?: string | null;
  model?: string;
  messages: AiChatMessage[];
};

export type AiChatResult = {
  message: string;
  provider: string;
  model: string | null;
  referenceText: string;
};

export type AiProviderConfig = {
  id: string;
  providerType: 'openai' | 'openai-compatible';
  connectionName: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  customModels: string;
};

export type AiProviderConfigUpdateInput = Partial<AiProviderConfig> & {
  systemPrompt?: string;
  promptTemplates?: Partial<AiPromptTemplates>;
};

export type AiProviderConfigDeleteInput = {
  id: string;
};

export type AiProviderConfigState = {
  connections: AiProviderConfig[];
  activeConnectionId: string;
  systemPrompt: string;
  promptTemplates: AiPromptTemplates;
};

export type AiProviderListModelsInput = {
  baseUrl: string;
  apiKey: string;
};

export type AiProviderListModelsResult = {
  models: string[];
};

export type ChapterGeneratePitsFromContentResult = {
  chapterId: string;
  candidates: string[];
  provider: string;
  model: string | null;
  referenceText: string;
};

export type ChapterPitSuggestionsResult = {
  chapterId: string;
  candidates: string[];
  provider: string;
  model: string | null;
  referenceText: string;
};

export type ProjectCreateInput = {
  title: string;
  description?: string;
  source?: NovelProjectSource;
};

export type ProjectGetInput = {
  projectId: string;
};

export type ProjectUpdatePatch = Partial<Pick<NovelProject, 'title' | 'description' | 'outline_text' | 'stages_json'>>;

export type ProjectUpdateInput = {
  projectId: string;
  patch: ProjectUpdatePatch;
};

export type ProjectDeleteInput = {
  projectId: string;
};

export type ProjectRestoreInput = {
  projectId: string;
};

export type ChapterCreateInput = {
  projectId: string;
  title: string;
  indexNo?: number;
  status?: ChapterStatus;
  pitsEnabled?: boolean;
  goal?: string;
  outlineAi?: string;
  outlineUser?: string;
  planningCluesJson?: string[];
  foreshadowNotesJson?: string[];
  content?: string;
  nextHook?: string;
  source?: ChapterSource;
};

export type ChapterUpdatePatch = Partial<
  Pick<
    Chapter,
    | 'title'
    | 'status'
    | 'pits_enabled'
    | 'goal'
    | 'outline_ai'
    | 'outline_user'
    | 'planning_clues_json'
    | 'planning_status_json'
    | 'foreshadow_notes_json'
    | 'content'
    | 'next_hook'
    | 'confirmed_fields_json'
    | 'source'
  >
>;

export type ChapterUpdateInput = {
  chapterId: string;
  patch: ChapterUpdatePatch;
  actor?: 'user' | 'ai_suggestion';
};

export type ChapterDeleteInput = {
  chapterId: string;
};

export type ChapterListDeletedInput = {
  projectId: string;
};

export type ChapterRestoreInput = {
  chapterId: string;
};

export type ChapterDeletePermanentInput = {
  chapterId: string;
};

export type AiExtractOutlineInput = {
  chapterId: string;
  promptText?: string;
};

export type AiGenerateChapterFieldInput = {
  chapterId: string;
  promptText?: string;
};

export type ChapterRefsGetInput = {
  chapterId: string;
};

export type ChapterRefsUpdateInput = {
  chapterId: string;
  characterIds: string[];
  loreEntryIds: string[];
};

export type ChapterRelationshipGraphGetInput = {
  chapterId: string;
};

export type ChapterRelationshipGraphUpdateInput = {
  chapterId: string;
  graph: ChapterRelationshipGraph;
};

export type ChapterContextRefsGetInput = {
  chapterId: string;
};

export type ChapterContextRefAddInput = {
  chapterId: string;
  refChapterId: string;
  mode?: Exclude<ChapterContextRefMode, 'auto'>;
  weight?: number;
  note?: string | null;
};

export type ChapterContextRefRemoveInput = {
  contextRefId: string;
};

export type ChapterContextRefUpdateInput = {
  contextRefId: string;
  patch: Partial<Pick<ChapterContextRef, 'mode' | 'weight' | 'note'>>;
};

export type ChapterAutoPickContextRefsInput = {
  chapterId: string;
  limit?: number;
};

export type ChapterListOutlinesByProjectInput = {
  projectId: string;
};

export type PitListByProjectInput = {
  projectId: string;
};

export type PitListGroupedByProjectInput = {
  projectId: string;
};

export type PitListAvailableForChapterInput = {
  chapterId: string;
};

export type PitCreateManualInput = {
  projectId: string;
  content: string;
  note?: string | null;
};

export type PitUpdatePatch = Partial<Pick<StoryPit, 'content' | 'note' | 'sort_order'>>;

export type PitUpdateInput = {
  pitId: string;
  patch: PitUpdatePatch;
};

export type PitDeleteInput = {
  pitId: string;
};

export type ChapterListCreatedPitsInput = {
  chapterId: string;
};

export type ChapterListResolvedPitsInput = {
  chapterId: string;
};

export type ChapterGetPitSuggestionsInput = {
  chapterId: string;
  promptText?: string;
};

export type ChapterListPlannedPitsInput = {
  chapterId: string;
};

export type ChapterPlanPitResponseInput = {
  chapterId: string;
  pitId: string;
};

export type ChapterUnplanPitResponseInput = {
  chapterId: string;
  pitId: string;
};

export type ChapterListPitReviewsInput = {
  chapterId: string;
};

export type ChapterReviewPitResponseInput = {
  chapterId: string;
  pitId: string;
  outcome: ChapterPitReviewOutcome;
  note?: string | null;
};

export type ChapterClearPitReviewInput = {
  chapterId: string;
  pitId: string;
};

export type ChapterListPitCandidatesInput = {
  chapterId: string;
};

export type ChapterCreatePitCandidateManualInput = {
  chapterId: string;
  content: string;
};

export type ChapterPitCandidateUpdatePatch = Partial<Pick<ChapterPitCandidate, 'content' | 'status'>>;

export type ChapterUpdatePitCandidateInput = {
  candidateId: string;
  patch: ChapterPitCandidateUpdatePatch;
};

export type ChapterDeletePitCandidateInput = {
  candidateId: string;
};

export type ChapterReviewPitCandidateInput = {
  chapterId: string;
  candidateId: string;
  status: ChapterPitCandidateStatus;
};

export type ChapterCreatePitFromSuggestionInput = {
  chapterId: string;
  content: string;
  note?: string | null;
};

export type ChapterCreatePitManualInput = {
  chapterId: string;
  content: string;
  note?: string | null;
};

export type ChapterCreatePitInput = {
  chapterId: string;
  content: string;
  note?: string | null;
};

export type ChapterGeneratePitsFromContentInput = {
  chapterId: string;
};

export type ChapterApplyGeneratedPitsInput = {
  chapterId: string;
  candidates: string[];
};

export type ChapterResolvePitInput = {
  chapterId: string;
  pitId: string;
};

export type ChapterUnresolvePitInput = {
  chapterId: string;
  pitId: string;
};

export type CharacterCreateInput = {
  projectId: string;
  name: string;
  roleType?: string;
  summary?: string;
  details?: string;
  source?: EntitySource;
};

export type CharacterUpdatePatch = Partial<Pick<Character, 'name' | 'role_type' | 'summary' | 'details' | 'source'>>;

export type CharacterUpdateInput = {
  characterId: string;
  patch: CharacterUpdatePatch;
};

export type CharacterDeleteInput = {
  characterId: string;
};

export type CharacterRelationshipListInput = {
  projectId: string;
};

export type CharacterRelationshipUpsertInput = {
  projectId: string;
  characterAId: string;
  characterBId: string;
  label: string;
  chapterId?: string | null;
  summary?: string;
};

export type TimelineEventListByProjectInput = {
  projectId: string;
};

export type TimelineEventDraft = {
  event_type: string;
  title: string;
  summary: string;
  character_names_json: string[];
};

export type TimelineCharacterStateDraft = {
  character_name: string;
  mood: string;
  goal: string;
  stance: string;
  physical_state: string;
  summary: string;
};

export type TimelineStoryTimeDraft = {
  time_text: string;
  time_type: TimelineStoryTimeType;
  summary: string;
  confidence: number | null;
};

export type TimelineForeshadowDraft = {
  title: string;
  status: string;
  clue: string;
  payoff: string;
  summary: string;
};

export type TimelineEventReplaceChapterInput = {
  projectId: string;
  chapterId: string;
  events: TimelineEventDraft[];
};

export type TimelineLayerListByProjectInput = {
  projectId: string;
};

export type TimelineLayerData = {
  storyTimes: TimelineStoryTimeView[];
  chapterSummaries: TimelineChapterSummaryView[];
  events: TimelineEventView[];
  characterStates: TimelineCharacterStateView[];
  foreshadows: TimelineForeshadowView[];
};

export type TimelineLayerDraft = {
  storyTime?: TimelineStoryTimeDraft | null;
  chapterSummary?: TimelineChapterSummaryDraft | null;
  events: TimelineEventDraft[];
  characterStates: TimelineCharacterStateDraft[];
  foreshadows: TimelineForeshadowDraft[];
};

export type TimelineLayerReplaceChapterInput = {
  projectId: string;
  chapterId: string;
  data: TimelineLayerDraft;
};

export type LoreEntryCreateInput = {
  projectId: string;
  type: string;
  title: string;
  summary?: string;
  content?: string;
  tagsJson?: string[];
  source?: EntitySource;
};

export type LoreEntryUpdatePatch = Partial<
  Pick<LoreEntry, 'type' | 'title' | 'summary' | 'content' | 'tags_json' | 'source'>
>;

export type LoreEntryUpdateInput = {
  loreEntryId: string;
  patch: LoreEntryUpdatePatch;
};

export type LoreEntryDeleteInput = {
  loreEntryId: string;
};

export type DeleteResult = {
  deleted: boolean;
};

export type SuggestionListByEntityInput = {
  entityType: string;
  entityId: string;
};

export type SuggestionCreateMockInput = {
  entityType: string;
  entityId: string;
};

export type SuggestionApplyInput = {
  suggestionId: string;
};

export type SuggestionApplyResult = {
  status: AiSuggestionStatus;
  appliedChanges: AppliedChange[];
  blockedFields: string[];
};

export type SuggestionRejectInput = {
  suggestionId: string;
};

export type SuggestionRejectResult = {
  status: 'rejected';
};
