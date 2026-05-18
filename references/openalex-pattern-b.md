# OpenAlex Pattern B — 검증 워크플로우

## Pattern B의 정체

OpenAlex (https://openalex.org) — 학술 메타데이터 오픈 DB (2.5억+ Works). "Pattern B"는 사용자가 별도 SDGs 박사연구 프로젝트에서 2026-05-10 도입한 검증 패턴 명칭. 핵심:

1. **메타데이터 검증·PDF 발견 전용** — 답변 콘텐츠를 채우는 데 쓰지 않음 (Rule #1 "No web search" 위반 X)
2. **DOI 기반이 가장 신뢰** — title-search는 발견용
3. **30일 캐시** — 같은 DOI 재호출 시 API 안 쓰고 캐시
4. **무료 API 키** 사용 시 일 1,000건, 미사용 시 일 ~6건 (제약 큼)

## 설치 (한 번)

1. 무료 키 발급: https://openalex.org/settings/api (이메일만, 30초)
2. `cp _workspace/.env.example _workspace/.env`
3. `.env` 편집:
   ```
   OPENALEX_KEY=<여기에 키>
   OPENALEX_MAILTO=your@email.com
   ```
4. 검증: `node _workspace/openalex_helper.js diagnose` → `has_api_key: true`

## 핵심 함수 (`openalex_helper.js`)

| 함수 | 입력 | 출력 |
|---|---|---|
| `verifyByDOI(doi)` | "10.1017/dap.2023.28" | `{exists, id, title, authors, year, doi, cited_by_count, source, is_oa, oa_url}` |
| `verifyByTitle(title, year)` | "Difference-in-Differences..." | `{exists, confidence, best, candidates}` (★ confidence < 0.6 가짜 양성) |
| `verifyByArxiv(arxivId)` | "2305.14314" | DOI/title과 동일 형식 |
| `getWork(workId)` | "W4387120445" | 전체 Work 객체 (locations[] 등) |
| `searchWorks(q, opts)` | "SDG budget tagging" | 검색 결과 list |
| `filterWorks(filterStr)` | "openalex_id:W1|W2" | 배치 조회 |
| `citedBy(workId)` | "W4387120445" | 이 work를 인용한 후속 논문 list |
| `diagnose()` | — | API 키·캐시 상태 |

## 5개 배치 스크립트

| 스크립트 | 용도 |
|---|---|
| `enrich_wiki.js` | 전체 wiki/**/*.md frontmatter 일괄 검증. drift·OA URL·누락 DOI 보고 |
| `audit_titles.js` | wiki 제목을 OpenAlex 정본과 strict 대조 (DOI만 신뢰) |
| `find_missing_pdfs.js` | 우선순위 미입수 PDF 후보의 OA URL 일괄 탐색 |
| `discover_related.js` | 시드 논문의 forward citation (citedBy) — 노이즈 多 |
| `discover_backward.js` | 시드 논문의 backward citation (referenced_works) — **신호 깨끗** |

## CLI 사용 예

```bash
# 단건 정본 확인
node _workspace/openalex_helper.js doi "10.1017/dap.2023.28"

# 제목으로 fuzzy 검증 (DOI 없을 때만)
node _workspace/openalex_helper.js title "Difference-in-Differences" 2021

# 전체 wiki 일괄 검증 (월 1회 권장)
node _workspace/enrich_wiki.js
# → _workspace/openalex_enrichment.md

# 일부만 검증
node _workspace/enrich_wiki.js --only=callaway

# 미입수 PDF의 OA URL 탐색
node _workspace/find_missing_pdfs.js

# 시드 논문의 토대 (backward citation)
node _workspace/discover_backward.js
```

## 캐시 정책

- 위치: `_workspace/.openalex_cache/` (gitignored)
- TTL: 30일 (변경하려면 `openalex_helper.js`의 `CACHE_TTL_MS`)
- 캐시 키: API URL의 SHA-256 해시 24자
- 캐시 무시하고 재호출: 캐시 파일 직접 삭제 (`Remove-Item .openalex_cache/<hash>.json`)

## 알려진 한계

1. **title-search 정확도 낮음** — 인기 키워드(BERT, LoRA 등)는 엉뚱한 논문 반환. DOI 없으면 결과를 직접 확인.
2. **한국 KCI 논문 커버리지 약함** — DOI 있는 것만 일부 인덱스. RISS·DBpia 미인덱스.
3. **고전 논문 일부 미인덱스** — Rogoff 1990 등 1990년대 이전 일부 누락.
4. **OA URL의 ~30%는 가짜** — landing page를 PDF로 분류. magic byte (`%PDF-`) 검증 필수.
5. **저자명 표기 비일관** — "De Mello" vs "de Mello", "Sant'Anna" vs "Sant Anna" — 비교 시 정규화 필요.

## 출판사별 OA PDF 다운로드 우회 패턴

발견된 패턴 (`references/oa-download-tricks.md` 별도 참조).
