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
  isEditing?: boolean;
}

export default function BoardWrite({
  newTitle, setNewTitle, newContent, setNewContent, newCategory, setNewCategory,
  newIsNotice, setNewIsNotice, handleSavePost, setIsWriting, isAdmin, isLoading, isMobile, isEditing
}: BoardWriteProps) {

  // 에디터 Ref 및 업로드된 이미지 추적 Ref
  const quillRef = useRef<any>(null);
  const uploadedImagesRef = useRef<string[]>([]);
  
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // 이미지 파일을 스토리지에 업로드하고 URL 반환
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

  // 에디터 이미지 버튼 핸들러 (커스텀 업로드 로직)
  const imageHandler = () => {
    const existingInputs = document.querySelectorAll('.quill-image-input');
    existingInputs.forEach(el => el.remove());

    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.classList.add('quill-image-input'); 
    
    input.style.display = 'none'; 
    input.style.position = 'absolute';
    input.style.left = '-9999px';

    document.body.appendChild(input); 
    input.click();

    input.onchange = async () => {
      if (!input.files || input.files.length === 0) {
        if (document.body.contains(input)) document.body.removeChild(input); 
        return;
      }
      
      const file = input.files[0];
      const maxSize = 3 * 1024 * 1024; 

      if (file.size > maxSize) {
        alert('이미지 파일 크기는 3MB를 초과할 수 없습니다.');
        if (document.body.contains(input)) document.body.removeChild(input);
        return;
      }

      const editor = quillRef.current.getEditor();
      const range = editor.getSelection(true) || { index: editor.getLength() };
      
      try {
        setIsUploadingImage(true); 
        editor.enable(false); 
        
        const url = await uploadImage(file);
        
        if (url) {
          editor.insertEmbed(range.index, 'image', url); 
          editor.setSelection(range.index + 1); 
        } else {
          alert('이미지 업로드에 실패했습니다. 네트워크 상태를 확인해 주세요.');
        }
      } catch (e) {
        console.error('🚨 에디터 이미지 삽입 에러:', e);
        alert('이미지 처리 중 예기치 못한 오류가 발생했습니다.');
      } finally {
        editor.enable(true); 
        setIsUploadingImage(false); 
        
        if (document.body.contains(input)) {
          document.body.removeChild(input); 
        }
      }
    };
  };

  // 작성 취소 핸들러 (작성 중이던 이미지 정리)
  const handleCancel = async () => {
    try {
      // 새로 쓴 글에서 취소할 때만 임시 업로드된 이미지를 지웁니다!
      if (!isEditing && uploadedImagesRef.current.length > 0) {
        const { error } = await supabase.storage.from('images').remove(uploadedImagesRef.current);
        if (error) console.error('🚨 스토리지 삭제 실패:', error);
      }
    } catch (err) {
      console.error('🚨 예기치 못한 에러:', err);
    } finally {
      setNewTitle('');
      setNewContent('');
      setIsWriting(false); 
    }
  };

  // Quill 에디터 모듈 설정 (툴바 등)
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
      
      {/* isEditing 값에 따라 제목이 바뀜 */}
      <h2 style={{ marginBottom: '20px', color: '#F2A900', fontSize: '20px', fontWeight: 'bold' }}>
        {isEditing ? '게시글 수정' : '새 게시글 작성'}
      </h2>
      
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
          {isLoading ? '처리 중...' : (isEditing ? '수정하기' : '등록하기')}
        </button>
      </div>

    </div>
  );
}