import React from 'react';
import Link from 'next/link';
import { Image, MessageCircle } from 'lucide-react';
import { Post } from '@/types/board';

const ImageIcon = () => (
  <Image size={13} className="text-emerald-400 ml-[5px] shrink-0 inline-block" aria-label="이미지 포함" />
);

interface PostItemProps {
  post: Post;
  isMobile: boolean;
  onClickDesktop: () => void;
  formatTimeAgo: (dateString: string) => string;
}

export default function PostItem({ post, isMobile, onClickDesktop, formatTimeAgo }: PostItemProps) {
  if (isMobile) {
    return (
      <li className={`border-b border-white/5 ${post.is_notice ? "bg-[#F2A900]/5" : ""}`}>
        <Link href={`/board/${post.id}`} className="flex flex-col gap-1.5 p-3.5 px-4 active:bg-white/5">
          <div className="flex justify-between items-center">
            <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded ${post.is_notice ? 'text-[#F2A900] bg-[#F2A900]/10' : 'text-white/30 bg-white/5'}`}>
              {post.is_notice ? "📢 공지" : post.category}
            </span>
            <span className="text-[11px] text-white/30">{formatTimeAgo(post.created_at)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className={`text-sm break-all ${post.is_notice ? "text-[#F2A900] font-bold" : "text-white/90 font-medium"}`}>
              {post.title}
            </span>
            {post.image_url && <ImageIcon />}
            {(post.comment_count || 0) > 0 && (
              <span className="text-[11px] text-white/40 ml-1 flex items-center gap-0.5">
                <MessageCircle size={11} /> {post.comment_count}
              </span>
            )}
          </div>
          <div className="flex justify-between text-[11px] text-white/30 truncate">
            <span>{post.author}</span>
            <span>조회 {post.views} · 추천 {post.likes}</span>
          </div>
        </Link>
      </li>
    );
  }

  return (
    <tr 
      className={`border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer ${post.is_notice ? "bg-[#F2A900]/5" : ""}`} 
      onClick={onClickDesktop}
    >
      <td className={`p-3 pl-4 border-l-2 ${post.is_notice ? 'border-[#F2A900]' : 'border-transparent'}`}>
        <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded ${post.is_notice ? 'text-[#F2A900] bg-[#F2A900]/10' : 'text-white/30 bg-white/5'}`}>
          {post.is_notice ? "공지" : post.category}
        </span>
      </td>
      <td className="p-3">
        <div className="flex items-center gap-1">
          <span className={`${post.is_notice ? "text-[#F2A900] font-bold" : "text-white/90 font-medium"}`}>
            {post.title}
          </span>
          {post.image_url && <ImageIcon />}
          {(post.comment_count || 0) > 0 && (
            <span className="text-[11px] text-white/40 ml-1 flex items-center gap-0.5">
              <MessageCircle size={11} /> {post.comment_count}
            </span>
          )}
        </div>
      </td>
      <td className="p-3 text-white/40 whitespace-nowrap">{post.author}</td>
      <td className="p-3 text-white/30 whitespace-nowrap text-xs">{formatTimeAgo(post.created_at)}</td>
      <td className="p-3 text-white/30">{post.views}</td>
      <td className={`p-3 ${post.likes >= 5 ? 'font-bold' : ''}`}>
        <span className={post.likes >= 5 ? "text-[#F2A900] bg-[#F2A900]/10 px-2 py-0.5 rounded" : "text-white/30"}>
          {post.likes}
        </span>
      </td>
    </tr>
  );
}
