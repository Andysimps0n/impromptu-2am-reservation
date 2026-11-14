import { createContext, useContext } from 'react';

// AdminLayout이 로그인 상태, 공연 목록, 공통 모달 여는 함수를 내려준다.
export const AdminContext = createContext(null);

export const useAdmin = () => useContext(AdminContext);
