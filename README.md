# 즉흥적 새벽 2시 공연 예매

Sites의 Cloudflare Worker와 D1을 사용해 배포합니다. 예매 데이터는 브라우저가 아니라 D1에 저장됩니다.

- 좌석: A–L 12열 × 12석, 가운데 통로 기준 6석씩. A열은 운영진 보유석입니다.
- 예매: 예약 코드와 연락처로 조회하며, 연락처당 최대 2석입니다. 입금 대기 좌석은 30분 뒤 해제됩니다.
- 취소/환불: 입금 대기 예약은 취소 즉시 좌석이 풀립니다. 확정 예약은 환불 대기 상태에서 실제 송금 후 관리자가 완료 처리해야 좌석이 풀립니다.
- 관리자 로그인: `ADMIN_USERNAME`, `ADMIN_PASSWORD` 런타임 비밀 변수로 관리합니다.

`npm run build`는 HTML과 브라우저 코드를 Worker 파일에 묶습니다. DB 구조는 `drizzle/0001_initial.sql`에서 관리합니다.

## Cloudflare 배포

Worker와 D1을 배포하려면 Cloudflare API 토큰과 계정 ID를 로컬 `.env.cloudflare`에 설정합니다. 템플릿은 `cloudflare.env.example`이며, 비밀값 파일은 Git에서 제외됩니다. 토큰은 해당 계정의 Workers Scripts 편집, D1 편집, Account Settings 읽기 권한만 부여하세요.

```sh
npm run migrate:cloudflare
npm run set:cloudflare-admin-password
npm run deploy:cloudflare
```

`ADMIN_PASSWORD`는 로컬 설정 파일에만 입력하고 저장소에 커밋하지 마세요. 마이그레이션은 새 Cloudflare D1 데이터베이스에 적용됩니다.

로컬 SQLite의 기존 예약은 배포 DB로 복사하지 않습니다. QA 기록과 개인정보가 섞일 수 있어 배포 DB는 비어 있는 상태로 시작합니다.
