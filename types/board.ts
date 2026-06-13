// 게시글 및 하위 댓글 데이터 구조 타입 명세 인터페이스

export interface Comment {
  id: number;
  post_id: number;
  user_id: string;
  author: string;
  content: string;
  created_at: string;
  parent_id: number | null;
}

export interface ClanInfo {
  id: string;
  name: string;
  tag: string;
  level: number;
  memberCount: number;
}

export interface Post {
  id: number;
  title: string;
  content: string;
  author: string;
  user_id: string;
  category: string;
  image_url: string;
  discord_url?: string; // 🌟 디스코드 채널 링크 필드 추가
  discord_channel_id?: string; // 🌟 디스코드 채널 ID 추가 (자동 삭제용)
  is_notice: boolean;
  created_at: string;
  views: number;
  likes: number;
  comment_count?: number;
  comments?: { count: number }[];
  clan_info?: ClanInfo | null; // 🌟 클랜 정보 첨부 필드 추가
  status?: "published" | "draft"; // 🌟 게시글 상태 ('published' 또는 'draft')
  parent_id?: number | null; // 🌟 Shadow Draft 구조에서 참조할 원본 게시글 ID
}