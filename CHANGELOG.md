# Changelog

본 스킬의 변경 이력. [Keep a Changelog](https://keepachangelog.com/) 형식, [Semantic Versioning](https://semver.org/) 준수.

## [Unreleased]

### Added — KCI 캐시-공유 패턴 (옵션 A, 클라우드 환경 우회)

KCI Open API의 **IP whitelist 제약**(등록한 로컬 PC에서만 동작)을 클라우드 환경에서도 우회 가능한 패턴.

- `scripts/kci_helper.js`에 **OFFLINE 모드** 추가
  - `KCI_API_KEY` 미설정 → 자동 OFFLINE (캐시 hit만 응답)
  - `KCI_OFFLINE=true` 강제 가능
  - 캐시 miss는 `KCI_OFFLINE_MISS` 에러 + 명확한 안내 메시지 (API 키 마스킹)
  - `diagnose()`에 mode 표시 ("ONLINE" / "OFFLINE (cache-only)")
- `references/kci-cache-share-pattern.md` — 운영 가이드 (Task Scheduler 스크립트 포함)

**동작 패턴**:
```
사용자 PC (등록 IP)            GitHub repo            클라우드 환경
─────────────────              ──────────              ──────────────
주1회 cron:                                             KCI_API_KEY 없음 → OFFLINE 자동
  KCI API 호출 + 캐시  ──push──►  .kci_cache/  ──pull──►  캐시 hit만 응답
                                  (gitignored 제외,                   ↓
                                   commit 대상)         캐시 miss는 명확한 에러
```

**적용 방법** (위키 부트스트랩 시):
- `.gitignore`에서 `_workspace/.kci_cache/` 항목 **주석 처리** (commit 대상으로 전환)
- `_workspace/.env`의 `KCI_API_KEY`는 그대로 gitignore 유지 (절대 commit 금지)



## [0.2.0] — 2026-05-19

**KCI Open API 통합** — 한국어 자료(KCI 등재지) 검증 가능. wiki-verifier가 4-way → 5-way (한국어 한정)로 격상.

### Added — KCI helper
- **`scripts/kci_helper.js`** — KCI Open API 래퍼 (XML/UTF-8, 5 endpoints)
  - `verifyByTitle(title, year?)` — articleSearch
  - `verifyByDOI(doi)` — articleSearch with doi param
  - `verifyByControlNumber(id)` — articleDetail (ART...)
  - `searchByAuthor(name, year?)` — author 검색 (한글명 지원)
  - `diagnose()` — 환경 점검 + IP whitelist 경고
- 응답 XML 정규식 파서 (npm 의존성 0), CDATA 처리
- 30일 TTL 캐시 (`.kci_cache/`)
- 핵심 추출 필드: kci_article_id, title_ko, title_en, authors[name/name_eng/institution/orcid], journal, volume, issue, doi, kci/wos cited_by, keywords, abstract_ko

### Changed — wiki-verifier 5-way 매트릭스
- `agents/wiki-verifier.md`
  - description: 4-way → "4-way (영어) / 5-way (한국어)"
  - 검증 매트릭스 표에 KCI 행 추가
  - "언제 KCI를 호출" 가이드 (한글 카테고리·저자명·DOI prefix 패턴)
  - 판정 규칙: 한국어 자료 KCI 단독 매치 + wiki 일치 = PASS (한국 자료 정상 패턴)
  - KCI 호출 실패 시 영어 4-way 격하 진행
  - 캐시 TTL 메모에 `.kci_cache/` 추가

### Changed — skill.md
- D16 원칙 한 줄: "OpenAlex/Crossref 1차 검증" → "+ 한국어 자료는 KCI 5-way"
- Scenario C 검증 명령표에 KCI/Crossref crosscheck/graph_insights 추가
- agents/ 안내: 4-way → 4-way (영어) / 5-way (한국어) + dual-write 명시

### Changed — scripts/.env.example
- `KCI_API_KEY=` placeholder 추가 (IP whitelist 안내 포함)

### Added — 자동 3-DB cross-check (한 명령으로 KCI × OpenAlex × Crossref 동시 호출)
- `node _workspace/kci_helper.js crosscheck "<제목>" [YYYY]`
- 출력 구조:
  - `kci` — KCI 검색 결과 (best + candidates + 한국어 abstract)
  - `openalex` — OpenAlex 결과
  - `crossref` — Crossref 결과
  - `comparison.{kci_exists, openalex_exists, crossref_exists, all_match, discrepancies[]}`
  - `discrepancies[]`는 field별로 (title / first_author / year) 차이 자동 산출
- 5-way 검증 시 사용자/에이전트가 OA·Crossref·KCI 응답 셋을 수동 비교할 필요 없음

### Known limitations
- KCI는 **IP whitelist 방식** — 사용자 로컬 PC에서만 동작. 원격 환경(CI·remote IDE)에서는 403/timeout → 영어 4-way로 격하

### First adopter validation
SDGs 박사연구 위키에서 한국어 자료 9편 일괄 검증 통과 (PASS 5 / KCI 미수록 4 — grey literature 정상). 정정 필요 항목 0건.

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

[Unreleased]: https://github.com/manturster-art/research-wiki/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/manturster-art/research-wiki/releases/tag/v0.2.0
[0.1.0]: https://github.com/manturster-art/research-wiki/releases/tag/v0.1.0
