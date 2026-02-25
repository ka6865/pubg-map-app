'use client';

import { useMemo, useRef } from 'react';
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

  const uploadImage = async (file: File) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const { error } = await supabase.storage.from('images').upload(fileName, file);
      if (error) throw error;
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
    input.click();

    input.onchange = async () => {
      if (!input.files) return;
      const file = input.files[0];
      const maxSize = 3 * 1024 * 1024; 

      if (file.size > maxSize) {
        alert('이미지 파일 크기는 3MB를 초과할 수 없습니다.');
        return;
      }

      const editor = quillRef.current.getEditor();
      const range = editor.getSelection(true);
      
      try {
        editor.enable(false); 
        const url = await uploadImage(file);
        
        if (url) {
          editor.insertEmbed(range.index, 'image', url); 
          editor.setSelection(range.index + 1); 
        }
      } catch (e) {
        console.error(e);
      } finally {
        editor.enable(true); 
      }
    };
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
        
        {/* 💡 [수정] maxLength={50} 을 추가해서 타자 입력을 물리적으로 막았습니다! */}
        <input 
          type="text" 
          placeholder="제목을 입력하세요 (최대 50자)" 
          value={newTitle} 
          onChange={(e) => setNewTitle(e.target.value)} 
          maxLength={50} 
          style={{ flex: 1, padding: '10px', backgroundColor: '#252525', color: 'white', border: '1px solid #333', borderRadius: '4px', fontSize: '16px' }} 
        />
      </div>
      
      <div style={{ marginBottom: '50px', backgroundColor: 'white', color: 'black', borderRadius: '4px', overflow: 'hidden' }}>
        <ReactQuill ref={quillRef} theme="snow" value={newContent} onChange={setNewContent} modules={modules} style={{ height: '350px' }} />
      </div>
      
      {isAdmin ? (
        <label style={{ display: 'flex', gap: '8px', marginBottom: '20px', color: '#F2A900' }}>
          <input type="checkbox" checked={newIsNotice} onChange={(e) => setNewIsNotice(e.target.checked)} /> 공지사항
        </label>
      ) : null}
      
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button onClick={() => setIsWriting(false)} style={{ padding: '10px 20px', backgroundColor: '#333', color: '#ccc', borderRadius: '4px', border: 'none', cursor: 'pointer' }}>취소</button>
        <button onClick={handleSavePost} disabled={isLoading} style={{ padding: '10px 30px', backgroundColor: '#F2A900', color: 'black', fontWeight: 'bold', borderRadius: '4px', border: 'none', cursor: 'pointer' }}>
          {isLoading ? '등록 중...' : '등록하기'}
        </button>
      </div>
    </div>
  );
}