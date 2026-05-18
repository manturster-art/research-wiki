# D16 Anti-Hallucination Principle

## 원칙

**모든 메타데이터·인용은 1차 출처에서 직접 검증한다.** Claude의 사전 지식·통계적 추정·유사 논문에서의 일반화로 메타데이터를 생성하지 않는다.

명칭의 유래: 사용자의 박사연구 종합계획서 v5.0의 "D16 참고문헌 검증" 결정 (hallucinated citation 6종 제거). 이 원칙을 위키 전체에 확장 적용.

## 4-way 검증 (이상)

```
PDF 본문 첫 페이지    ←  ground truth
   ↓                     ↑
OpenAlex 정본 (DOI)   ←→  Crossref 정본 (DOI)
   ↓                     ↑
   wiki YAML 메타데이터
```

4개 출처가 일치하면 PASS. 하나라도 불일치하면 **★ 주의 표시 + 사용자 결정 대기** (자동 수정 X).

## 적용 룰

### Rule 1 — PDF 본문이 최우선

YAML title·authors·year·doi는 **PDF 첫 페이지에서 직접 추출**한다. `pypdf`로 첫 5~10페이지 텍스트화해서 확인.

- 사용자 제공 파일명(`Matsui_et_al.pdf` 등)은 신뢰하지 않음. **반드시 본문 확인** (사례: 사용자가 "Matsui 2022"로 저장한 파일이 실제로는 IBEC 2019 일본 정부문서였음 — 본문 확인으로 발견)
- DOI는 보통 첫 페이지 상단 또는 푸터에 명시. 없으면 ISBN/arXiv ID 등 대체 식별자 찾기.

### Rule 2 — OpenAlex로 cross-check (Pattern B)

`node _workspace/openalex_helper.js doi <DOI>` 실행:
- `exists: true` + 저자·연도·제목 일치 → PASS
- 불일치 → 어느 쪽이 맞는지 확인 (가끔 OpenAlex가 더 정확 — 출판본 정정, paper2 R-08의 Van Zanten 저자 정정 사례)

DOI 없으면 `node _workspace/openalex_helper.js title "<TITLE>" <YEAR>` — 단 **confidence < 0.6은 신뢰 X** (title-search 가짜 양성 사례: BERT 검색 시 Sentence-BERT 반환).

### Rule 3 — Crossref로 second-opinion (선택)

OpenAlex와 Crossref는 독립 출처. `node _workspace/crossref_helper.js crosscheck <DOI>`로 동시 비교 가능. 두 DB 모두 OK면 신뢰성 ↑.

### Rule 4 — 불확실하면 `?` 또는 ★ 표시

- 저자명 표기 변형(예: De Mello vs de Mello)은 출판본 따름 + Glossary에 변형 표기
- 연도 차이(accepted 2018 vs published 2019)는 출판본 사용 + source 페이지 상단에 `★ 연도 주의` 섹션
- 누락 메타 (DOI 없음 등): YAML 빈 문자열 `""` + Document Information에 *"no DOI found"* 명시

## 자동 수정 금지

검증 도구가 drift를 발견해도 **wiki 파일을 직접 수정하지 않는다.** 모든 정정은:
1. 검증 로그(`_workspace/verification_log.md`)에 append
2. 사용자에게 보고 (제목·저자·연도 차이 등 구체적으로)
3. 사용자 결정 후 사용자 명령으로 정정

이유: 자동 수정은 위키의 신뢰성을 무너뜨림. drift가 진짜 오류인지 검증 도구의 가짜 양성인지 사람만 판단 가능.

## 발견된 가짜 양성 사례

이전 작업에서 `audit_titles.js`가 보고한 "불일치" 9건 중:
- 8건은 **DOI 없는 항목의 title-search 가짜 양성** (BERT → Sentence-BERT 반환 등). wiki 제목은 정확.
- 1건은 DOI 기반이지만 영문 제목 정확 + 한글 병기는 의도된 이중언어 스타일.

→ **DOI 기반 검증만 신뢰. title-search는 발견용으로만**.

## D16 정정 실제 사례 (참조)

| 발견 | 정정 |
|---|---|
| Guisiano 2022 SDG-Meter — 채팅·스크립트에서 약식 제목 사용 | 정본 "...of the Sustainable Development Goals"로 위키·스크립트·paper1 docx 모두 통일 |
| Guariso 2023 — paper1 v4 리스트에 "Laderchi & Moroz" 공저로 잘못 기재 | PDF 직접 추출로 정정본(Guerrero & Castañeda) 사용. paper2 v2 R-05와 일치 |
| Van Zanten 2021 — paper1 C-1에 "Venturini 등" 잘못된 저자 | PDF 직접 추출로 Van Zanten & Van Tulder 정정 |
| Allen 2019 — OpenAlex backward-citation이 2018(accepted)로 표시 | 실제 출판 Sustainability Science 14:421-438 (2019-03). wiki는 출판본 기준 2019 + ★ 연도 주의 명시 |
| Bertrand 2004 — 다운로드한 PDF는 NBER WP w8841 (2002-03 버전) | 출판본 QJE 119(1) 2004와 본문 동일. ★ 버전 주의 + 출판본 메타데이터 사용 |
| Krippendorff 2011 — OpenAlex가 "Agreement and Information" 매치 | paper1 F-2 원래 인용은 다른 Krippendorff 2011 ("Computing Krippendorff's Alpha-Reliability"). **★ 메타데이터 주의** 표시 후 사용자 결정 대기 |
| "Matsui 2022" 파일이 실제론 IBEC 2019 | 파일명 정정 (`ibec-2019-...`) + 별도 등재. 실제 Matsui 2022는 사용자가 추후 HAL에서 직접 다운로드해 별도 등재 |

→ 이런 패턴이 D16의 가치. **시간이 흐를수록 위키가 정확해지는 메커니즘**.
