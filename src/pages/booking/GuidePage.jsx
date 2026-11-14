import React from 'react';
import { OpenChatLink } from '../../components/OpenChatLink.jsx';
import { KakaoIcon } from '../../components/icons.jsx';
import { ACCOUNT_BANK, ACCOUNT_NUMBER } from '../../lib/seats.js';

const FAQ_ITEMS = [
  {
    q: '한 번에 몇 석까지 예매할 수 있나요?',
    a: '한 번에 최대 4석까지 신청할 수 있어요. 같은 연락처로는 회차마다 최대 4석까지 예매할 수 있습니다.',
  },
  {
    q: '입금은 언제까지 해야 하나요?',
    a: '예약 후 30분 안에 입금해 주셔야 해요. 시간이 지나면 예약이 만료되고 좌석이 다시 열립니다. 입금이 확인되면 문자로 안내드려요.',
  },
  {
    q: '입금할 때 무엇을 적어야 하나요?',
    a: '카카오뱅크 3333376900284로 입금해 주세요. 입금 메모에 예약 코드와 예매자 이름을 적어 주세요. 다른 분이 대신 입금해도 괜찮아요. 예매 때 입금자명을 따로 입력할 수 있어요.',
  },
  {
    q: '입장권(QR)은 어떻게 받나요?',
    a: '입금이 확인되면 예약 조회에서 좌석별 QR 티켓을 볼 수 있어요. 문자로도 티켓 링크를 보내드립니다. 공연 당일 입장할 때 좌석별 QR을 운영진에게 보여주세요.',
  },
  {
    q: '예매를 취소하거나 환불받고 싶어요.',
    a: '예약 페이지에서 직접 취소할 수는 없어요. 문의하기 버튼으로 연락해 주시면 취소와 환불을 도와드릴게요. 입금 후 취소하면 환불 절차를 거쳐 송금해 드립니다.',
  },
];

export function GuidePage() {
  return (
    <section className="content booking-subpage" aria-labelledby="guide-title">
      <div className="panel guide">
        <h2 id="guide-title">안내 사항</h2>
        <div className="notice">
          <strong>입금 계좌</strong>
          <p>
            {ACCOUNT_BANK} <b>{ACCOUNT_NUMBER}</b>
            <br />
            
          </p>
        </div>
        <div className="notice">
          <OpenChatLink className="kakao-login guide-inquiry">
            <KakaoIcon />
            문의하기
          </OpenChatLink>
        </div>
      </div>
      <div className="panel faq">
        <h2 id="faq-title">자주 묻는 질문</h2>
        {FAQ_ITEMS.map(item => (
          <details key={item.q} className="faq-item">
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
