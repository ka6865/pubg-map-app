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

export interface Post {
  id: number;
  title: string;
  content: string;
  author: string;
  user_id: string;
  category: string;
  image_url: string;
  is_notice: boolean;
  created_at: string;
  views: number;
  likes: number;
  comment_count?: number;
  comments?: { count: number }[];
}