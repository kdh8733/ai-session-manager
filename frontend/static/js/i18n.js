/**
 * i18n.js — Internationalization
 * Currently supports: ko (Korean), en (English)
 */

const I18n = (() => {
  const _strings = {
    ko: {
      newSession:   '새 세션',
      projects:     '프로젝트',
      history:      '히스토리',
      favorites:    '즐겨찾기',
      bookmarks:    '북마크',
      cost:         '비용',
      settings:     '설정',
      loading:      '불러오는 중...',
      connected:    '연결됨',
      disconnected: '연결 끊김',
      noSessions:   '세션이 없습니다',
      save:         '저장',
      saved:        '저장됨 ✓',
      cancel:       '취소',
      create:       '만들기',
      delete:       '삭제',
      search:       '검색...',
    },
    en: {
      newSession:   'New Session',
      projects:     'Projects',
      history:      'History',
      favorites:    'Favorites',
      bookmarks:    'Bookmarks',
      cost:         'Cost',
      settings:     'Settings',
      loading:      'Loading...',
      connected:    'Connected',
      disconnected: 'Disconnected',
      noSessions:   'No sessions',
      save:         'Save',
      saved:        'Saved ✓',
      cancel:       'Cancel',
      create:       'Create',
      delete:       'Delete',
      search:       'Search...',
    },
  };

  let _lang = navigator.language.startsWith('ko') ? 'ko' : 'en';

  function t(key) {
    return _strings[_lang]?.[key] ?? _strings.en[key] ?? key;
  }

  function setLang(lang) {
    if (_strings[lang]) _lang = lang;
  }

  function getLang() { return _lang; }

  return { t, setLang, getLang };
})();
