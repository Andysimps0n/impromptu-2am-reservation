import React, { useEffect, useRef, useState } from 'react';
import { Dialog } from '../../components/Dialog.jsx';
import { CopyIcon } from '../../components/icons.jsx';

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 아래 대체 복사로 넘어간다.
  }
  // navigator.clipboard를 못 쓰는 환경(비보안 연결, 오래된 브라우저)용 대체 복사
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function BookingSuccess({ booking, session, onClose, onLookup }) {
  const code = booking.code || booking.id;
  const [copied, setCopied] = useState('');
  const copyTimer = useRef(null);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const copyCode = async () => {
    const ok = await copyText(code);
    setCopied(ok ? '복사가 되었습니다' : '복사하지 못했어요. 코드를 길게 눌러 선택해 주세요.');
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(''), 2000);
  };
  return (
    <Dialog onClose={onClose}>
      <div className="success">
        <div className="check">✓</div>
        <h2>입금 대기 예약이 등록됐어요</h2>
        <p>
          {session?.sortOrder}공 · {session?.dateLabel} {session?.timeLabel}
        </p>
        <div className="code-row">
          <div className="code">{code}</div>
          <button type="button" className="code-copy-icon" aria-label="예약 코드 복사" onClick={copyCode}>
            <CopyIcon />
          </button>
        </div>
        {copied && (
          <div className="code-copy-chip" role="status">
            {copied}
          </div>
        )}
        <p className="hint">예약이 확정되면 입력한 연락처로 문자 안내를 한 번 보내드립니다.</p>
        <button className="primary" onClick={onLookup}>
          예약 정보 보기
        </button>
      </div>
    </Dialog>
  );
}
