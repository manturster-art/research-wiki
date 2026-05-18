# Bilingual Policy — English Primary + 한국어 요약

## 정책

위키 본문은 **영어 우선**(RAG·국제 인용·LLM 학습 호환성). 모든 wiki/ + sources/ 파일은 마지막에 **`## 한국어 요약`** 섹션을 가진다.

이중언어 사용자(한국 학계 + 국제 학계 양쪽 활동)를 위해 설계.

## Karpathy 원형과의 차이

Karpathy 원본은 "English only in wiki content". 본 시스템은 RAG-friendliness를 깨뜨리지 않으면서 한국어 요약을 추가한 강화판:

- **본문 영어**: title·authors·summary·methodology·results — RAG 검색·국제 인용 그대로
- **한국어 요약 별도 섹션**: 박사연구·프로젝트 위치, 시사점, 본인 메모

LLM(Claude, GPT 등)은 두 섹션을 다 읽으므로 양쪽 정보 모두 활용.

## `## 한국어 요약` 섹션 표준

### sources/ (Tier 2)

```markdown
## 한국어 요약

**핵심 한 줄**: 영문 Summary의 한국어 정수 (30초 이해).

**박사 시리즈 위치 ({ref_code}, ★ {중요도 표시})**:
- **Paper X**: 이 논문이 어디에 어떻게 인용·활용되는지
- **Paper Y**: ...
- **별도논문 / 배경**: ...

**핵심 시사점**:
- 본인 연구와 직접 연결되는 implication 1
- 본인 연구와 직접 연결되는 implication 2

**한계 / 차별점**:
- 본인 연구가 이 논문과 어떻게 다른지 (Limitations 섹션 기반)

**메타데이터 이력** (있을 경우):
- ★ 정정 사항 (저자·연도·제목)
- 버전 차이 (NBER WP vs published 등)
```

### wiki/ (Tier 1) — 더 압축

```markdown
## 한국어 요약

**핵심 한 줄**: ...

**박사 시리즈 ({ref_code}, ★)**:
- Paper 1: ...
- Paper 2: ...

**핵심 시사점**: 한두 줄.
```

## 비영어 원본 처리

원본이 한국어·일본어·중국어 등 비영어인 경우 (예: KEI 이정석 2019, IBEC 2019, 이기한 2022):

```yaml
title: "원어 제목 (English translation in parentheses)"
```

본문은 **영어로 요약**하되, 원어 핵심 용어는 그대로 인용:
```markdown
## Key Contributions
- 3-stage failure diagnosis: leader will-power deficit (자치단체장 의지부족) → ...
```

이중언어 작성이 의미를 더 명확하게 함.

## "본인 메모" 권장 (시간이 흐를수록 가치 ↑)

위키 페이지를 읽거나 본인 연구에 인용할 때마다 한 줄 메모 덧붙이기:

```markdown
## 한국어 요약
... (Claude가 작성한 기존 내용) ...

### 내 메모 (2026-05-XX)
- Paper 2 §5.2에서 H3 검증 시 이 논문 ○○ 결과를 반박 근거로 쓸 것
- 메서드 X를 본 연구 ML 평가 매트릭스에 차용 가능
```

→ "Claude가 만든 위키"에서 **"내 위키"로 전환되는 과정**. 시간 누적 시 본인 연구 일지의 일부가 됨.

## English-only 모드 (선택)

다른 분야 사용자가 한국어 불필요한 경우, `## 한국어 요약` 섹션을 생략하고 영어만. 단 CLAUDE.md의 Language policy를 명시적으로:

```markdown
**Language policy**: English only (no Korean summary section).
```

스킬 부트스트랩 시 사용자에게 선택지 제시.
