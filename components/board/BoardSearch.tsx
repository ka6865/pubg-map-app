import React from 'react';
import { Search } from 'lucide-react';

interface BoardSearchProps {
  searchOption: string;
  setSearchOption: (val: string) => void;
  searchInput: string;
  setSearchInput: (val: string) => void;
  onSearch: (e: React.FormEvent) => void;
}

export default function BoardSearch({
  searchOption,
  setSearchOption,
  searchInput,
  setSearchInput,
  onSearch
}: BoardSearchProps) {
  return (
    <form onSubmit={onSearch} className="flex gap-1.5 w-full md:w-auto mt-2 md:mt-0">
      <select
        value={searchOption}
        onChange={(e) => setSearchOption(e.target.value)}
        className="px-2.5 py-2 bg-[#1f1f1f] border border-white/10 rounded-lg text-xs text-white/60 outline-none shrink-0"
      >
        <option value="all">제목+내용</option>
        <option value="title">제목</option>
        <option value="author">글쓴이</option>
      </select>
      <div className="flex flex-1 bg-[#1f1f1f] border border-white/10 rounded-lg items-center pl-2.5 pr-1 focus-within:border-white/30 transition-all">
        <Search size={13} className="text-white/30 shrink-0" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="검색..."
          className="bg-transparent border-none p-2 text-[13px] text-white w-full outline-none"
        />
        <button type="submit" className="bg-transparent border-none text-white/40 hover:text-white font-bold text-xs px-2 whitespace-nowrap cursor-pointer transition-colors">
          검색
        </button>
      </div>
    </form>
  );
}
