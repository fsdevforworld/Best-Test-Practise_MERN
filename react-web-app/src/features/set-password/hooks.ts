import { useLocation } from 'react-router';

export function useUserEmail() {
  const params = useQuery();
  const userEmail = params.get('email');
  if (userEmail) return sanitizeParameters(userEmail);
  return '';
}

export function useUserToken() {
  const params = useQuery();
  const userToken = params.get('token');
  if (userToken) return sanitizeParameters(userToken);
  return '';
}

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

function sanitizeParameters(param: string) {
  return param.replace(/[^\w.\-@]+/g, '');
}
