# 즉흥적 새벽 2시 공연 예매

Sites의 Cloudflare Worker와 D1을 사용해 배포합니다. 예매 데이터는 브라우저가 아니라 D1에 저장됩니다.

- 좌석: A열 12석은 운영진 보유석, B–K열은 각 12석(6-6), L열은 8석(4-4)으로 예매 가능 좌석은 총 128석입니다.
- 예매: 예약 코드와 연락처로 조회하며, 회차별 연락처당 최대 2석입니다. 입금 대기 좌석은 30분 뒤 해제됩니다.
- 취소/환불: 입금 대기 예약은 취소 즉시 좌석이 풀립니다. 확정 예약은 환불 대기 상태에서 실제 송금 후 관리자가 완료 처리해야 좌석이 풀립니다.
- 관리자 로그인: `ADMIN_USERNAME`, `ADMIN_PASSWORD` 런타임 비밀 변수로 관리합니다.
- 입장 확인: 입금 확인 시 좌석별 QR 티켓을 발급하고, 운영진이 관리자 화면에서 스캔합니다. QR은 한 번만 입장 처리됩니다.

`npm run build`는 HTML과 브라우저 코드를 Worker 파일에 묶습니다. DB 구조는 `drizzle/0001_initial.sql`에서 관리합니다.

## QR 티켓 입장 확인

운영진이 입금을 확인하면 예약 좌석마다 티켓 QR이 생성됩니다. 관객은 사이트의 **내 예약 조회**에서 예약 코드와 연락처를 입력해 QR을 확인하고, 운영진은 관리자 화면의 **입장 확인 QR 스캔**으로 검표합니다. 카메라를 쓸 수 없으면 예약 코드와 좌석을 수동 입력할 수 있습니다. 입장 상태는 서버에서 한 번만 변경되며, 취소나 환불 상태의 예약은 입장 처리되지 않습니다.

QR을 포함한 브라우저 코드는 `qrcode`와 `html5-qrcode` 라이브러리를 빌드 시 앱에 묶습니다. 카메라 권한은 HTTPS에서만 사용할 수 있습니다.

## Cloudflare 배포

Worker와 D1을 배포하려면 Cloudflare API 토큰과 계정 ID를 로컬 `.env.cloudflare`에 설정합니다. 템플릿은 `cloudflare.env.example`이며, 비밀값 파일은 Git에서 제외됩니다. 토큰은 해당 계정의 Workers Scripts 편집, D1 편집, Account Settings 읽기 권한만 부여하세요.

```sh
npm run migrate:cloudflare
npm run set:cloudflare-admin-password
npm run deploy:cloudflare
```

`ADMIN_PASSWORD`는 로컬 설정 파일에만 입력하고 저장소에 커밋하지 마세요. 마이그레이션은 새 Cloudflare D1 데이터베이스에 적용됩니다.

## 예약 확정 문자

문자는 입금 대기 상태에서는 보내지 않습니다. 운영진이 예약을 입금 확인으로 바꾸면 예매자 번호로 `즉새두 QR <티켓 링크>` 단문 SMS를 보냅니다. 링크를 열면 공연명, 회차, 일시, 장소와 좌석별 입장 QR이 표시됩니다. 링크 토큰 원문은 URL fragment와 SMS에만 두고 D1에는 SHA-256 해시를 저장합니다. 취소·환불된 예약의 링크는 사용할 수 없습니다. 접수 실패는 관리자 화면에서 직접 재시도할 수 있으며, 네트워크 시간 초과처럼 접수 여부가 불확실하면 중복 발송 방지를 위해 재시도 버튼을 숨기고 Solapi 내역 확인을 안내합니다.

Solapi 계정의 API 키, API 시크릿과 소유/사용 권한을 확인한 발신번호가 필요합니다. 발신번호는 Solapi 콘솔에서 사전 등록해야 합니다. 이 앱은 90바이트 이하 단문 SMS만 보내도록 지정했습니다. Solapi 공개 표준 단가는 SMS 1건 18원(부가세 별도)이며, 단가가 바뀔 수 있으니 발송 전 가격표를 확인하세요. 발신번호와 API 정보를 `.env.cloudflare`에 입력하고 `npm run set:cloudflare-sms-secrets`를 실행하면 Cloudflare Worker 비밀값으로 저장됩니다.

```text
즉새두 QR https://impromptu-2am-ticketing.impromptu2ticket.workers.dev/#t=<16-character-token>
```

현재 배포 주소 기준 링크 문자는 EUC-KR 환산 90바이트 이내로 지정되어 SMS로 전송됩니다. 신규 링크는 96비트 난수 토큰을 쓰며, 기존 22자 토큰 링크도 계속 지원합니다. API 키와 시크릿은 `.env.cloudflare`에만 입력하고 Git에 올리지 마세요.

로컬 SQLite의 기존 예약은 배포 DB로 복사하지 않습니다. QA 기록과 개인정보가 섞일 수 있어 배포 DB는 비어 있는 상태로 시작합니다.
