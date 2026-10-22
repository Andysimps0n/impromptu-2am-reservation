# 즉흥적 새벽 2시 공연 예매

Sites의 Cloudflare Worker와 D1을 사용해 배포합니다. 예매 데이터는 브라우저가 아니라 D1에 저장됩니다.

- 좌석: A열 12석은 운영진 보유석, B–K열은 각 12석(6-6), L열은 8석(4-4)으로 예매 가능 좌석은 총 128석입니다.
- 예매: 예약 코드와 연락처로 조회하며, 회차별 연락처당 최대 2석입니다. 입금 대기 좌석은 30분 뒤 해제됩니다.
- 요청 보호: 예매는 IP당 10분 20회, 예약 조회는 IP당 10분 8회, 비밀번호 로그인은 IP당 10분 5회, 카카오 로그인 시작은 IP당 10분 30회로 제한합니다.
- 개인정보 보관: 이름·연락처·입금자명과 연결된 예약·티켓 기록은 공연 종료 90일 뒤 자동 삭제합니다. 환불 완료 예약은 환불 완료 90일 뒤 삭제합니다. 환불 처리 중인 예약은 완료 처리 전까지 유지됩니다. Cloudflare Cron이 매일 03:00 KST에 만료 데이터를 정리합니다.
- 취소/환불: 입금 대기 예약은 취소 즉시 좌석이 풀립니다. 확정 예약은 환불 대기 상태에서 실제 송금 후 관리자가 완료 처리해야 좌석이 풀립니다.
- 관리자 로그인: 카카오 로그인을 사용합니다. 카카오 회원번호가 `ADMIN_KAKAO_IDS`에 있는 계정만 운영진이 됩니다. 기존 아이디/비밀번호 로그인은 `ADMIN_PASSWORD_LOGIN=1`일 때만 잠시 켜 둘 수 있습니다.
- 입장 확인: 입금 확인 시 좌석별 QR 티켓을 발급하고, 운영진이 관리자 화면에서 스캔합니다. QR은 한 번만 입장 처리됩니다.

`npm run build`는 HTML과 브라우저 코드를 Worker 파일에 묶습니다. DB 구조 변경은 `drizzle/` 마이그레이션으로 관리하며 각 API 요청 중에는 스키마를 변경하지 않습니다.

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

`ADMIN_PASSWORD`와 카카오 키는 로컬 설정 파일에만 입력하고 저장소에 커밋하지 마세요. 마이그레이션은 새 Cloudflare D1 데이터베이스에 적용됩니다.

## 카카오 로그인

운영진 화면의 로그인 버튼은 카카오 인가 페이지로 이동합니다. Worker가 인가 코드를 토큰으로 바꾸고, 카카오 `/v2/user/me`로 회원번호를 확인한 뒤 세션 쿠키를 발급합니다. 브라우저가 보내 준 토큰이나 닉네임은 권한 판단에 쓰지 않습니다. 운영진 여부는 `ADMIN_KAKAO_IDS`에 있는 회원번호인지만 봅니다.

키는 `wrangler.jsonc`에 적지 않습니다. 로컬에서는 `.env.example`을 `.dev.vars`로 복사해 채우고, 배포에서는 secret으로 넣습니다.

```sh
cp .env.example .dev.vars
npm run migrate:cloudflare
npm run set:cloudflare-kakao-secrets
npm run deploy:cloudflare
```

`npm run set:cloudflare-kakao-secrets`는 `.env.cloudflare`의 `KAKAO_REST_API_KEY`, `KAKAO_REDIRECT_URI`, `ADMIN_KAKAO_IDS`를 읽고, 값이 있는 `KAKAO_CLIENT_SECRET`, `ADMIN_PASSWORD_LOGIN`, `REQUIRE_KAKAO_BOOKING`도 함께 secret으로 올립니다. 변수마다 직접 넣으려면 `npx wrangler secret put 변수이름`을 실행합니다.

| 변수 | 하는 일 |
| --- | --- |
| `KAKAO_REST_API_KEY` | 카카오 앱의 REST API 키. 없으면 로그인 버튼이 이유를 알려 주고 멈춥니다. |
| `KAKAO_CLIENT_SECRET` | 콘솔에서 Client Secret을 켰을 때만 필요합니다. 끄면 비워 둡니다. |
| `KAKAO_REDIRECT_URI` | 콘솔에 등록한 콜백 주소와 같아야 합니다. 경로는 `/auth/kakao/callback`입니다. |
| `ADMIN_KAKAO_IDS` | 운영진 카카오 회원번호. `123,456`처럼 쉼표로 구분합니다. |
| `ADMIN_PASSWORD_LOGIN` | `1`이면 기존 아이디/비밀번호 로그인을 잠시 남겨 둡니다. |
| `REQUIRE_KAKAO_BOOKING` | `1`이면 예매 전에 카카오 로그인이 필요하고, 회원번호마다 회차당 4석까지입니다. 연락처당 4석 제한도 그대로입니다. |

카카오 콘솔에서 할 일:

1. [카카오 개발자 콘솔](https://developers.kakao.com)에서 애플리케이션을 만듭니다.
2. **앱 키**의 REST API 키를 `KAKAO_REST_API_KEY`에 넣습니다. JavaScript 키나 Admin 키는 쓰지 않습니다.
3. **카카오 로그인**을 활성화하고, Redirect URI에 로컬 `http://localhost:8787/auth/kakao/callback`과 배포 주소의 `https://<워커 도메인>/auth/kakao/callback`을 각각 등록합니다. `KAKAO_REDIRECT_URI`는 지금 접속 중인 주소와 글자까지 같아야 합니다.
4. Client Secret을 켜면 발급된 값을 `KAKAO_CLIENT_SECRET`에 넣습니다. 끄면 이 변수는 비웁니다.
5. **동의항목**에서 닉네임(`profile_nickname`)만 선택 동의로 켭니다. 회원번호는 로그인하면 기본으로 받을 수 있습니다. 이메일은 켜지 않습니다. 이 앱은 권한을 이메일이나 닉네임으로 판단하지 않습니다.
6. 카카오 계정으로 한 번 로그인한 뒤, 카카오 개발자 콘솔의 사용자 목록이나 로그인 응답에서 회원번호를 확인해 `ADMIN_KAKAO_IDS`에 넣습니다. 목록을 바꾼 뒤에는 그 계정이 다시 로그인해야 운영진 권한이 반영됩니다. 목록에서 빼면 이미 켜져 있는 세션도 바로 관리자 API를 쓸 수 없습니다.
7. 스키마를 적용합니다. `npm run migrate:cloudflare`가 `users` 테이블과 세션의 `user_id` 컬럼을 만듭니다.

로그인에 성공하면 `stage_admin` 쿠키가 발급됩니다. 이 쿠키는 HttpOnly, Secure, SameSite=Lax이고 8시간 뒤 만료됩니다. 관리자 화면의 **로그아웃**은 지금 기기만, **모든 기기에서 로그아웃**은 그 계정의 세션을 전부 지웁니다.

## 공연 관리

관객용 예매와 관리자 UI는 React로 구현하며 각각 `src/public/PublicApp.jsx`, `src/admin/AdminApp.jsx`에서 관리합니다. Worker API와 D1은 기존 구조를 유지합니다.

관리자 화면에서 새 공연을 초안으로 만들고 제목, 부제, 장소, 가격, 회차별 날짜와 시간을 편집할 수 있습니다. 이전 공연을 복제하면 설정과 일정만 새 초안에 복사되며 예약·티켓·검표 기록은 복사되지 않습니다. 게시된 공연은 한 번에 하나만 둘 수 있습니다. 새 공연 게시 전 기존 공연을 보관하면 기존 기록은 남고 예매 접수만 닫힙니다. 모든 공연은 삭제할 수 있으며, 삭제 시 공연 제목을 정확히 입력해야 합니다. 삭제하면 공연 회차와 해당 예약·티켓·검표 기록도 함께 영구 삭제됩니다.

기존 예약을 보존하는 이벤트 스키마를 추가하려면 `npm run migrate:cloudflare`를 먼저 실행한 뒤 새 Worker를 배포하세요. 관리자 비밀번호 변경은 화면에서 가능하며, 비밀번호를 잊은 경우 `.env.cloudflare`의 `ADMIN_PASSWORD`를 바꾼 뒤 `npm run set:cloudflare-admin-password`로 D1 자격 증명과 Cloudflare 비밀값을 재설정할 수 있습니다.

## 예약 확정 문자

문자는 입금 대기 상태에서는 보내지 않습니다. 운영진이 예약을 입금 확인으로 바꾸면 예매자 번호로 `즉새두 QR <티켓 링크>` 단문 SMS를 비동기로 보냅니다. 링크를 열면 공연명, 회차, 일시, 장소와 좌석별 입장 QR이 표시됩니다. 링크 토큰 원문은 URL fragment와 SMS에만 두고 D1에는 SHA-256 해시를 저장합니다. 취소·환불된 예약의 링크는 사용할 수 없습니다. 접수 실패는 관리자 화면에서 직접 재시도할 수 있으며, 접수 여부가 불확실하면 중복 발송 방지를 위해 재시도 버튼을 숨기고 Solapi 내역 확인을 안내합니다. 2분 넘게 발송 상태가 갱신되지 않으면 확인 필요 상태로 바뀝니다.

관리자 예약 목록은 최신 50건씩 불러오며 이전 기록은 페이지 이동으로 확인합니다. 통계와 좌석 배치도는 별도로 집계해 과거 전체 예약을 매 화면마다 브라우저로 보내지 않습니다.

Solapi 계정의 API 키, API 시크릿과 소유/사용 권한을 확인한 발신번호가 필요합니다. 발신번호는 Solapi 콘솔에서 사전 등록해야 합니다. 이 앱은 90바이트 이하 단문 SMS만 보내도록 지정했습니다. Solapi 공개 표준 단가는 SMS 1건 18원(부가세 별도)이며, 단가가 바뀔 수 있으니 발송 전 가격표를 확인하세요. 발신번호와 API 정보를 `.env.cloudflare`에 입력하고 `npm run set:cloudflare-sms-secrets`를 실행하면 Cloudflare Worker 비밀값으로 저장됩니다.

```text
즉새두 QR https://impromptu-2am-ticketing.impromptu2ticket.workers.dev/#t=<16-character-token>
```

현재 배포 주소 기준 링크 문자는 EUC-KR 환산 90바이트 이내로 지정되어 SMS로 전송됩니다. 신규 링크는 96비트 난수 토큰을 쓰며, 기존 22자 토큰 링크도 계속 지원합니다. API 키와 시크릿은 `.env.cloudflare`에만 입력하고 Git에 올리지 마세요.

로컬 SQLite의 기존 예약은 배포 DB로 복사하지 않습니다. QA 기록과 개인정보가 섞일 수 있어 배포 DB는 비어 있는 상태로 시작합니다.
