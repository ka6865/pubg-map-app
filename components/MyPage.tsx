'use client';

import { useState } from 'react';
import { supabase } from '../lib/supabase';

// Map.tsx에서 넘겨준 유저 정보와 상태 변경 함수들을 props로 받음
interface MyPageProps {
  currentUser: any;                      // Supabase auth.users 정보
  userProfile: any;                      // profiles 테이블 정보 (닉네임 등)
  setIsMyPage: (v: boolean) => void;     // 마이페이지 닫기용 함수
  fetchUserProfile: (id: string) => void;// 닉네임 변경 후 최신화용 함수
}

export default function MyPage({ currentUser, userProfile, setIsMyPage, fetchUserProfile }: MyPageProps) {
  // 현재 닉네임으로 input 초기값 세팅
  const [editNickname, setEditNickname] = useState(userProfile?.nickname || '');

  // 1. 프로필 업데이트 (닉네임 변경)
  const handleUpdateProfile = async () => {
    if (!currentUser) return;
    
    // profiles 테이블에 upsert (있으면 덮어쓰기, 없으면 새로 만들기)
    const { error } = await supabase.from('profiles').upsert({
      id: currentUser.id,
      nickname: editNickname,
      updated_at: new Date()
    });

    if (!error) {
      alert('프로필이 업데이트되었습니다.');
      // 변경 성공 시 상단 헤더 닉네임도 바로 바뀌도록 Map.tsx의 fetch 함수 실행
      fetchUserProfile(currentUser.id);
    } else {
      alert('프로필 수정 실패: ' + error.message);
    }
  };

  // 2. 회원탈퇴
  const handleDeleteAccount = async () => {
    if (!confirm('정말로 탈퇴하시겠습니까?\n탈퇴 시 작성한 모든 글과 댓글, 프로필 정보가 삭제되며 복구할 수 없습니다.')) return;
    if (!currentUser) return;

    try {
      // 1. 내가 작성한 댓글 모두 삭제
      await supabase.from('comments').delete().eq('user_id', currentUser.id);

      // 2. 내가 누른 추천(좋아요) 모두 삭제
      await supabase.from('post_likes').delete().eq('user_id', currentUser.id);

      // 3. 내가 작성한 게시글 모두 삭제 (게시글이 지워지면 그 글에 달린 남의 댓글도 보통 같이 지워짐)
      await supabase.from('posts').delete().eq('user_id', currentUser.id);

      // 4. 내 프로필 정보 삭제
      const { error: profileError } = await supabase.from('profiles').delete().eq('id', currentUser.id);
      
      if (profileError) throw profileError;

      // 5. 로그인 세션 삭제 (로그아웃)
      await supabase.auth.signOut();
      
      alert('회원탈퇴가 완료되었습니다. 이용해 주셔서 감사합니다.');
      setIsMyPage(false); 
      window.location.reload(); 

    } catch (error: any) {
      alert('탈퇴 처리 중 오류가 발생했습니다: ' + error.message);
    }
  };

  return (
    <div style={{ backgroundColor: '#1a1a1a', padding: '40px', borderRadius: '12px', border: '1px solid #333' }}>
      <h2 style={{ marginBottom: '30px', color: '#F2A900', fontSize: '24px', fontWeight: 'bold' }}>👤 마이페이지</h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '500px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#888', fontWeight: 'bold' }}>닉네임 변경</label>
          <input 
            type="text" 
            value={editNickname} 
            onChange={(e) => setEditNickname(e.target.value)} 
            style={{ width: '100%', padding: '12px', backgroundColor: '#252525', border: '1px solid #444', color: 'white', borderRadius: '6px', fontSize: '14px' }} 
          />
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button onClick={handleUpdateProfile} style={{ flex: 1, padding: '12px', backgroundColor: '#F2A900', border: 'none', borderRadius: '6px', fontWeight: 'bold', color: 'black', cursor: 'pointer' }}>저장하기</button>
          <button onClick={() => setIsMyPage(false)} style={{ flex: 1, padding: '12px', backgroundColor: '#333', border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer' }}>돌아가기</button>
        </div>
        
        {/* 위험 구역: 로그아웃 & 회원탈퇴 */}
        <div style={{ marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={() => { supabase.auth.signOut(); setIsMyPage(false); }} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>
                로그아웃
            </button>
            
            <button onClick={handleDeleteAccount} style={{ background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                회원탈퇴
            </button>
        </div>
      </div>
    </div>
  );
}