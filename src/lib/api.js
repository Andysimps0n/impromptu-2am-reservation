export const api = async (path, options = {}) => {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text || '{}');
  } catch {
    throw new Error('예매 서버가 응답하지 않았습니다. 잠시 후 다시 시도해주세요.');
  }
  if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
  return data;
};
