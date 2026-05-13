
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanup() {
  console.log('🧹 [Cleanup] 41.2 패치노트 데이터 및 동기화 이력 삭제 중...');

  // 1. 해당 게시글 삭제 (제목에 '41.2' 포함된 게시글)
  const { data: posts, error: postError } = await supabase
    .from('posts')
    .delete()
    .ilike('title', '%41.2%');

  if (postError) {
    console.error('❌ 게시글 삭제 실패:', postError);
  } else {
    console.log('✅ 41.2 관련 게시글 삭제 완료');
  }

  // 2. 동기화 이력 삭제 (type이 'patch_notes'인 데이터)
  const { error: historyError } = await supabase
    .from('sync_history')
    .delete()
    .eq('type', 'patch_notes');

  if (historyError) {
    console.error('❌ 동기화 이력 삭제 실패:', historyError);
  } else {
    console.log('✅ 패치노트 동기화 이력 삭제 완료');
  }

  console.log('🚀 이제 npx tsx scripts/sync_patch_notes.ts 를 실행하여 다시 동기화할 수 있습니다.');
}

cleanup();
