# KCI 캐시-공유 패턴 운영 가이드 (옵션 A)

> KCI Open API는 사용자가 등록한 로컬 PC IP에서만 응답 → 클라우드 환경(claude.ai/code remote, CI/CD 등)에서는 직접 호출 불가.
> 해법: **사용자 PC에서 캐시를 채워 git commit → 클라우드는 캐시만 사용**.

---

## 동작 모드

`kci_helper.js`는 환경에 따라 자동 모드 전환:

| 환경 | KCI_API_KEY | 모드 | 동작 |
|---|---|---|---|
| 사용자 로컬 PC (등록 IP) | ✅ 있음 | **ONLINE** | 캐시 hit → 응답 / 캐시 miss → KCI API 호출 + 캐시 저장 |
| 클라우드·다른 PC | ❌ 없음 | **OFFLINE 자동** | 캐시 hit → 응답 / 캐시 miss → `KCI_OFFLINE_MISS` 에러 (재실행 안내) |
| 사용자 PC지만 강제 캐시 전용 | (무관) + `KCI_OFFLINE=true` | **OFFLINE 강제** | 동일 |

캐시 위치: `_workspace/.kci_cache/<sha256>.xml` (git에 commit됨)

---

## 사용자 PC 정기 실행 (Windows Task Scheduler)

### 옵션 1 — 수동 (월 1회 권장)

```powershell
cd D:\박정진\대학원(박사)\llm-wiki
node _workspace\enrich_wiki.js                                     # OpenAlex/Crossref
node _workspace\verify_korean_batch.js > _workspace\kci_batch_report.md   # KCI 한국어 일괄

# 캐시·보고서 push
git add _workspace/.kci_cache _workspace/kci_batch_report.md
git commit -m "chore(kci): 월간 KCI 캐시 갱신 (YYYY-MM)"
git push origin main
```

### 옵션 2 — 자동 (Task Scheduler, 주 1회 일요일 02:00)

1. Win + R → `taskschd.msc`
2. **작업 만들기**(Create Task) — "kci-wiki-refresh"
3. **트리거**: 주 1회 / 일요일 / 02:00
4. **동작**: 프로그램 시작
   - 프로그램: `powershell.exe`
   - 인수: `-NoProfile -ExecutionPolicy Bypass -File "D:\박정진\대학원(박사)\llm-wiki\_workspace\refresh_kci_cache.ps1"`
5. **조건**: AC 전원 + 네트워크 연결

스크립트 `_workspace\refresh_kci_cache.ps1`:

```powershell
$ErrorActionPreference = "Continue"
$root = "D:\박정진\대학원(박사)\llm-wiki"
Set-Location $root

# 최신화
git fetch origin
git pull --ff-only origin main

# KCI 한국어 자료 일괄 검증 (캐시 채움)
node _workspace\verify_korean_batch.js > _workspace\kci_batch_report.md 2>&1

# OpenAlex 정기 검증 (캐시 일부 갱신)
node _workspace\enrich_wiki.js >> _workspace\kci_batch_report.md 2>&1

# 변경 commit + push
git add _workspace/.kci_cache _workspace/.openalex_cache _workspace/.crossref_cache _workspace/*_report.md _workspace/*enrichment.* 2>$null
$diff = git diff --cached --name-only
if ($diff) {
    git commit -m "chore(verify): weekly cache refresh $(Get-Date -Format 'yyyy-MM-dd')"
    git push origin main
} else {
    Write-Output "No cache changes."
}
```

---

## 클라우드 환경에서 사용

API 키 없이도 `wiki-verifier` 에이전트가 자동 동작:

```bash
# clone 후 캐시 자동 포함
git clone https://github.com/manturster-art/llm-wiki.git
cd llm-wiki

# OFFLINE 모드 자동 감지 (KCI_API_KEY 없음 → cache-only)
node _workspace/kci_helper.js diagnose
# → mode: "OFFLINE (cache-only)"
# → cache_files: 15  (commit된 KCI 응답)

# 검증 실행 — 캐시 hit한 항목은 정상 응답
node _workspace/kci_helper.js doi 10.20484/klog.22.1.7
# → ART002351103, 이유현, 지방정부연구, cb=11
```

캐시 miss인 신규 항목은 명확한 에러:

```bash
node _workspace/kci_helper.js doi 10.99999/newpaper.2026
# Error: KCI cache miss in OFFLINE mode (KCI_API_KEY 미설정 (OFFLINE 모드 자동)).
# 이 항목은 사용자의 등록된 로컬 PC에서 검증 후 .kci_cache/를 git commit 해주세요.
```

→ 사용자 PC에서 한 번 실행 후 push 하면 클라우드도 자동 사용 가능.

---

## 장점·단점

| 장점 | 단점 |
|---|---|
| KCI 정책 100% 준수 (호출은 등록 PC에서만) | 신규 항목은 사용자 PC 재실행 전까지 클라우드에서 검증 불가 |
| 클라우드도 동일 검증 결과 접근 | 사용자 PC가 정기 실행되어야 캐시 최신 |
| 보안 단순 (proxy/tunnel 없음) | TTL 무시 → 사용자가 주기적 갱신 필요 |
| 구현 매우 작음 (helper 30줄 변경) | 캐시 commit이 .gitignore 정책 변경 (의도된 예외) |
| 사용자 PC 항상 ON 불필요 | — |

---

## 캐시 갱신 정책

- **자동 강제 갱신** (정기): Task Scheduler 주 1회 (위 옵션 2)
- **수동 즉시 갱신** (새 한국어 자료 등재 시):
  ```bash
  KCI_OFFLINE=  node _workspace/kci_helper.js doi <NEW_DOI>   # OFFLINE 해제 강제
  # 또는 단순히 KCI_API_KEY가 있는 환경에서 실행
  ```
- **캐시 무효화** (특정 항목): `.kci_cache/<해당-sha256>.xml` 삭제 후 재실행
- **전체 캐시 초기화**: `_workspace/.kci_cache/`만 비우고 정기 실행 (실수 방지)

---

## 트러블슈팅

| 증상 | 원인 | 해법 |
|---|---|---|
| `KCI_OFFLINE_MISS` 에러 | 캐시에 없는 항목 (신규 검증 미수행) | 사용자 PC에서 해당 항목 검증 → git push |
| 캐시 응답이 stale | 오래된 캐시 (TTL 무시 설정) | 사용자 PC에서 `--force` 재검증 또는 `.kci_cache/<sha256>.xml` 삭제 후 재실행 |
| `has_api_key: true`이지만 OFFLINE 모드 | `KCI_OFFLINE=true` 환경 변수 설정 | `unset KCI_OFFLINE` 또는 PowerShell `$env:KCI_OFFLINE=$null` |
| Task Scheduler 실행 실패 | PowerShell 실행 정책 | 작업 인수에 `-ExecutionPolicy Bypass` 포함 확인 |
| git push 실패 | 다른 세션과 commit 충돌 | 스크립트에 `git pull --rebase` 추가 |

---

## 보안 메모

- `_workspace/.env`의 `KCI_API_KEY`는 **여전히 gitignore 대상** (절대 commit 금지)
- `.kci_cache/<sha256>.xml`의 파일명은 SHA256(URL) — URL에는 API 키가 포함되어 있으나, **응답 본문에는 키 없음** ✓
- 캐시 내용 점검: `Get-Content _workspace/.kci_cache/*.xml | Select-String "key=" -Quiet` → 결과 없으면 안전
