import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// .env.local 환경 변수 로드
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const clean = (val: string | undefined) => (val || '').replace(/['";\s]+/g, '').trim();

const supabaseUrl = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const serviceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ 에러: 환경 변수 NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 누락되었습니다.');
  process.exit(1);
}

// Admin 권한을 가진 Supabase 클라이언트 생성
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runTest() {
  console.log('🚀 [탈퇴 테스트] 회원탈퇴(데이터 익명화 보존) 테스트를 시작합니다...');

  const testEmail = `test-delete-${Date.now()}@bgms.kr`;
  const testPassword = 'testpassword123!';
  let testUserId: string | null = null;
  let testPostId: number | null = null;
  let testCommentId: number | null = null;

  try {
    // 1. 임시 테스트용 사용자 생성
    console.log(`\n1. 테스트 사용자 생성 중... (${testEmail})`);
    const { data: userData, error: createUserError } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { full_name: '탈퇴테스트유저' }
    });

    if (createUserError || !userData?.user) {
      throw new Error(`사용자 생성 실패: ${createUserError?.message}`);
    }

    testUserId = userData.user.id;
    console.log(`✅ 사용자 생성 성공 (ID: ${testUserId})`);

    // 2. 트리거에 의한 profiles 생성 확인 (대기 시간 부여)
    console.log('\n2. profiles 테이블 연동 확인 중...');
    await new Promise((resolve) => setTimeout(resolve, 1500)); // 트리거 동기화 대기

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', testUserId)
      .single();

    if (profileError || !profileData) {
      throw new Error(`Profile 연동 확인 실패: ${profileError?.message}`);
    }

    console.log(`✅ Profile 생성 확인 성공 (닉네임: ${profileData.nickname})`);

    // 3. 테스트용 게시글(posts) 작성
    console.log('\n3. 테스트 게시글(posts) 작성 중...');
    const { data: postData, error: postError } = await supabase
      .from('posts')
      .insert({
        user_id: testUserId,
        title: '탈퇴 테스트 게시글 제목',
        content: '탈퇴 테스트 게시글 본문 내용입니다.',
        status: 'published'
      })
      .select('id')
      .single();

    if (postError || !postData) {
      throw new Error(`게시글 작성 실패: ${postError?.message}`);
    }

    testPostId = postData.id;
    console.log(`✅ 게시글 작성 성공 (Post ID: ${testPostId})`);

    // 4. 테스트용 댓글(comments) 작성
    console.log('\n4. 테스트 댓글(comments) 작성 중...');
    const { data: commentData, error: commentError } = await supabase
      .from('comments')
      .insert({
        user_id: testUserId,
        post_id: testPostId,
        content: '탈퇴 테스트 댓글 내용입니다.'
      })
      .select('id')
      .single();

    if (commentError || !commentData) {
      throw new Error(`댓글 작성 실패: ${commentError?.message}`);
    }

    testCommentId = commentData.id;
    console.log(`✅ 댓글 작성 성공 (Comment ID: ${testCommentId})`);

    // 5. 회원탈퇴 실행 (auth.users에서 유저 삭제)
    console.log(`\n5. 회원탈퇴(유저 삭제) 실행 중... (User ID: ${testUserId})`);
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(testUserId);

    if (deleteUserError) {
      throw new Error(`유저 삭제 실패: ${deleteUserError.message}`);
    }

    console.log('✅ auth.users에서 유저 삭제 성공');

    // 6. DB 연쇄 작용 검증 (profiles 삭제 여부 & posts/comments 익명화 여부)
    console.log('\n6. DB 연쇄 반응 및 익명화(Set Null) 여부 검사 중...');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // A. profiles 삭제 검증
    const { data: deletedProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', testUserId)
      .maybeSingle();

    if (deletedProfile) {
      console.error('❌ 에러: profiles 레코드가 삭제되지 않았습니다.');
    } else {
      console.log('✅ 검증 성공: profiles 테이블에서 사용자 데이터가 완전히 삭제되었습니다.');
    }

    // B. posts 익명화(Set Null) 검증
    const { data: verifiedPost } = await supabase
      .from('posts')
      .select('*')
      .eq('id', testPostId)
      .single();

    if (verifiedPost.user_id !== null) {
      console.error(`❌ 에러: 게시글의 user_id가 NULL로 바뀌지 않았습니다. (현재 값: ${verifiedPost.user_id})`);
    } else {
      console.log('✅ 검증 성공: 게시글의 user_id가 NULL로 성공적으로 변환되었습니다 (익명 보존).');
    }

    // C. comments 익명화(Set Null) 검증
    const { data: verifiedComment } = await supabase
      .from('comments')
      .select('*')
      .eq('id', testCommentId)
      .single();

    if (verifiedComment.user_id !== null) {
      console.error(`❌ 에러: 댓글의 user_id가 NULL로 바뀌지 않았습니다. (현재 값: ${verifiedComment.user_id})`);
    } else {
      console.log('✅ 검증 성공: 댓글의 user_id가 NULL로 성공적으로 변환되었습니다 (익명 보존).');
    }

  } catch (error: any) {
    console.error(`\n❌ 테스트 진행 중 오류 발생: ${error.message}`);
  } finally {
    // 7. 테스트 잔여 데이터 정리 (Clean Up)
    console.log('\n7. 테스트 데이터 정리(Clean Up) 중...');
    if (testCommentId) {
      await supabase.from('comments').delete().eq('id', testCommentId);
    }
    if (testPostId) {
      await supabase.from('posts').delete().eq('id', testPostId);
    }
    if (testUserId) {
      await supabase.auth.admin.deleteUser(testUserId).catch(() => {});
    }
    console.log('✨ [테스트 종료] 모든 테스트가 안전하게 마무리되었습니다.');
  }
}

runTest();
