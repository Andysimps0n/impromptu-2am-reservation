import React from 'react';
import { Link } from 'react-router';

// 배경 사진(글자와 버튼 포함)을 그대로 쓰고, 버튼 위치에 투명한 링크를 겹쳐 예매 페이지로 보낸다.
export function HomePage() {
  return (
    <section className="poster" aria-label="즉흥적 새벽두시 공연 안내">
      <div className="poster-art">
        <img
          className="poster-bg"
          src="/poster-background.jpg"
          alt="즉흥적 새벽두시, 26-2학기 정기공연, How'd You Feel?"
        />
        <Link className="poster-contact" to="/booking/seats" aria-label="좌석 예매하기" />
      </div>
    </section>
  );
}
