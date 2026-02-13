'use client';

import { useState } from 'react';
import { supabase } from '../lib/supabase';

interface MyPageProps {
  currentUser: any;                      // 현재 로그인한 유저 객체
  userProfile: any;                      // profiles 테이블 정보
  setIsMyPage: (v: boolean) => void;     // 마이페이지 닫기
  fetchUserProfile: (id: string) => void;// 정보 갱신 함수
}

export default function MyPage({ currentUser, userProfile, setIsMyPage, fetchUserProfile }: MyPageProps) {
  // 닉네임 수정 상태 관리
  const [editNickname, setEditNickname] = useState(userProfile?.nickname || '');

  // 🌟 1. 닉네임 수정 핸들러
  const handleUpdateProfile = async () => {
    if (!currentUser) return;
    
    const { error } = await supabase.from('profiles').upsert({
      id: currentUser.id,
      nickname: editNickname,
      updated_at: new Date()
    });

    if (!error) {
      alert('프로필이 업데이트되었습니다.');
      fetchUserProfile(currentUser.id);
    } else {
      alert('프로필 수정 실패: ' + error.message);
    }
  };

  // 🌟 2. 회원탈퇴 핸들러
  const handleDeleteAccount = async () => {
    if (!confirm('정말로 탈퇴하시겠습니까?\n탈퇴 시 프로필 정보가 삭제되며 복구할 수 없습니다.')) return;

    if (!currentUser) return;

    // 1) 프로필 데이터 삭제 (auth.users 삭제는 보안상 서버단 처리가 필요하므로, 여기선 데이터 삭제로 갈음)
    const { error } = await supabase.from('profiles').delete().eq('id', currentUser.id);

    if (error) {
      alert('탈퇴 처리 중 오류가 발생했습니다: ' + error.message);
      return;
    }

    // 2) 로그아웃 처리
    await supabase.auth.signOut();
    
    alert('회원탈퇴가 완료되었습니다.');
    setIsMyPage(false); // 마이페이지 닫기 (메인으로 이동)
    window.location.reload(); // 상태 초기화를 위해 새로고침
  };

  return (
    <div style={{ backgroundColor: '#1a1a1a', padding: '40px', borderRadius: '12px', border: '1px solid #333' }}>
      <h2 style={{ marginBottom: '30px', color: '#F2A900', fontSize: '24px', fontWeight: 'bold' }}>👤 마이페이지</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '500px' }}>
        
        {/* 닉네임 수정 입력 필드 */}
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#888', fontWeight: 'bold' }}>닉네임 변경</label>
          <input 
            type="text" 
            value={editNickname} 
            onChange={(e) => setEditNickname(e.target.value)} 
            style={{ width: '100%', padding: '12px', backgroundColor: '#252525', border: '1px solid #444', color: 'white', borderRadius: '6px', fontSize: '14px' }} 
          />
        </div>

        {/* 저장 및 돌아가기 버튼 */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button onClick={handleUpdateProfile} style={{ flex: 1, padding: '12px', backgroundColor: '#F2A900', border: 'none', borderRadius: '6px', fontWeight: 'bold', color: 'black', cursor: 'pointer' }}>저장하기</button>
          <button onClick={() => setIsMyPage(false)} style={{ flex: 1, padding: '12px', backgroundColor: '#333', border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer' }}>돌아가기</button>
        </div>
        
        {/* 하단 계정 관리 (로그아웃 / 회원탈퇴) */}
        <div style={{ marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={() => { supabase.auth.signOut(); setIsMyPage(false); }} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>
                로그아웃
            </button>
            
            {/* 🌟 회원탈퇴 버튼 */}
            <button onClick={handleDeleteAccount} style={{ background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                회원탈퇴
            </button>
        </div>

      </div>
    </div>
  );
}