import React, { useEffect, useRef, useState } from 'react';
import { Dialog } from '../../components/Dialog.jsx';
import { CopyIcon } from '../../components/icons.jsx';
import { formatPhoneInput } from '../../lib/format.js';
import { ACCOUNT_BANK, ACCOUNT_NUMBER } from '../../lib/seats.js';

const validate = (field, value) => {
  const text = value.trim();
  if (field === 'name' && !text) return '예매자 이름을 입력해주세요.';
  if (field === 'name' && text.length > 40) return '이름은 40자 이내로 입력해주세요.';
  if (field === 'payer' && !text) return '실제 입금할 분의 이름을 입력해주세요.';
  if (field === 'payer' && text.length > 40) return '입금자명은 40자 이내로 입력해주세요.';
  if (field === 'phone' && !text) return '연락처를 입력해주세요. 예: 010-1234-5678';
  if (
    field === 'phone' &&
    (text.replace(/\D/g, '').length < 10 || text.replace(/\D/g, '').length > 11)
  )
    return '연락처 숫자를 10~11자리로 입력해주세요.';
  if (field === 'phoneConfirm' && !text) return '확인을 위해 연락처를 한 번 더 입력해주세요.';
  return '';
};

function Field({ id, label, error, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && (
        <small className="field-error" aria-live="polite">
          {error}
        </small>
      )}
    </div>
  );
}

export function BookingDialog({ session, seats, price, onClose, onSubmit }) {
  const [values, setValues] = useState({ name: '', phone: '', phoneConfirm: '', payer: '' });
  const [payerSame, setPayerSame] = useState(true);
  const [errors, setErrors] = useState({});
  const [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');
  const [copyNotice, setCopyNotice] = useState(null);
  const payerInput = useRef(null);
  const copyTimer = useRef(null);
  const amount = seats.length * price;
  const phoneMismatch =
    values.phoneConfirm.trim() !== '' &&
    values.phone.replace(/\D/g, '') !== values.phoneConfirm.replace(/\D/g, '');

  const change = (field, value) => {
    setValues(current => ({ ...current, [field]: value }));
    if (errors[field]) setErrors(current => ({ ...current, [field]: validate(field, value) }));
  };
  const blur = field => event =>
    setErrors(current => ({ ...current, [field]: validate(field, event.target.value) }));
  const changePayerSame = checked => {
    setPayerSame(checked);
    if (checked) {
      setErrors(current => ({ ...current, payer: '' }));
      return;
    }
    requestAnimationFrame(() => payerInput.current?.focus());
  };
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const copyAccount = async () => {
    try {
      await navigator.clipboard.writeText(ACCOUNT_NUMBER);
      setCopyNotice({ ok: true, message: '계좌번호를 복사했어요' });
    } catch {
      setCopyNotice({
        ok: false,
        message: '복사하지 못했어요. 계좌번호를 길게 눌러 선택해 주세요.',
      });
    }
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyNotice(null), 2000);
  };
  const submit = async event => {
    event.preventDefault();
    const next = {
      name: validate('name', values.name),
      phone: validate('phone', values.phone),
      phoneConfirm: validate('phoneConfirm', values.phoneConfirm),
      payer: payerSame ? '' : validate('payer', values.payer),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    if (phoneMismatch) return;
    if (!privacy) {
      setServerError('개인정보 수집에 동의해주세요.');
      return;
    }
    setBusy(true);
    setServerError('');
    try {
      await onSubmit({
        name: values.name.trim(),
        phone: values.phone.trim(),
        payer: (payerSame ? values.name : values.payer).trim(),
      });
    } catch (problem) {
      setServerError(problem.message);
      setBusy(false);
    }
  };

  return (
    <Dialog onClose={onClose} className="booking-dialog">
      <form className="booking-sheet" noValidate onSubmit={submit}>
      <div className="booking-scroll">
      <h2>좌석 예매하기</h2>
      <p className="booking-show">
        <span>
          {session?.dateLabel} {session?.timeLabel}
        </span>
        <strong>{seats.map(seat => `${seat}번`).join(', ')}</strong>
      </p>
      <section className="booking-pay" aria-label="입금 정보">
        <p className="pay-kicker">입금액</p>
        <p className="pay-amount">{amount.toLocaleString()}원</p>
        <p className="pay-meta">{seats.length}석 · 예약 후 30분 이내 확인 예정</p>
        <div className="pay-account">
          <div className="account-line">
            <span>
              <span className="account-bank">{ACCOUNT_BANK}</span>
              <span className="account-number">{ACCOUNT_NUMBER}</span>
            </span>
            <button
              className="account-icon"
              type="button"
              aria-label="계좌번호 복사"
              onClick={copyAccount}
            >
              <CopyIcon />
            </button>
          </div>
        </div>
      </section>
        <div className="form-grid">
          <Field id="book-name" label="예매자 이름" error={errors.name}>
            <input
              id="book-name"
              name="name"
              autoComplete="name"
              maxLength={40}
              placeholder="예: 홍길동"
              value={values.name}
              aria-invalid={Boolean(errors.name)}
              onChange={e => change('name', e.target.value)}
              onBlur={blur('name')}
            />
          </Field>
          <Field id="book-phone" label="연락처" error={errors.phone}>
            <input
              id="book-phone"
              name="phone"
              autoComplete="tel"
              type="tel"
              inputMode="tel"
              maxLength={13}
              placeholder="예: 010-1234-5678"
              value={values.phone}
              aria-invalid={Boolean(errors.phone)}
              onChange={e => change('phone', formatPhoneInput(e.target.value))}
              onBlur={blur('phone')}
            />
          </Field>
          <Field
            id="book-phone-confirm"
            label="연락처 확인"
            error={
              errors.phoneConfirm ||
              (phoneMismatch ? '연락처가 서로 일치하지 않아요. 다시 확인해주세요.' : '')
            }
          >
            <input
              id="book-phone-confirm"
              name="phoneConfirm"
              autoComplete="off"
              type="tel"
              inputMode="tel"
              maxLength={13}
              placeholder="연락처를 한 번 더 입력해주세요"
              value={values.phoneConfirm}
              aria-invalid={Boolean(errors.phoneConfirm) || phoneMismatch}
              onChange={e => change('phoneConfirm', formatPhoneInput(e.target.value))}
              onBlur={blur('phoneConfirm')}
            />
          </Field>
          <label className="same-payer">
            <input
              type="checkbox"
              checked={payerSame}
              onChange={event => changePayerSame(event.target.checked)}
            />
            예매자와 입금자가 같음
          </label>
          {!payerSame && (
            <Field id="book-payer" label="입금자명" error={errors.payer}>
              <input
                ref={payerInput}
                id="book-payer"
                name="payer"
                autoComplete="name"
                maxLength={40}
                placeholder="예: 홍길동"
                value={values.payer}
                aria-invalid={Boolean(errors.payer)}
                onChange={e => change('payer', e.target.value)}
                onBlur={blur('payer')}
              />
            </Field>
          )}
        </div>
        <div className="booking-consent">
          <label className="privacy-agree">
            <input
              type="checkbox"
              checked={privacy}
              onChange={event => setPrivacy(event.target.checked)}
            />
            개인정보 수집에 동의합니다.
          </label>
          <p className="privacy-reason">
            이름과 연락처는 예약을 찾고 티켓 안내 문자를 보내는 데 씁니다. 입금자명은 입금한 분과
            예약을 맞추기 위해 받습니다.
          </p>
        </div>
        {serverError && (
          <div className="form-error-summary" role="alert">
            {serverError}
          </div>
        )}
      </div>
      {/* 입력칸을 스크롤해도 제출 버튼은 드로어 아래에 고정된다. */}
      <div className="booking-footer">
        <button className="primary" disabled={busy || phoneMismatch}>
          {busy ? '예약 처리 중…' : '입금 대기 예약하기'}
        </button>
      </div>
      </form>
      {copyNotice && (
        <p className={`copy-toast ${copyNotice.ok ? '' : 'is-error'}`} role="status">
          <span className="copy-toast-mark" aria-hidden="true">
            {copyNotice.ok ? '✓' : '!'}
          </span>
          {copyNotice.message}
        </p>
      )}
    </Dialog>
  );
}
