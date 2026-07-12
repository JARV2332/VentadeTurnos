import { installSupabaseFetchPatch } from './supabaseFetch';

const MOCK_MODE =
  process.env.NODE_ENV === 'production'
    ? false
    : process.env.REACT_APP_MOCK_MODE !== 'false';

if (!MOCK_MODE) {
  installSupabaseFetchPatch();
}
