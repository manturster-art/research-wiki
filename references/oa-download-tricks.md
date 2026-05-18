# OA PDF 다운로드 우회 패턴 (출판사별)

OpenAlex가 `is_oa: true`로 표시해도 봇 차단 등으로 자동 다운로드 실패 빈번. 발견된 우회 패턴 정리.

## 검증 절차

다운로드 직후 반드시 **PDF magic byte 검증**:

```powershell
$bytes = [System.IO.File]::ReadAllBytes($file)[0..3]
$isPdf = ($bytes -join ',') -eq '37,80,68,70'   # %PDF-
```

`$isPdf == false`면 HTML 셸이 다운로드된 것. 즉시 삭제하고 우회 패턴 시도.

## 출판사별 패턴

### ✅ arXiv (가장 안정)
```
원본: https://arxiv.org/pdf/{arxiv-id}
예: https://arxiv.org/pdf/1803.09015
```
거의 100% 성공. 우회 불필요.

### ✅ ACL Anthology (NLP 컨퍼런스)
```
원본: https://aclanthology.org/{paper-id}.pdf
예: https://aclanthology.org/2020.emnlp-demos.6.pdf
```
안정. `www.aclweb.org/anthology/`도 동일.

### ⚠️ Nature (s41XXX 시리즈)
```
원본 (실패): https://www.nature.com/articles/s41467-019-14108-y.pdf
→ HTML 셸 반환
```
**우회**: arXiv 깊은 검색 (OpenAlex `locations[]`에 submittedVersion 있음) — Nature Communications OA 논문은 arXiv 미러 흔함.
```
대체: arxiv.org/pdf/1905.00501
```

### ⚠️ Springer (LNCS·journals)
```
원본 (실패): https://link.springer.com/content/pdf/10.1007/{xxx}.pdf
→ JS 셸 ("Preparing to download...")
```
**우회 1**: HAL 프리프린트 (저자가 deposit한 경우 흔함)
```
search: hal.science + 논문 제목 → hal-XXXXXXX
```
**우회 2**: PubMed Central (PMC) — 단 PMC도 봇 차단 강함
**우회 3**: ResearchGate (저자 archive — 401 자주)
**최후**: 사용자 브라우저로 직접 (Springer Open은 OK)

### ⚠️ MDPI
```
원본 (가끔 실패): https://www.mdpi.com/{journal}/{vol}/{issue}/{article-id}/pdf
→ 403 빈번
```
**우회**: `res.mdpi.com` 직접 서버 + Referer 헤더
```
https://res.mdpi.com/d_attachment/{journal}/{journal}-{vol}-{article}/article_deploy/{journal}-{vol}-{article}.pdf
Referer: https://www.mdpi.com/
```
이 패턴으로 Krellenberg 2019, Fonseca 2020 성공.

### ⚠️ Wiley · AGU
```
원본 (실패): https://onlinelibrary.wiley.com/doi/pdfdirect/{doi}
→ 403
```
**우회**: 거의 안 됨. Wiley는 봇 차단 강력. 도서관·기관 접근.

### ⚠️ BMC (BioMedCentral)
```
원본 (실패): https://{journal}.biomedcentral.com/counter/pdf/{doi}
→ HTML 셸
```
**우회 1**: `.pdf` 확장자 추가 — 가끔 작동
**우회 2**: PMC mirror (PMC ID는 OpenAlex `locations[]`에서 확인)

### ⚠️ DSpace (대학·기관 리포지토리)

각 대학의 DSpace 버전·테마에 따라 다름.

**UPenn DSpace 7**:
```
원본 (실패): https://repository.upenn.edu/bitstreams/{uuid}/download
→ Angular SPA 셸
```
**우회**: REST API 직접 호출
```
https://repository.upenn.edu/server/api/core/bitstreams/{uuid}/content
```
Krippendorff 2011 성공.

**MIT DSpace** (`hdl.handle.net/1721.1/{id}`):
```
원본 (실패): http://hdl.handle.net/1721.1/63690
→ landing page, no direct PDF
```
**우회**: 저자 다른 deposit 찾기 (NBER WP, 저자 홈페이지)
```
Bertrand 2004 → NBER w8841: https://www.nber.org/system/files/working_papers/w8841/w8841.pdf
```

**Michigan Deep Blue** (`hdl.handle.net/2027.42/{id}`): 직접 PDF 노출 안 됨. JSTOR·도서관 필요.

### ⚠️ Europe PMC / PMC (`pmc.ncbi.nlm.nih.gov`)
```
원본 (실패): https://pmc.ncbi.nlm.nih.gov/articles/PMC{id}/pdf/main.pdf
→ "Preparing to download..." HHS interstitial
```
**우회 1**: Europe PMC API
```
https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC{id}&blobtype=pdf
```
**우회 2**: 출판본 (Springer/Wiley) 직접 시도 — 가끔 더 잘 됨
**우회 3**: 사용자 브라우저 (일반 브라우저에선 interstitial 거의 자동 통과)

### ⚠️ ResearchGate
```
원본: 401 (로그인 필요)
```
**우회**: 거의 불가. RG는 로그인 강제.

## 헤더 조합 (시도 순서)

```powershell
# 1차 — Chrome UA만
$ua = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"

# 2차 — UA + Accept + Referer
$headers = @{
  "Accept" = "application/pdf,*/*;q=0.8"
  "Accept-Language" = "en-US,en;q=0.9"
  "Referer" = "https://{publisher-domain}/"
}

# 3차 — locations[] 다른 미러 시도
node _workspace/dump_locations.js W{id}
```

## 실제 통계 (이전 작업 기준)

| 출처 유형 | 자동 다운로드 성공률 |
|---|---|
| arXiv | ~100% |
| ACL Anthology | ~100% |
| MDPI (res.mdpi.com 우회 포함) | ~80% |
| MIT DSpace (NBER 대체 포함) | ~50% |
| Nature (arXiv 미러 있을 때) | ~50% |
| Springer (HAL 미러 있을 때) | ~30% |
| Wiley · BMC · PMC · RG | ~10% (대부분 수동 필요) |

## 사용자에게 안내할 한 줄

> "자동 다운로드는 출판사별로 ~50% 성공. 실패한 건 도서관 또는 본인 브라우저로 직접 받으시면 됩니다 — DOI 목록은 `_workspace/find_missing_pdfs.js` 결과에 다 있습니다."
