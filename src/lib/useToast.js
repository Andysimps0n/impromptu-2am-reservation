import { useCallback, useEffect, useState } from 'react';

// 메시지를 띄우고 duration 뒤에 지운다. 새 메시지가 오면 타이머를 다시 잰다.
export function useToast(duration) {
  const [toast, setToast] = useState('');
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), duration);
    return () => clearTimeout(timer);
  }, [toast, duration]);
  return [toast, useCallback(message => setToast(message || ''), [])];
}
