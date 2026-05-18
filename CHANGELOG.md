# Changelog

본 스킬의 변경 이력. [Keep a Changelog](https://keepachangelog.com/) 형식, [Semantic Versioning](https://semver.org/) 준수.

## [Unreleased]

(다음 릴리스 변경 사항이 여기에 누적됨)

## [0.1.0] — 2026-05-18

첫 공개 릴리스. SDGs 박사연구 위키(46 wiki pages, 41 PDFs)에서 검증된 인프라를 다른 사람도 쓸 수 있게 패키징.

### Added — 핵심 인프라
- **`skill.md`** — 5가지 시나리오 오케스트레이터 (Bootstrap · Add · Verify · Discover · Download)
- **3-tier 구조** — `papers/{stem}.pdf` → `sources/{stem}.md` → `wiki/{category}/{stem}.md`
- **D16 anti-hallucination 원칙** — PDF 직접 추출 + 정본 DB 검증 + 자동 수정 금지
- **이중언어 정책** — English primary + `## 한국어 요약` (RAG-friendly + 한국 연구자 친화)
- **YAML `paper:` 필드** — 학위논문/학술지투고/배경 프로젝트 매핑

### Added — 검증 도구 (`scripts/`)
- `openalex_helper.js` — OpenAlex API 래퍼 (verifyByDOI · verifyByTitle · citedBy)
- `crossref_helper.js` — Crossref REST API 래퍼 (독립 두 번째 ground truth)
- `enrich_wiki.js` — 전체 위키 일괄 검증 · drift 감지 · OA PDF URL 발견
- `audit_titles.js` — 제목 OpenAlex 정본 strict 대조
- `find_missing_pdfs.js` — 우선 미입수 PDF의 OA URL 탐색
- `discover_backward.js` — 시드 논문의 referenced_works 추적 (토대 논문 발견)
- `discover_related.js` — forward citation 추적
- `reverify_shortlist.js` — 특정 stem 목록만 재검증

### Added — 검증 에이전트
- `agents/wiki-verifier.md` — 4-way 검증 (wiki YAML ↔ OpenAlex ↔ Crossref ↔ PDF 1쪽)
- WebSearch/WebFetch 명시적 제외 (Rule #1 보호)

### Added — 부트스트랩 템플릿 (`references/`)
- `claude-md-template.md` · `how-to-use-template.md` · `setup-new-pc-template.md`
- `3-tier-structure.md` · `yaml-conventions.md` · `d16-anti-hallucination.md`
- `openalex-pattern-b.md` · `bilingual-policy.md`
- `oa-download-tricks.md` (출판사별 OA PDF 우회 패턴)
- `obsidian-integration.md` (Dataview · Canvas · CSS snippet)

### Added — nashsu/llm_wiki 발상 흡수 (D16 위배 없이)
- **`graph_insights.js`** — wikilink 그래프 분석
  - orphan(degree 0) · dangling · ambiguous · bridge(Tarjan) · component(BFS)
  - **2-pass 분석**: 메인(전체) + 보조(overview 제외) — overview 의존도 진단
  - regex 정제: 코드 블록 · 인라인 코드 · HTML 주석 · 이미지 임베드 제외 + 깨진 fence 경고
  - LLM synthesis 없음, 사용자가 직접 [[link]] 추가/PDF 보강
- **wiki-verifier dual-write 정책**
  - `verification_log.md` 불변 이력 (append-only)
  - `review_queue.md` action 대기 큐 (DRIFT·★주의만 체크박스)
- **`enrich_wiki.js` SHA256 캐시**
  - 검증 관련 필드(title/authors/year/doi/pdf_filename)만 해시
  - TTL 30일 + hash 일치 → API 호출 skip
  - `--force` 플래그로 무효화

### Documentation
- `README.md` — nashsu/llm_wiki와의 차이 비교 표 포함
- `LICENSE` — MIT

### 알려진 한계
- KCI(한국 학술지)는 직접 검증 미지원 — 사용자 IP whitelist 필요한 KCI API는 로컬 전용
- 스킬 갱신 시 기존 위키의 `_workspace/` 동기화는 수동 복사 (`Copy-Item ... -Force`)

[Unreleased]: https://github.com/manturster-art/research-wiki/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/manturster-art/research-wiki/releases/tag/v0.1.0
