1. 세션 관리

  - tmux 세션 생성: cm-{project}-{index} 형식 네이밍
  - 세션 이름 지정: claude -n {name} 옵션으로 display name 설정, tmux user option @display_name에 저장
  - 권한 건너뛰기: --dangerously-skip-permissions 플래그 옵션 (세션 생성 시)
  - JSONL 바인딩: 세션 생성 후 30초 폴링하며 ~/.claude/projects/ JSONL 파일과 UUID로 연결, tmux @jsonl_id에 저장
  - 세션 재개: 중단된 세션 claude --continue 실행
  - Claude 재시작: tmux 내 동결된 Claude 프로세스 kill 후 재시작
  - 세션 타입: tmux 기반(터미널) / stream 기반(직접 spawn) 두 가지

  2. 터미널 (tmux 세션)

  - xterm.js 5.5 기반 웹 터미널
  - WebSocket I/O: 브라우저 :양방향_화살표: PTY master fd :양방향_화살표: tmux attach
  - Single-writer 정책: 새 클라이언트 연결 시 기존 연결 해제
  - 터미널 resize: TIOCSWINSZ + SIGWINCH + tmux resize-window
  - 인터널 검색바: 터미널 내 텍스트 검색 (xterm.js SearchAddon)
  - 우클릭 컨텍스트 메뉴:
    - Open Permissions → /permissions 명령 전송
    - Paste → 클립보드 붙여넣기
  - scrollback 검색: tmux capture-pane 활용

  3. Stream 세션

  - tmux 없이 claude CLI를 직접 spawn
  - WebSocket으로 stdout 스트리밍
  - 히스토리 세션 재개 지원 (--continue {session_id})

  4. 히스토리 뷰어

  - ~/.claude/projects/{encoded_path}/*.jsonl 직접 파싱
  - 대화 turns 렌더링: user/assistant 역할, 마크다운, 코드 하이라이팅
  - 토큰 정보: 입력/출력/캐시 토큰 수 표시
  - tool_calls 표시: 도구 호출 요약 (Edit, Write, Bash 등)
  - thinking 블록: 사고 과정 표시 (토글)
  - 히스토리 검색: 전체 프로젝트 across 텍스트 검색
  - 히스토리 숨기기: 개별 세션 숨김 처리
  - 세션 제목: JSONL custom-title 엔트리에서 파싱, AI 자동 생성 fallback

5. 프로젝트 관리

  - 자동 발견: ~/.claude/projects/ JSONL의 cwd 필드로 프로젝트 경로 복원
  - scope 필터링: 설정된 project_dirs 범위 내 프로젝트만 표시
  - 플러그인 경로 제외: ~/.claude/plugins/ 자동 제외
  - Git 정보: 브랜치명, dirty 상태 표시 (30초 TTL 캐시)
  - 프로젝트 숨김: 개별 프로젝트 숨김/표시 토글
  - 프로젝트 순서: drag-and-drop으로 순서 조정, 서버에 저장
  - JSONL 경로 인코딩: /, ., _ → - 변환 (Claude CLI 호환)

  6. 비용 분석 대시보드

  - 증분 스캔: 파일 크기/mtime/위치 캐시로 중복 파싱 방지
  - 집계: (날짜, 프로젝트, 모델) 단위 pre-aggregation
  - 비용 계산:
    - Opus: input $15/M, output $75/M
    - Sonnet: input $3/M, output $15/M
    - Haiku: input $0.8/M, output $4/M
    - 캐시 생성: 125%, 캐시 읽기: 10%
  - 오늘/7일/30일 개요 카드
  - 일별 bar chart (Chart.js)
  - 프로젝트별/모델별 비용 분류
  - 세션별 비용 gauge bar 표시
  - 원화 변환 표시 지원

  7. 즐겨찾기

  - 히스토리 세션을 즐겨찾기로 등록
  - 즐겨찾기 세션별 노트(메모) 추가/삭제 (스레드형)
  - 제목/프로젝트/노트 텍스트 검색
  - 저장 위치: ~/.config/claude-manager/favorites.json

  8. 북마크

  - 히스토리 대화의 특정 turn을 북마크
  - 태그 부착, 댓글 스레드 (다중 댓글 지원)
  - snippet/태그/댓글 통합 검색
  - 저장 위치: ~/.config/claude-manager/bookmarks.json

  9. 알림 시스템 (SSE)

  - Claude CLI hook 스크립트 (cm-notify.sh)가 작업 완료 시 POST /api/notify 호출
  - SSE로 브라우저에 broadcast
  - 세션 배지(badge)로 알림 상태 표시: idle/running/waiting/completed
  - 서버사이드 세션 상태: session_state.py에서 canonical 상태 관리

10. 라이브 인사이트

  - 활성 세션의 JSONL 실시간 파싱
  - 표시 항목: turn 수, 입력/출력/캐시 토큰, 예상 비용, 사용 모델, 수정된 파일 목록, 최근 tool 호출

  11. 설정

  - 초기 onboarding: 미설정 상태 감지 → 셋업 화면
  - 설정 항목: project_dirs (다중), claude_bin 경로, claude_dir 경로
  - 저장 위치: ~/.config/claude-manager/config.json
  - 환경변수: CM_HOST, CM_PORT, CM_PROJECT_DIRS, CM_CLAUDE_BIN, CM_CLAUDE_DIR
  - 커스텀 폰트 업로드: ttf/woff 파일 업로드, /fonts/ 서빙

  12. 세션 제목 자동 생성

  - Claude API로 세션 첫 번째 prompt 기반 제목 생성
  - 캐시: ~/.config/claude-manager/titles.json
  - 우선순위: @display_name > JSONL custom-title > AI 생성 > first_prompt

  13. Command Palette

  - Ctrl+K 또는 클릭으로 열기
  - 프로젝트/세션 전체 검색 및 빠른 이동

  14. i18n

  - 다국어 지원 구조 (i18n.js)

  ---
  UI 레이아웃

  ┌─────────────────────────────────────────────────┐
  │  [Sidebar]          │  [Main Panel]             │
  │                     │                           │
  │  Projects list      │  Terminal OR              │
  │  ├─ Project A       │  History Viewer OR        │
  │  │  ├─ Session 1   │  Cost Dashboard           │
  │  │  └─ Session 2   │                           │
  │  └─ Project B       │  [Status bar: git/model]  │
  │                     │                           │
  │  [Favorites]        │                           │
  │  [Bookmarks]        │                           │
  │  [Cost Dashboard]   │                           │
  └─────────────────────────────────────────────────┘

주요 UI 컴포넌트
  - 좌측 사이드바: 프로젝트 트리, 세션 목록, 히스토리 브라우저
  - 상단 탭: 멀티 세션 탭 (split pane 지원)
  - 터미널 영역: xterm.js 풀스크린, 검색바 포함
  - 히스토리 뷰어: 마크다운 렌더링, 토큰 통계, 북마크 버튼
  - 설정 모달: 프로젝트 디렉토리 리스트 (5개 이상 표시), claude bin 경로 설정
  - Welcome 화면: 최근 세션 제안 카드

  ---
  파일 저장 위치 정리

  ┌─────────────────┬───────────────────────────────────────────────┐
  │      파일       │                     경로                      │
  ├─────────────────┼───────────────────────────────────────────────┤
  │ 설정            │ ~/.config/claude-manager/config.json          │
  ├─────────────────┼───────────────────────────────────────────────┤
  │ 제목 캐시       │ ~/.config/claude-manager/titles.json          │
  ├─────────────────┼───────────────────────────────────────────────┤
  │ 즐겨찾기        │ ~/.config/claude-manager/favorites.json       │
  ├─────────────────┼───────────────────────────────────────────────┤
  │ 북마크          │ ~/.config/claude-manager/bookmarks.json       │
  ├─────────────────┼───────────────────────────────────────────────┤
  │ 숨긴 프로젝트   │ ~/.config/claude-manager/hidden_projects.json │
  ├─────────────────┼───────────────────────────────────────────────┤
  │ 프로젝트 순서   │ ~/.config/claude-manager/project_order.json   │
  ├─────────────────┼───────────────────────────────────────────────┤
  │ 커스텀 폰트     │ ~/.config/claude-manager/fonts/               │
  ├─────────────────┼───────────────────────────────────────────────┤
  │ Claude 히스토리 │ ~/.claude/projects/{encoded_path}/*.jsonl     │
  └─────────────────┴───────────────────────────────────────────────┘

  ---
  구현 시 주의사항 (트리키한 부분)

  1. JSONL 파싱: json.loads(line, strict=False) 필수 (thinking 블록에 제어문자 포함), f.readline() 루프 사용 (for line in f: 금지 — f.tell()과 충돌)
  2. 경로 인코딩: /, ., _ 모두 -로 치환 (Claude CLI 호환). 디코딩은 손실이므로 JSONL의 cwd 필드를 읽어서 실제 경로 복원
  3. tmux 세션명: . → _ 정규화 필요 (tmux가 .를 특수처리)
  4. 비용 캐시: 파일 크기 + mtime + 읽기 위치(seek pos)로 증분 스캔
  5. orphan attach 정리: 서버 재시작 시 tmux attach-session 고아 프로세스 자동 정리
  6. 권한 문제: 기존 세션에서는 /permissions 명령으로 Allow 선택, 신규 세션은 --dangerously-skip-permissions 플래그 사용
