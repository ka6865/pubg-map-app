'use client';

import { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '../lib/supabase';
import 'react-quill-new/dist/quill.snow.css';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false }) as any;

const BOARD_CATEGORIES = ['자유', '듀오/스쿼드 모집', '클럽홍보', '제보/문의'];

interface BoardWriteProps {
  newTitle: string; setNewTitle: (title: string) => void;
  newContent: string; setNewContent: (content: string) => void;
  newCategory: string; setNewCategory: (category: string) => void;
  newIsNotice: boolean; setNewIsNotice: (isNotice: boolean) => void;
  handleSavePost: () => void; setIsWriting: (isWriting: boolean) => void;
  isAdmin: boolean; isLoading: boolean; isMobile: boolean;
}

export default function BoardWrite({
  newTitle, setNewTitle, newContent, setNewContent, newCategory, setNewCategory,
  newIsNotice, setNewIsNotice, handleSavePost, setIsWriting, isAdmin, isLoading, isMobile
}: BoardWriteProps) {

  const quillRef = useRef<any>(null);
  const uploadedImagesRef = useRef<string[]>([]);
  
  // 💡 [추가] 사진이 업로드되는 동안 화면을 가려줄 로딩 상태
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const uploadImage = async (file: File) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const { error } = await supabase.storage.from('images').upload(fileName, file);
      if (error) throw error;
      
      uploadedImagesRef.current.push(fileName);
      const { data } = supabase.storage.from('images').getPublicUrl(fileName);
      return data.publicUrl;
    } catch (error: any) {
      alert(`이미지 업로드 실패: ${error.message}`);
      return null;
    }
  };

  const imageHandler = () => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    
    // 💡 [핵심 수정 1] 브라우저가 몰래 삭제하지 못하도록 화면(DOM)에 강제로 붙여둠!
    document.body.appendChild(input); 
    input.click();

    input.onchange = async () => {
      if (!input.files || input.files.length === 0) {
        document.body.removeChild(input); // 취소하면 다시 떼어냄
        return;
      }
      
      const file = input.files[0];
      const maxSize = 3 * 1024 * 1024; 

      if (file.size > maxSize) {
        alert('이미지 파일 크기는 3MB 초과할 수 없습니다.');
        document.body.removeChild(input);
        return;
      }

      const editor = quillRef.current.getEditor();
      const range = editor.getSelection(true) || { index: editor.getLength() };
      
      try {
        setIsUploadingImage(true); // 로딩 화면 ON!
        editor.enable(false); // 업로드 중에는 글씨 못 쓰게 막기
        
        const url = await uploadImage(file);
        
        if (url) {
          editor.insertEmbed(range.index, 'image', url); 
          editor.setSelection(range.index + 1); 
        }
      } catch (e) {
        console.error('🚨 에디터 이미지 삽입 에러:', e);
      } finally {
        editor.enable(true); 
        setIsUploadingImage(false); // 로딩 화면 OFF!
        document.body.removeChild(input); // 다 썼으니 화면에서 떼어냄
      }
    };
  };

  const handleCancel = async () => {
    try {
      if (uploadedImagesRef.current.length > 0) {
        const { data, error } = await supabase.storage.from('images').remove(uploadedImagesRef.current);
        if (error) {
          console.error('🚨 스토리지 삭제 실패:', error);
          alert(`스토리지 삭제 권한 에러: ${error.message}\n(Supabase Storage RLS 정책을 확인해주세요)`);
        }
      }
    } catch (err) {
      console.error('🚨 예기치 못한 에러:', err);
    } finally {
      setNewTitle('');
      setNewContent('');
      setIsWriting(false); 
    }
  };

  const modules = useMemo(() => ({
    toolbar: {
      container: [
        [{ 'header': [1, 2, false] }],
        ['bold', 'italic', 'underline', 'strike', 'blockquote'],
        [{'list': 'ordered'}, {'list': 'bullet'}],
        ['link', 'image'],
        ['clean']
      ],
      handlers: { image: imageHandler }
    }
  }), []);

  return (
    <div style={{ backgroundColor: '#1a1a1a', padding: isMobile ? '15px' : '30px', borderRadius: '8px', border: '1px solid #333' }}>
      <h2 style={{ marginBottom: '20px', color: '#F2A900', fontSize: '20px', fontWeight: 'bold' }}>새 게시글 작성</h2>
      
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px', marginBottom: '15px' }}>
        <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} style={{ padding: '10px', backgroundColor: '#252525', color: 'white', border: '1px solid #333', borderRadius: '4px' }}>
          {BOARD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        
        <input 
          type="text" 
          placeholder="제목을 입력하세요 (최대 50자)" 
          value={newTitle} 
          onChange={(e) => setNewTitle(e.target.value)} 
          maxLength={50} 
          style={{ flex: 1, padding: '10px', backgroundColor: '#252525', color: 'white', border: '1px solid #333', borderRadius: '4px', fontSize: '16px' }} 
        />
      </div>
      
      <div className="quill-wrapper" style={{ marginBottom: '50px', backgroundColor: 'white', color: 'black', borderRadius: '4px', position: 'relative' }}>
        <style>{`
          .quill-wrapper .ql-toolbar {
            position: sticky;
            top: 0;
            z-index: 1000;
            background-color: #f3f4f6;
            border-top-left-radius: 4px;
            border-top-right-radius: 4px;
          }
          .quill-wrapper .ql-container {
            min-height: 350px;
            max-height: 50vh;
            overflow-y: auto;
            border-bottom-left-radius: 4px;
            border-bottom-right-radius: 4px;
            font-size: 16px;
          }
        `}</style>

        {/* 💡 [추가] 이미지가 올라가는 동안 화면을 불투명하게 덮는 로딩 바 */}
        {isUploadingImage && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px', fontWeight: 'bold', color: '#F2A900', borderRadius: '4px'
          }}>
            📷 이미지를 서버에 업로드 중입니다...
          </div>
        )}
        
        <ReactQuill 
          ref={quillRef} 
          theme="snow" 
          value={newContent} 
          onChange={setNewContent} 
          modules={modules} 
        />
      </div>
      
      {isAdmin ? (
        <label style={{ display: 'flex', gap: '8px', marginBottom: '20px', color: '#F2A900' }}>
          <input type="checkbox" checked={newIsNotice} onChange={(e) => setNewIsNotice(e.target.checked)} /> 공지사항
        </label>
      ) : null}
      
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button onClick={handleCancel} style={{ padding: '10px 20px', backgroundColor: '#333', color: '#ccc', borderRadius: '4px', border: 'none', cursor: 'pointer' }}>취소</button>
        <button onClick={handleSavePost} disabled={isLoading} style={{ padding: '10px 30px', backgroundColor: '#F2A900', color: 'black', fontWeight: 'bold', borderRadius: '4px', border: 'none', cursor: 'pointer' }}>
          {isLoading ? '등록 중...' : '등록하기'}
        </button>
      </div>
    </div>
  );
}