---
name: research-wiki
description: "학술 논문 LLM 위키 구축·유지·검증 메타 스킬. Karpathy의 3-tier(papers/sources/wiki) 패턴에 D16 anti-hallucination · OpenAlex Pattern B 검증 · 이중언어(EN+한국어) · YAML 기반 추적성을 더한 강화판. (1) '논문 위키 만들어줘', '학술 위키 구축', 'literature wiki', 'academic wiki' 요청 시. (2) '이 PDF들 위키에 추가해줘', '논문 등재' 요청 시. (3) '위키 메타데이터 검증', '제목 정본 대조', 'OpenAlex 검증' 요청 시. (4) '관련 논문 찾아줘'(위키 맥락에서, 전·후방 인용 추적). (5) 'PDF 부족한 거 OA로 찾아줘' 요청 시. 단, 일반 문헌 검색·논문 작성 자체는 thesis-advisor가 담당 — 본 스킬은 '논문을 어떻게 정리·검증·재활용하는가'에 한정."
---

# LLM Wiki — 학술 논문 3-tier 위키 구축·유지·검증

Karpathy의 [LLM Wiki 패턴](https://gist.github.com/karpathy/1dd0294ef9567971c1e4348a90d69285)을 박사연구 등 장기 학술 작업용으로 강화한 시스템. 자세한 컨벤션은 `references/`의 문서들 참조.

## 핵심 원칙 — D16 (anti-hallucination)

모든 메타데이터·인용은 **PDF 직접 추출 + OpenAlex/Crossref 1차 검증 (+ 한국어 자료는 KCI 5-way)**을 거친다. Claude의 사전 지식으로 메타데이터를 생성하지 않는다. 자세한 규칙은 `references/d16-anti-hallucination.md`.

## 3-tier 구조

```
papers/{stem}.pdf      ← 원본 (immutable)
   ↑
sources/{stem}.md      ← 7-섹션 상세 요약 + 한국어 요약
   ↑
wiki/{category}/{stem}.md  ← 핵심 정리 + 한국어 요약 + Related Papers
```

`{stem}` = `{first-author-lastname}-{year}-{first-5-title-words}` (lowercase, hyphenated). 자세한 명세: `references/3-tier-structure.md` · `references/yaml-conventions.md`.

---

## 워크플로우 — 사용 시나리오별

### 🆕 Scenario A: 신규 위키 부트스트랩 (Bootstrap)

사용자가 *"논문 위키 만들어줘 분야는 X"* / *"학술 위키 구축"* 등을 말하면:

1. **요건 수집** (간략 — 30초 이내):
   - 분야명 (예: "SDGs policy", "machine learning fairness")
   - 위키 위치 (target 폴더 — 사용자 결정. Google Drive 안 권장)
   - 카테고리 5~10개 (사용자 결정. 모르겠다면 분야 후 제안 → 확정)
   - 언어 정책: English primary + `## 한국어 요약` (기본값) / English only

2. **스켈레톤 생성**:
   - 폴더: `papers/` `sources/` `wiki/{각 카테고리}/` `wiki/overviews/` `wiki/concepts/` `wiki/other/` `_workspace/` `.claude/agents/`
   - 파일:
     - `CLAUDE.md` — `references/claude-md-template.md` 기반, 분야명·카테고리 표 채워서
     - `index.md` — 빈 카테고리 헤더만
     - `HOW-TO-USE.md` — `references/how-to-use-template.md` 그대로
     - `SETUP-NEW-PC.md` — `references/setup-new-pc-template.md` 그대로 (사용자가 git URL 채움)
     - `.gitignore` — `_workspace/.env` `_workspace/.openalex_cache/` `_workspace/.crossref_cache/` `.obsidian/workspace.json` 등
   - 스크립트 복사: `~/.claude/skills/research-wiki/scripts/*` → target `_workspace/`
   - 에이전트 복사: `~/.claude/skills/research-wiki/agents/wiki-verifier.md` → target `.claude/agents/`

3. **OpenAlex 설정 안내**:
   - 사용자에게 https://openalex.org/settings/api 에서 무료 키 발급 안내
   - `cp _workspace/.env.example _workspace/.env` + 키 입력
   - 검증: `node _workspace/openalex_helper.js diagnose` → `has_api_key: true`

4. **첫 PDF 1편으로 시범** (선택):
   - 사용자 PDF 1편으로 Scenario B를 즉시 실행해서 패턴 보여주기

### 📥 Scenario B: PDF 추가 (Add)

사용자가 *"이 PDF들 위키에 추가해줘"* / *"@papers/X.pdf 등재"* 등을 말하면:

1. **PDF 정제** (각 PDF별):
   - `pypdf`(또는 Read 도구)로 첫 15페이지 추출
   - **저자/연도/제목/DOI를 PDF 본문에서 직접 확인** (D16 — 사용자 파일명에 의존 X)
   - `{stem}` 결정: `{lastname}-{year}-{first-5-words}.pdf` (소문자, 하이픈, 특수문자 제거)
   - `papers/{stem}.pdf`로 복사·명명

2. **3-tier 작성**:
   - `sources/{stem}.md` — 7섹션 (One-line / Document Info / Key Contributions / Methodology / Results / Limitations / Related Work / Glossary) + `## 한국어 요약` (박사연구 위치 포함)
   - `wiki/{category}/{stem}.md` — Summary / Key Contributions / Methodology / Results / Related Papers (위키 내 `[[wikilinks]]`) + `## 한국어 요약`
   - YAML 필수 필드: `title authors year doi category paper ref_code pdf_path pdf_filename source_collection`. 명세: `references/yaml-conventions.md`

3. **OpenAlex 검증** (D16):
   - `node _workspace/openalex_helper.js doi <DOI>` 로 정본 확인
   - PDF 추출 메타와 OpenAlex 비교 → 불일치하면 ★ 표시·사용자에게 알림 (자동 수정 X)
   - 추출 가능한 추가 메타: `openalex_id` `cited_by_count` `last_oa_verified` (선택 YAML)

4. **index.md / MOC.md / overview 갱신**:
   - 카테고리 섹션에 한 줄 추가
   - MOC.md Dataview는 자동 갱신 (수정 불필요)
   - 통계 카운트 업데이트

### ✅ Scenario C: 검증 (Verify)

사용자가 *"위키 검증해줘"* / *"제목 정본 대조"* / *"메타데이터 drift 확인"* 등을 말하면:

| 명령 | 용도 |
|---|---|
| `node _workspace/enrich_wiki.js` | 전체 위키 OpenAlex 일괄 검증, drift·OA URL 보고 (SHA256 캐시) |
| `node _workspace/audit_titles.js` | 제목을 OpenAlex 정본과 strict 대조 (DOI 기반만 신뢰) |
| `node _workspace/crossref_helper.js crosscheck <DOI>` | OpenAlex × Crossref 자동 cross-check |
| `node _workspace/kci_helper.js doi <DOI>` | **한국어 자료** KCI 정본 확인 (로컬 PC 한정 — IP whitelist) |
| `node _workspace/kci_helper.js title "<제목>" [YYYY]` | KCI 제목 검색 (한글/영문) |
| `node _workspace/kci_helper.js crosscheck "<제목>" [YYYY]` | **자동 3-DB cross-check** — KCI + OpenAlex + Crossref 동시 호출 + comparison.discrepancies[] 자동 산출 |
| `node _workspace/graph_insights.js` | wikilink 그래프 사각지대 (orphan/bridge/component) |
| `wiki-verifier` 에이전트 호출 | **4-way (영어) / 5-way (한국어 = KCI 추가)** 검증. dual-write: `verification_log.md` (불변 이력) + `review_queue.md` (action 큐) |

★ **wiki 파일 자동 수정 금지** — 모든 정정은 사용자가 로그 검토 후 결정. 자세한 정책: `references/d16-anti-hallucination.md`.

### 🔍 Scenario D: 관련 논문 발견 (Discover)

사용자가 *"관련 논문 찾아줘"* / *"이 논문이 인용한 토대 논문"* / *"누가 이 논문을 발전시켰나"* 등을 말하면:

- **forward citation** (시드를 인용한 후속 논문) → `node _workspace/discover_related.js` — 보통 노이즈 많음 (특히 키워드 검색)
- **backward citation** (시드가 인용한 토대 논문) → `node _workspace/discover_backward.js` — ★ 신호 깨끗
- **OA PDF 자동 발견** → `node _workspace/find_missing_pdfs.js`
- 결과 → `_workspace/discovered_*.md` 보고서 → 사용자가 우선순위 선택 → Scenario B로 등재

### 📚 Scenario E: 우선 미입수 PDF 자동 다운로드

사용자가 *"OA PDF 자동으로 받아줘"* / *"이 미입수 목록 다운로드"* 등을 말하면:

1. `find_missing_pdfs.js` 또는 `discover_backward.js` 결과의 OA URL 목록을 받음
2. `Invoke-WebRequest` (PowerShell) 또는 `curl`로 일괄 다운로드
3. PDF magic byte 검증 (`%PDF-`) — HTML 셸 받았으면 자동 제거
4. 출판사별 차단 대응 (Springer/Wiley/Nature/MDPI/PMC 등 — 각자 대체 URL 패턴)
5. 다운로드 성공한 PDF → Scenario B로 등재

자세한 출판사별 우회 패턴: `references/oa-download-tricks.md`.

---

## Obsidian 통합

위키는 Obsidian Vault로 즉시 열림 — `[[wikilinks]]`, Dataview 쿼리, Canvas 시각화. 사용자 권장 플러그인:
- **Dataview** — MOC.md 자동 표 렌더링 (필수)
- Settings → Appearance → CSS snippets → 프로젝트별 `phd-wiki.css` 활성화 (선택)

자세한 사용법: `references/obsidian-integration.md`.

---

## Git 백업 권장

월 1회 정도 `git commit + push`. **반드시 private repo** (개인 학술 자료 — public 시 OA여도 일부 출판사 DMCA 위험 + 미발표 연구 노출). 자세한 가이드: `references/setup-new-pc-template.md` 안의 git 섹션.

---

## 다른 스킬과의 경계

- **thesis-advisor**: 논문 *작성*은 thesis-advisor — 본 스킬은 *읽기·정리·검증*만 담당
- **harness**: 새 에이전트 팀 구성 메타스킬 — 본 스킬은 위키 도메인 한정 결과물
- **budget-review / legislative-review**: 도메인 특화 분석 — 본 스킬은 도메인 무관 (어떤 학술 분야든 적용)

본 스킬은 **장기 학술 작업의 인프라**이며, 위 도메인 스킬들이 그 위에서 동작할 수 있다.

---

## references/ 안내

| 파일 | 내용 |
|---|---|
| `references/3-tier-structure.md` | papers/sources/wiki 3계층 명세 + 명명 규칙 |
| `references/yaml-conventions.md` | YAML frontmatter 필드 명세 (`paper`, `ref_code`, `openalex_id` 등) |
| `references/d16-anti-hallucination.md` | D16 검증 원칙 + 자동 수정 금지 룰 |
| `references/openalex-pattern-b.md` | OpenAlex Pattern B 검증 워크플로우 + 헬퍼 함수 사용법 |
| `references/bilingual-policy.md` | English + 한국어 요약 정책 (RAG-friendliness 유지) |
| `references/claude-md-template.md` | 신규 위키 부트스트랩 시 install할 CLAUDE.md 템플릿 |
| `references/how-to-use-template.md` | HOW-TO-USE.md 템플릿 (논문 읽기 루틴) |
| `references/setup-new-pc-template.md` | SETUP-NEW-PC.md 템플릿 (멀티 PC + Git 백업) |
| `references/oa-download-tricks.md` | 출판사별 OA PDF 다운로드 우회 패턴 |
| `references/obsidian-integration.md` | Dataview 쿼리·Canvas·CSS snippet 패턴 |

## scripts/ 안내

`scripts/`의 파일들은 신규 위키 부트스트랩 시 target `_workspace/`로 복사된다. 원본은 본 스킬에서 유지·업데이트하고, 각 위키는 부트스트랩 시점 스냅샷을 가진다.

## agents/ 안내

`agents/wiki-verifier.md`는 신규 위키 부트스트랩 시 target `.claude/agents/`로 복사된다. **4-way (영어) / 5-way (한국어)** 검증(wiki YAML ↔ OpenAlex ↔ Crossref ↔ KCI ↔ PDF) 에이전트. dual-write 정책 (log + queue).
