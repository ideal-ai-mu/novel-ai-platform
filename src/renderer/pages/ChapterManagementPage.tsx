import type { ReactNode } from 'react';
import type { Chapter, Character, LoreEntry, NovelProject } from '../../shared/ipc';
import type { ChapterCollectionTab, ChaptersMenu } from '../types';

export type ChapterManagementPageProps = {
  activeProject: NovelProject;
  chapterCollectionTab: ChapterCollectionTab;
  chaptersMenu: ChaptersMenu;
  selectedChapterId: string | null;
  chapterSearch: string;
  filteredChapters: Chapter[];
  filteredDeletedChapters: Chapter[];
  renderChaptersMenu: (menu: Exclude<ChaptersMenu, null>) => ReactNode;
  formatTime: (value: string) => string;
  formatChapterTitle: (chapter: Chapter) => string;
  formatDeletedChapterTitle: (chapter: Chapter) => string;
  characters: Character[];
  loreEntries: LoreEntry[];
  onBackHome: () => void;
  onSelectManageTab: () => void;
  onSelectRecycleTab: () => void;
  onOpenChaptersMenu: (menu: Exclude<ChaptersMenu, null>) => void;
  onScheduleChaptersMenuClose: () => void;
  onCreateChapter: () => void;
  onSearchChange: (value: string) => void;
  onOpenReader: (chapterId: string) => void;
  onOpenWriter: (chapterId: string) => void;
  onDeleteChapter: (chapterId: string, title: string) => void;
  onRestoreChapter: (chapterId: string, title: string) => void;
  onDeleteChapterPermanent: (chapterId: string, title: string) => void;
  onOpenCodex: () => void;
};

export function ChapterManagementPage({
  activeProject,
  chapterCollectionTab,
  filteredChapters,
  filteredDeletedChapters,
  characters,
  loreEntries,
  formatTime,
  formatChapterTitle,
  formatDeletedChapterTitle,
  onBackHome,
  onSelectManageTab,
  onSelectRecycleTab,
  onCreateChapter,
  onOpenWriter,
  onDeleteChapter,
  onRestoreChapter,
  onDeleteChapterPermanent,
  onOpenCodex
}: ChapterManagementPageProps): JSX.Element {
  const totalWords = filteredChapters.reduce((sum, ch) => sum + ch.word_count, 0);

  return (
    <section className="ws-page">
      {/* Left Sidebar */}
      <aside className="ws-sidebar">
        <div className="ws-sidebar-head">
          <button type="button" className="ws-back-btn" onClick={onBackHome} title="返回作品列表">
            ←
          </button>
          <div className="ws-sidebar-info">
            <div className="ws-sidebar-title">{activeProject.title}</div>
            <div className="ws-sidebar-stats">
              {filteredChapters.length} 章 · {totalWords} 字
            </div>
          </div>
        </div>

        <button type="button" className="ws-new-chapter-btn" onClick={onCreateChapter}>
          + 新章节
        </button>

        <nav className="ws-sidebar-list">
          {filteredChapters.map((chapter, idx) => (
            <button
              key={chapter.id}
              type="button"
              className="ws-sidebar-item"
              onClick={() => onOpenWriter(chapter.id)}
            >
              <span className="ws-sidebar-item-num">{idx + 1}</span>
              <span className="ws-sidebar-item-title">{chapter.title || `第${idx + 1}章`}</span>
              <span className="ws-sidebar-item-words">{chapter.word_count}</span>
            </button>
          ))}
        </nav>

        <div className="ws-sidebar-bottom">
          <div className="ws-sidebar-section-label">人物 · {characters.length}</div>
          <div className="ws-sidebar-tags">
            {characters.slice(0, 8).map((c) => (
              <span key={c.id} className="ws-sidebar-tag person" title={c.role_type}>
                {c.name}
              </span>
            ))}
            {characters.length > 8 && <span className="ws-sidebar-tag more">+{characters.length - 8}</span>}
          </div>

          <div className="ws-sidebar-section-label">设定 · {loreEntries.length}</div>
          <div className="ws-sidebar-tags">
            {loreEntries.slice(0, 8).map((l) => (
              <span key={l.id} className="ws-sidebar-tag lore" title={l.type}>
                {l.title}
              </span>
            ))}
            {loreEntries.length > 8 && <span className="ws-sidebar-tag more">+{loreEntries.length - 8}</span>}
          </div>

          <button type="button" className="ws-sidebar-link" onClick={onOpenCodex}>
            管理百科 →
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="ws-main">
        <header className="ws-main-header">
          <div className="ws-tabs">
            <button
              type="button"
              className={`ws-tab ${chapterCollectionTab === 'manage' ? 'active' : ''}`}
              onClick={onSelectManageTab}
            >
              章节
            </button>
            <button
              type="button"
              className={`ws-tab ${chapterCollectionTab === 'recycle' ? 'active' : ''}`}
              onClick={onSelectRecycleTab}
            >
              回收站
            </button>
          </div>
          <button type="button" className="ws-add-btn" onClick={onCreateChapter}>
            + 新建章节
          </button>
        </header>

        <div className="ws-content">
          {chapterCollectionTab === 'manage' ? (
            filteredChapters.length === 0 ? (
              <div className="ws-empty">
                <div className="ws-empty-icon">📝</div>
                <p>还没有章节</p>
                <span>点击「新章节」开始创作</span>
              </div>
            ) : (
              <div className="ws-cards">
                {filteredChapters.map((chapter, idx) => (
                  <div
                    key={chapter.id}
                    className="ws-card"
                    onClick={() => onOpenWriter(chapter.id)}
                  >
                    <div className="ws-card-head">
                      <div className="ws-card-num">{idx + 1}</div>
                      <div className="ws-card-info">
                        <div className="ws-card-title">{chapter.title || `第${idx + 1}章`}</div>
                        <div className="ws-card-meta">
                          <span>{chapter.word_count} 字</span>
                          <span className="ws-card-dot">·</span>
                          <span>{formatTime(chapter.updated_at)}</span>
                          <span className="ws-card-dot">·</span>
                          <span className={`ws-card-status ${chapter.status}`}>
                            {chapter.status === 'draft' ? '草稿' : chapter.status === 'review' ? '审阅中' : '已定稿'}
                          </span>
                        </div>
                      </div>
                      <div className="ws-card-actions">
                        <button
                          type="button"
                          className="ws-card-btn"
                          title="删除"
                          onClick={(e) => { e.stopPropagation(); onDeleteChapter(chapter.id, chapter.title); }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    {chapter.content && (
                      <div className="ws-card-body">
                        {chapter.content.slice(0, 200)}{chapter.content.length > 200 ? '…' : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : filteredDeletedChapters.length === 0 ? (
            <div className="ws-empty">
              <div className="ws-empty-icon">🗑</div>
              <p>回收站为空</p>
            </div>
          ) : (
            <div className="ws-cards">
              {filteredDeletedChapters.map((chapter) => (
                <div key={chapter.id} className="ws-card deleted">
                  <div className="ws-card-head">
                    <div className="ws-card-info">
                      <div className="ws-card-title">{formatDeletedChapterTitle(chapter)}</div>
                      <div className="ws-card-meta">
                        <span>{chapter.word_count} 字</span>
                        <span className="ws-card-dot">·</span>
                        <span>删除于 {formatTime(chapter.deleted_at ?? chapter.updated_at)}</span>
                      </div>
                    </div>
                    <div className="ws-card-actions">
                      <button
                        type="button"
                        className="ws-card-btn restore"
                        onClick={() => onRestoreChapter(chapter.id, chapter.title)}
                      >
                        恢复
                      </button>
                      <button
                        type="button"
                        className="ws-card-btn"
                        onClick={() => onDeleteChapterPermanent(chapter.id, chapter.title)}
                      >
                        永久删除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
