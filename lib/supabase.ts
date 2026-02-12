import { createClient } from '@supabase/supabase-js';

// 1. .env.local 파일에 숨겨둔 URL과 비밀번호(Key)를 가져옵니다.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 2. 이 정보들을 바탕으로 Supabase와 통신할 수 있는 '연결 통로(client)'를 만듭니다.
// export를 붙여서 Map.tsx 같은 다른 파일에서 이 통로를 가져다 쓸 수 있게 합니다.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);