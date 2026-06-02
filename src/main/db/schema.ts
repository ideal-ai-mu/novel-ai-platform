export const CURRENT_SCHEMA_VERSION = 13;

type Queryable = {
  run: (sql: string, params?: unknown[]) => void;
  queryOne: <TRow extends Record<string, unknown>>(sql: string, params?: unknown[]) => TRow | null;
  queryAll: <TRow extends Record<string, unknown>>(sql: string, params?: unknown[]) => TRow[];
};

type SchemaBootstrapContext = Queryable;

function ensureSuggestionColumns(context: Queryable): void {
  const columns = context.queryAll<{ name: unknown }>('PRAGMA table_info(ai_suggestions)');
  const names = new Set(columns.map((item) => String(item.name)));
  if (!names.has('result_json')) {
    context.run(`ALTER TABLE ai_suggestions ADD COLUMN result_json TEXT NOT NULL DEFAULT '{"appliedChanges":[],"blockedFields":[]}'`);
  }
}

function ensureProjectColumns(context: Queryable): void {
  const columns = context.queryAll<{ name: unknown }>('PRAGMA table_info(novel_projects)');
  const names = new Set(columns.map((item) => String(item.name)));
  if (!names.has('outline_text')) {
    context.run("ALTER TABLE novel_projects ADD COLUMN outline_text TEXT NOT NULL DEFAULT ''");
  }
  if (!names.has('stages_json')) {
    context.run("ALTER TABLE novel_projects ADD COLUMN stages_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!names.has('is_deleted')) {
    context.run('ALTER TABLE novel_projects ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0');
  }
  if (!names.has('deleted_at')) {
    context.run('ALTER TABLE novel_projects ADD COLUMN deleted_at TEXT DEFAULT NULL');
  }
}

function ensurePitWorkflowSchema(context: Queryable): void {
  const pitColumns = context.queryAll<{ name: unknown }>('PRAGMA table_info(story_pits)');
  const pitNames = new Set(pitColumns.map((item) => String(item.name)));
  if (!pitNames.has('progress_status')) {
    context.run("ALTER TABLE story_pits ADD COLUMN progress_status TEXT NOT NULL DEFAULT 'unaddressed'");
    context.run(
      `UPDATE story_pits
       SET progress_status = CASE status
         WHEN 'resolved' THEN 'resolved'
         ELSE 'unaddressed'
       END
       WHERE progress_status IS NULL OR progress_status = ''`
    );
  }

  const candidateColumns = context.queryAll<{ name: unknown }>('PRAGMA table_info(chapter_pit_candidates)');
  const candidateNames = new Set(candidateColumns.map((item) => String(item.name)));
  if (candidateColumns.length > 0 && !candidateNames.has('story_pit_id')) {
    context.run('ALTER TABLE chapter_pit_candidates ADD COLUMN story_pit_id TEXT DEFAULT NULL');
  }
}

function ensureChapterColumns(context: Queryable): void {
  const columns = context.queryAll<{ name: unknown }>('PRAGMA table_info(chapters)');
  const names = new Set(columns.map((item) => String(item.name)));
  if (!names.has('pits_enabled')) {
    context.run('ALTER TABLE chapters ADD COLUMN pits_enabled INTEGER NOT NULL DEFAULT 0');
  }
  if (!names.has('planning_clues_json')) {
    context.run("ALTER TABLE chapters ADD COLUMN planning_clues_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!names.has('planning_status_json')) {
    context.run("ALTER TABLE chapters ADD COLUMN planning_status_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!names.has('foreshadow_notes_json')) {
    context.run("ALTER TABLE chapters ADD COLUMN foreshadow_notes_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!names.has('is_deleted')) {
    context.run('ALTER TABLE chapters ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0');
  }
  if (!names.has('deleted_at')) {
    context.run('ALTER TABLE chapters ADD COLUMN deleted_at TEXT DEFAULT NULL');
  }
}

function ensureChapterRelationshipGraphSchema(context: Queryable): void {
  context.run(`
    CREATE TABLE IF NOT EXISTS chapter_relationship_graphs (
      chapter_id TEXT PRIMARY KEY,
      graph_json TEXT NOT NULL DEFAULT '{"nodes":[],"links":[]}',
      updated_at TEXT NOT NULL,
      FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chapter_relationship_graphs_updated
      ON chapter_relationship_graphs(updated_at);
  `);
}

function ensureCharacterRelationshipSchema(context: Queryable): void {
  context.run(`
    CREATE TABLE IF NOT EXISTS character_relationships (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      character_a_id TEXT NOT NULL,
      character_b_id TEXT NOT NULL,
      current_label TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES novel_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(character_a_id) REFERENCES characters(id) ON DELETE CASCADE,
      FOREIGN KEY(character_b_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_character_relationship_pair
      ON character_relationships(project_id, character_a_id, character_b_id);
    CREATE INDEX IF NOT EXISTS idx_character_relationships_project
      ON character_relationships(project_id, updated_at);

    CREATE TABLE IF NOT EXISTS character_relationship_events (
      id TEXT PRIMARY KEY,
      relationship_id TEXT NOT NULL,
      chapter_id TEXT DEFAULT NULL,
      label TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(relationship_id) REFERENCES character_relationships(id) ON DELETE CASCADE,
      FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_character_relationship_events_relationship
      ON character_relationship_events(relationship_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_character_relationship_events_chapter
      ON character_relationship_events(chapter_id, created_at);
  `);
}

function ensureTimelineEventSchema(context: Queryable): void {
  context.run(`
    CREATE TABLE IF NOT EXISTS timeline_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      event_type TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      character_names_json TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'ai',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES novel_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_timeline_events_project
      ON timeline_events(project_id, chapter_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_timeline_events_chapter
      ON timeline_events(chapter_id, sort_order);
  `);
}

function ensureTimelineLayerSchema(context: Queryable): void {
  context.run(`
    CREATE TABLE IF NOT EXISTS timeline_story_times (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      time_text TEXT NOT NULL DEFAULT '',
      time_type TEXT NOT NULL DEFAULT 'unknown',
      summary TEXT NOT NULL DEFAULT '',
      confidence REAL DEFAULT NULL,
      source TEXT NOT NULL DEFAULT 'ai',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES novel_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_timeline_story_times_chapter
      ON timeline_story_times(chapter_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_story_times_project
      ON timeline_story_times(project_id, chapter_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_story_times_chapter
      ON timeline_story_times(chapter_id);

    CREATE TABLE IF NOT EXISTS timeline_chapter_summaries (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      confidence REAL DEFAULT NULL,
      source TEXT NOT NULL DEFAULT 'ai',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES novel_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_timeline_chapter_summaries_chapter
      ON timeline_chapter_summaries(chapter_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_chapter_summaries_project
      ON timeline_chapter_summaries(project_id, chapter_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_chapter_summaries_chapter
      ON timeline_chapter_summaries(chapter_id);

    CREATE TABLE IF NOT EXISTS timeline_character_states (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      character_name TEXT NOT NULL,
      mood TEXT NOT NULL DEFAULT '',
      goal TEXT NOT NULL DEFAULT '',
      stance TEXT NOT NULL DEFAULT '',
      physical_state TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'ai',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES novel_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_timeline_character_states_project
      ON timeline_character_states(project_id, chapter_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_timeline_character_states_chapter
      ON timeline_character_states(chapter_id, sort_order);

    CREATE TABLE IF NOT EXISTS timeline_foreshadows (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT '',
      clue TEXT NOT NULL DEFAULT '',
      payoff TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'ai',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES novel_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_timeline_foreshadows_project
      ON timeline_foreshadows(project_id, chapter_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_timeline_foreshadows_chapter
      ON timeline_foreshadows(chapter_id, sort_order);
  `);
}

export function bootstrapSchema(context: SchemaBootstrapContext): void {
  context.run(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS novel_projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      outline_text TEXT NOT NULL DEFAULT '',
      stages_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      source TEXT NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      index_no INTEGER NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      pits_enabled INTEGER NOT NULL DEFAULT 0,
      goal TEXT NOT NULL DEFAULT '',
      outline_ai TEXT NOT NULL DEFAULT '',
      outline_user TEXT NOT NULL DEFAULT '',
      planning_clues_json TEXT NOT NULL DEFAULT '[]',
      planning_status_json TEXT NOT NULL DEFAULT '[]',
      foreshadow_notes_json TEXT NOT NULL DEFAULT '[]',
      content TEXT NOT NULL DEFAULT '',
      next_hook TEXT NOT NULL DEFAULT '',
      word_count INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 1,
      confirmed_fields_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      source TEXT NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT DEFAULT NULL,
      FOREIGN KEY(project_id) REFERENCES novel_projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role_type TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES novel_projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lore_entries (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES novel_projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chapter_character_links (
      chapter_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (chapter_id, character_id),
      FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
      FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chapter_lore_links (
      chapter_id TEXT NOT NULL,
      lore_entry_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (chapter_id, lore_entry_id),
      FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
      FOREIGN KEY(lore_entry_id) REFERENCES lore_entries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chapter_context_refs (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      ref_chapter_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 0,
      note TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
      FOREIGN KEY(ref_chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chapter_relationship_graphs (
      chapter_id TEXT PRIMARY KEY,
      graph_json TEXT NOT NULL DEFAULT '{"nodes":[],"links":[]}',
      updated_at TEXT NOT NULL,
      FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS character_relationships (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      character_a_id TEXT NOT NULL,
      character_b_id TEXT NOT NULL,
      current_label TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES novel_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(character_a_id) REFERENCES characters(id) ON DELETE CASCADE,
      FOREIGN KEY(character_b_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS character_relationship_events (
      id TEXT PRIMARY KEY,
      relationship_id TEXT NOT NULL,
      chapter_id TEXT DEFAULT NULL,
      label TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(relationship_id) REFERENCES character_relationships(id) ON DELETE CASCADE,
      FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS timeline_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      event_type TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      character_names_json TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'ai',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES novel_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS timeline_character_states (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      character_name TEXT NOT NULL,
      mood TEXT NOT NULL DEFAULT '',
      goal TEXT NOT NULL DEFAULT '',
      stance TEXT NOT NULL DEFAULT '',
      physical_state TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'ai',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES novel_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS timeline_foreshadows (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT '',
      clue TEXT NOT NULL DEFAULT '',
      payoff TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'ai',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES novel_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS timeline_story_times (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      time_text TEXT NOT NULL DEFAULT '',
      time_type TEXT NOT NULL DEFAULT 'unknown',
      summary TEXT NOT NULL DEFAULT '',
      confidence REAL DEFAULT NULL,
      source TEXT NOT NULL DEFAULT 'ai',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES novel_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_suggestions (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      patch_json TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      source TEXT NOT NULL,
      result_json TEXT NOT NULL DEFAULT '{"appliedChanges":[],"blockedFields":[]}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS story_pits (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      origin_chapter_id TEXT DEFAULT NULL,
      creation_method TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL,
      progress_status TEXT NOT NULL DEFAULT 'unaddressed',
      resolved_in_chapter_id TEXT DEFAULT NULL,
      sort_order INTEGER DEFAULT NULL,
      note TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES novel_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(origin_chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
      FOREIGN KEY(resolved_in_chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS chapter_pit_plans (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      pit_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
      FOREIGN KEY(pit_id) REFERENCES story_pits(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chapter_pit_reviews (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      pit_id TEXT NOT NULL,
      outcome TEXT NOT NULL,
      note TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
      FOREIGN KEY(pit_id) REFERENCES story_pits(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chapter_pit_candidates (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      story_pit_id TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
      FOREIGN KEY(story_pit_id) REFERENCES story_pits(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id, index_no);
    CREATE INDEX IF NOT EXISTS idx_characters_project ON characters(project_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_lore_project ON lore_entries(project_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_chapter_character_links_chapter ON chapter_character_links(chapter_id);
    CREATE INDEX IF NOT EXISTS idx_chapter_lore_links_chapter ON chapter_lore_links(chapter_id);
    CREATE INDEX IF NOT EXISTS idx_chapter_context_refs_chapter ON chapter_context_refs(chapter_id, mode, weight);
    CREATE INDEX IF NOT EXISTS idx_chapter_relationship_graphs_updated ON chapter_relationship_graphs(updated_at);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_character_relationship_pair ON character_relationships(project_id, character_a_id, character_b_id);
    CREATE INDEX IF NOT EXISTS idx_character_relationships_project ON character_relationships(project_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_character_relationship_events_relationship ON character_relationship_events(relationship_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_character_relationship_events_chapter ON character_relationship_events(chapter_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_timeline_story_times_project ON timeline_story_times(project_id, chapter_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_story_times_chapter ON timeline_story_times(chapter_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_events_project ON timeline_events(project_id, chapter_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_timeline_events_chapter ON timeline_events(chapter_id, sort_order);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_timeline_story_times_chapter ON timeline_story_times(chapter_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_story_times_project ON timeline_story_times(project_id, chapter_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_story_times_chapter ON timeline_story_times(chapter_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_character_states_project ON timeline_character_states(project_id, chapter_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_timeline_character_states_chapter ON timeline_character_states(chapter_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_timeline_foreshadows_project ON timeline_foreshadows(project_id, chapter_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_timeline_foreshadows_chapter ON timeline_foreshadows(chapter_id, sort_order);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_chapter_context_refs_pair ON chapter_context_refs(chapter_id, ref_chapter_id);
    CREATE INDEX IF NOT EXISTS idx_suggestions_entity ON ai_suggestions(entity_type, entity_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_story_pits_project ON story_pits(project_id, status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_story_pits_origin ON story_pits(origin_chapter_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_story_pits_resolved ON story_pits(resolved_in_chapter_id, updated_at);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_chapter_pit_plans_pair ON chapter_pit_plans(chapter_id, pit_id);
    CREATE INDEX IF NOT EXISTS idx_chapter_pit_plans_chapter ON chapter_pit_plans(chapter_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_chapter_pit_reviews_pair ON chapter_pit_reviews(chapter_id, pit_id);
    CREATE INDEX IF NOT EXISTS idx_chapter_pit_reviews_chapter ON chapter_pit_reviews(chapter_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_chapter_pit_candidates_chapter ON chapter_pit_candidates(chapter_id, updated_at);
  `);

  ensureProjectColumns(context);
  ensureChapterColumns(context);
  ensureSuggestionColumns(context);
  ensurePitWorkflowSchema(context);
  ensureChapterRelationshipGraphSchema(context);
  ensureCharacterRelationshipSchema(context);
  ensureTimelineEventSchema(context);
  ensureTimelineLayerSchema(context);

  const row = context.queryOne<{ value: unknown }>("SELECT value FROM app_meta WHERE key = 'schema_version'");
  if (!row) {
    context.run("INSERT INTO app_meta (key, value) VALUES ('schema_version', ?)", [String(CURRENT_SCHEMA_VERSION)]);
    return;
  }

  const current = Number.parseInt(String(row.value), 10) || CURRENT_SCHEMA_VERSION;
  if (current < CURRENT_SCHEMA_VERSION) {
    context.run("UPDATE app_meta SET value = ? WHERE key = 'schema_version'", [String(CURRENT_SCHEMA_VERSION)]);
  }
}
