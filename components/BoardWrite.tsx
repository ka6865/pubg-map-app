'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import 'react-quill-new/dist/quill.snow.css';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false }) as any;

const BOARD_CATEGORIES = ['자유', '듀오/스쿼드 모집', '클럽홍보', '제보/문의'];

interface BoardWriteProps {
  newTitle: string;
  setNewTitle: (title: string) => void;
  newContent: string;
  setNewContent: (content: string) => void;
  newCategory: string;
  setNewCategory: (category: string) => void;
  newIsNotice: boolean;
  setNewIsNotice: (isNotice: boolean) => void;
  handleSavePost: () => void;
  setIsWriting: (isWriting: boolean) => void;
  isAdmin: boolean;
  isLoading: boolean;
  isMobile: boolean;
  quillRef: React.RefObject<any>;
  imageHandler: () => void;
}

export default function BoardWrite({
  newTitle, setNewTitle, newContent, setNewContent, newCategory, setNewCategory,
  newIsNotice, setNewIsNotice, handleSavePost, setIsWriting, isAdmin, isLoading,
  isMobile, quillRef, imageHandler
}: BoardWriteProps) {

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
  }), [imageHandler]);

  return (
    <div style={{ backgroundColor: '#1a1a1a', padding: isMobile ? '15px' : '30px', borderRadius: '8px', border: '1px solid #333' }}>
      <h2 style={{ marginBottom: '20px', color: '#F2A900', fontSize: '20px', fontWeight: 'bold' }}>새 게시글 작성</h2>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px', marginBottom: '15px' }}>
        <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} style={{ padding: '10px', backgroundColor: '#252525', color: 'white', border: '1px solid #333', borderRadius: '4px' }}>{BOARD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
        <input type="text" placeholder="제목을 입력하세요" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} style={{ flex: 1, padding: '10px', backgroundColor: '#252525', color: 'white', border: '1px solid #333', borderRadius: '4px', fontSize: '16px' }} />
      </div>
      <div style={{ marginBottom: '50px', backgroundColor: 'white', color: 'black', borderRadius: '4px', overflow: 'hidden' }}>
        <ReactQuill ref={quillRef} theme="snow" value={newContent} onChange={setNewContent} modules={modules} style={{ height: '350px' }} />
      </div>
      {isAdmin && <label style={{ display: 'flex', gap: '8px', marginBottom: '20px', color: '#F2A900' }}><input type="checkbox" checked={newIsNotice} onChange={(e) => setNewIsNotice(e.target.checked)} /> 공지사항</label>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button onClick={() => setIsWriting(false)} style={{ padding: '10px 20px', backgroundColor: '#333', color: '#ccc', borderRadius: '4px' }}>취소</button>
        <button onClick={handleSavePost} disabled={isLoading} style={{ padding: '10px 30px', backgroundColor: '#F2A900', color: 'black', fontWeight: 'bold', borderRadius: '4px' }}>{isLoading ? '등록 중...' : '등록하기'}</button>
      </div>
    </div>
  );
}
