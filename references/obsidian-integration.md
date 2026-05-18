# Obsidian Integration — Dataview, Canvas, CSS

위키는 처음부터 Obsidian Vault로 설계됨 (`[[wikilinks]]`, plain markdown, frontmatter YAML).

## 필수 플러그인

| 플러그인 | 용도 | 필수도 |
|---|---|---|
| **Dataview** | MOC.md 자동 표 렌더링 | ★★★ 필수 |
| Templater | 새 wiki 파일 템플릿 자동 삽입 | 선택 |
| Excalidraw | 손글씨·다이어그램 | 선택 |

설치: Settings → Community Plugins → Browse → 검색 → Install + Enable.

## MOC.md — Dataview 대시보드 패턴

`MOC.md`(Map of Contents)는 Dataview 쿼리로 자동 갱신되는 대시보드. 신규 위키 시 install할 표준 쿼리:

### Paper 1 인용 후보 자동 추출

\`\`\`dataview
TABLE WITHOUT ID
  file.link AS "페이지",
  ref_code AS "코드",
  authors AS "저자",
  year AS "연도"
FROM "wiki"
WHERE contains(paper, 1) AND file.name != "MOC" AND category != "overviews"
SORT ref_code ASC, year ASC
\`\`\`

→ `paper: [1, ...]` 들어있는 모든 wiki 페이지 자동 추출. 새 논문 추가 시 자동 반영.

### ★★ 핵심 인용 자동 필터

\`\`\`dataview
TABLE WITHOUT ID
  file.link AS "페이지",
  ref_code AS "코드",
  authors + " (" + year + ")" AS "저자·연도"
FROM "wiki"
WHERE 
  contains(tags, "dissertation-core-model") 
  OR contains(tags, "single-gpu-training")
  OR contains(tags, "on-premise-final")
  OR contains(tags, "separate-paper-foundation")
SORT file.name ASC
\`\`\`

### 카테고리별 보유 현황

\`\`\`dataview
TABLE WITHOUT ID
  category AS "카테고리",
  length(rows) AS "편수",
  rows.file.link AS "페이지"
FROM "wiki"
WHERE category != null AND category != "overviews"
GROUP BY category
SORT length(rows) DESC
\`\`\`

### 연도별 분포

\`\`\`dataview
TABLE WITHOUT ID
  year AS "연도",
  length(rows) AS "편수",
  rows.file.link AS "논문"
FROM "wiki"
WHERE year != null AND category != "overviews"
GROUP BY year
SORT year DESC
\`\`\`

### OpenAlex 인용 수 상위 10편 (선택)

\`\`\`dataview
TABLE WITHOUT ID
  file.link AS "논문",
  cited_by_count AS "인용 수",
  year AS "연도"
FROM "wiki"
WHERE cited_by_count != null
SORT cited_by_count DESC
LIMIT 10
\`\`\`

### 검증 90일 초과 항목 (재검증 대상)

\`\`\`dataview
TABLE WITHOUT ID
  file.link AS "페이지",
  last_oa_verified AS "마지막 검증",
  (date(today) - date(last_oa_verified)).days AS "경과일"
FROM "wiki"
WHERE last_oa_verified != null
  AND (date(today) - date(last_oa_verified)).days > 90
SORT (date(today) - date(last_oa_verified)).days DESC
\`\`\`

## Canvas 다이어그램

`.canvas` 파일은 Obsidian의 자유형 시각 캔버스. 박사연구 시리즈 hub canvas 예:

```
프로젝트 메인 RQ (텍스트 노드, 색상=녹색)
    ↓
Paper 1 허브 — Paper 2 허브 — Paper 3 허브 — 별도논문 (텍스트 노드, 색상=보라)
    ↓                              ↓                              ↓
관련 wiki 페이지 (파일 임베드 노드, 색상별 중요도 — 빨강=핵심, 주황=중요, 보라=일반)
```

`.canvas` 파일 구조 (JSON):
\`\`\`json
{
  "nodes": [
    {"id": "rq", "type": "text", "x": 0, "y": -700, "width": 800, "height": 200, "color": "4", "text": "..."},
    {"id": "p1-paper", "type": "file", "x": -2560, "y": 0, "width": 380, "height": 90, "color": "6", "file": "wiki/X/Y.md"}
  ],
  "edges": [
    {"id": "...", "fromNode": "rq", "fromSide": "bottom", "toNode": "p1-paper", "toSide": "top", "label": "..."}
  ]
}
\`\`\`

Obsidian Canvas 색상 코드: `1` 빨강, `2` 주황, `3` 노랑, `4` 녹색, `5` 보라(라일락), `6` 연보라.

## CSS Snippet — `phd-wiki.css`

`.obsidian/snippets/phd-wiki.css`에 저장 후 Settings → Appearance → CSS snippets → 활성화.

### 태그별 색상 코딩 (paper별 시각 구분)

\`\`\`css
/* Paper 1 태그 — 파랑 */
a.tag[href*="paper1-"] {
  background-color: rgba(25, 118, 210, 0.15);
  color: #1565c0;
  border: 1px solid rgba(25, 118, 210, 0.4);
  border-radius: 4px;
  padding: 1px 6px;
  font-weight: 500;
}

/* Paper 2 — 초록 / Paper 3 — 보라 / Separate paper — 빨강 (굵게) */
a.tag[href*="paper2-"] { background: rgba(56,142,60,0.15); color: #2e7d32; border: 1px solid rgba(56,142,60,0.4); border-radius: 4px; padding: 1px 6px; }
a.tag[href*="paper3-"] { background: rgba(123,31,162,0.15); color: #6a1b9a; border: 1px solid rgba(123,31,162,0.4); border-radius: 4px; padding: 1px 6px; }
a.tag[href*="separate-paper"] { background: rgba(211,47,47,0.15); color: #c62828; border: 1px solid rgba(211,47,47,0.5); border-radius: 4px; padding: 1px 6px; font-weight: 700; }
a.tag[href*="background"] { opacity: 0.65; font-style: italic; }
\`\`\`

### ★★ 핵심 태그 강조

\`\`\`css
a.tag[href*="dissertation-core-model"],
a.tag[href*="single-gpu-training"],
a.tag[href*="on-premise-final"],
a.tag[href*="separate-paper-foundation"],
a.tag[href*="red-tag-theory"] {
  background-color: rgba(211,47,47,0.25) !important;
  color: #b71c1c !important;
  border: 1.5px solid #b71c1c !important;
  font-weight: 800 !important;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 0.85em;
}
\`\`\`

### YAML frontmatter 강조

\`\`\`css
.metadata-property[data-property-key="paper"] .metadata-property-value,
.metadata-property[data-property-key="ref_code"] .metadata-property-value {
  font-weight: 700;
  color: var(--text-accent);
}
.metadata-property[data-property-key="category"] .metadata-property-value {
  font-family: var(--font-monospace);
  background-color: var(--background-secondary);
  border-radius: 3px;
  padding: 1px 6px;
}
\`\`\`

### 한국어 요약 섹션 강조

\`\`\`css
.markdown-rendered > h2:last-of-type {
  background: linear-gradient(90deg, rgba(255,167,38,0.12) 0%, rgba(255,167,38,0.04) 50%, transparent 100%);
  padding: 10px 14px;
  border-left: 4px solid #ffa726;
  border-radius: 4px;
  margin-top: 2em;
}
\`\`\`

### 진입점 wikilink 강조

\`\`\`css
a.internal-link[data-href*="dissertation-series-v5-overview"],
a.internal-link[data-href="MOC"],
a.internal-link[data-href="HOW-TO-USE"] {
  color: #d84315 !important;
  font-weight: 700;
  text-decoration: underline wavy 1px;
}
\`\`\`

## 그래프 뷰 (Graph View)

Settings → Graph view → Groups에 카테고리별 색상 등록:
- `category: sdg-classification-nlp` → blue
- `category: sdg-localization` → green
- `category: panel-causal-methods` → red
- `category: budget-tagging` → orange
- ... 등

→ `Ctrl+G`로 열면 카테고리별 색상 구분된 인용 네트워크 시각화.

## 즐겨찾기 (Bookmarks)

`.obsidian/bookmarks.json` — 자주 가는 진입점 등록. 권장:
- `index.md` `MOC.md` `HOW-TO-USE.md` `SETUP-NEW-PC.md` `CLAUDE.md`

PC 간 공유 OK (workspace.json과 달리 bookmarks는 의미 있음).

## 검색 단축키

- `Ctrl+O` — 빠른 파일 점프
- `Ctrl+Shift+F` — 전체 검색 (한국어 요약 + 영문 본문)
- `Ctrl+P` — 명령 팔레트
- `Ctrl+G` — 그래프 뷰
- `[[` — 위키링크 자동완성
- `Ctrl+Click` (wikilink) — 새 패널에서 열기
