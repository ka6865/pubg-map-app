export type ContentPerformancePost = {
  id: string | number;
  title: string;
  category?: string | null;
  views: number;
  likes: number;
  comments: number;
  engagementRate: number;
  created_at?: string;
};

export type ContentPerformanceReport = {
  generatedAt: string;
  windowDays: number;
  totalPosts: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  averageEngagementRate: number;
  momentum: {
    score: number;
    label: "no_data" | "quiet" | "steady" | "strong";
    reason: string;
  };
  topByViews: ContentPerformancePost[];
  topByEngagement: ContentPerformancePost[];
  categories: Array<{
    category: string;
    posts: number;
    views: number;
    likes: number;
    comments: number;
    engagementRate: number;
  }>;
  lowEffortWins: string[];
  weeklyPlan: Array<{
    day: string;
    title: string;
    angle: string;
    source: string;
  }>;
  recommendations: string[];
};

export async function buildContentPerformanceReport(
  supabase: any,
  input: { days?: number; limit?: number } = {}
): Promise<ContentPerformanceReport> {
  const windowDays = Math.min(Math.max(Number(input.days || 30), 1), 180);
  const limit = Math.min(Math.max(Number(input.limit || 50), 5), 100);
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("posts")
    .select("id, title, category, views, likes, created_at, comments(count)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const posts = (data || []).map(normalizePost);
  const totalViews = posts.reduce((sum: number, post: ContentPerformancePost) => sum + post.views, 0);
  const totalLikes = posts.reduce((sum: number, post: ContentPerformancePost) => sum + post.likes, 0);
  const totalComments = posts.reduce((sum: number, post: ContentPerformancePost) => sum + post.comments, 0);
  const averageEngagementRate = totalViews ? Number((((totalLikes + totalComments) / totalViews) * 100).toFixed(2)) : 0;
  const topByViews = [...posts].sort((a, b) => b.views - a.views).slice(0, 5);
  const topByEngagement = [...posts].sort((a, b) => b.engagementRate - a.engagementRate).slice(0, 5);
  const categories = summarizeCategories(posts);
  const momentum = calculateMomentum(posts, totalViews, averageEngagementRate, windowDays);

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    totalPosts: posts.length,
    totalViews,
    totalLikes,
    totalComments,
    averageEngagementRate,
    momentum,
    topByViews,
    topByEngagement,
    categories,
    lowEffortWins: buildLowEffortWins({ posts, topByViews, topByEngagement, categories, averageEngagementRate }),
    weeklyPlan: buildWeeklyPlan({ topByViews, topByEngagement, categories }),
    recommendations: buildRecommendations(posts, averageEngagementRate, momentum)
  };
}

function normalizePost(row: any): ContentPerformancePost {
  const views = Number(row.views || 0);
  const likes = Number(row.likes || 0);
  const comments = Array.isArray(row.comments) ? Number(row.comments[0]?.count || 0) : Number(row.comments?.count || 0);
  return {
    id: row.id,
    title: row.title || "제목 없음",
    category: row.category || "미분류",
    views,
    likes,
    comments,
    engagementRate: views ? Number((((likes + comments) / views) * 100).toFixed(2)) : 0,
    created_at: row.created_at
  };
}

function summarizeCategories(posts: ContentPerformancePost[]) {
  const byCategory: Record<string, { posts: number; views: number; likes: number; comments: number }> = {};
  posts.forEach((post) => {
    const category = post.category || "미분류";
    byCategory[category] ||= { posts: 0, views: 0, likes: 0, comments: 0 };
    byCategory[category].posts += 1;
    byCategory[category].views += post.views;
    byCategory[category].likes += post.likes;
    byCategory[category].comments += post.comments;
  });

  return Object.entries(byCategory)
    .map(([category, stats]) => ({
      category,
      ...stats,
      engagementRate: stats.views ? Number((((stats.likes + stats.comments) / stats.views) * 100).toFixed(2)) : 0
    }))
    .sort((a, b) => b.views - a.views);
}

function calculateMomentum(
  posts: ContentPerformancePost[],
  totalViews: number,
  averageEngagementRate: number,
  windowDays: number
): ContentPerformanceReport["momentum"] {
  if (posts.length === 0) {
    return {
      score: 0,
      label: "no_data",
      reason: "최근 게시글 데이터가 부족합니다."
    };
  }

  const postsPerWeek = posts.length / Math.max(windowDays / 7, 1);
  const viewsPerPost = totalViews / Math.max(posts.length, 1);
  const score = Number(Math.min(100, (postsPerWeek * 12) + (viewsPerPost / 8) + (averageEngagementRate * 8)).toFixed(1));
  const label = score >= 70 ? "strong" : score >= 35 ? "steady" : "quiet";
  return {
    score,
    label,
    reason: `${posts.length}개 글, 글당 평균 조회수 ${Math.round(viewsPerPost)}회, 평균 참여율 ${averageEngagementRate}% 기준입니다.`
  };
}

function buildLowEffortWins(input: {
  posts: ContentPerformancePost[];
  topByViews: ContentPerformancePost[];
  topByEngagement: ContentPerformancePost[];
  categories: ReturnType<typeof summarizeCategories>;
  averageEngagementRate: number;
}) {
  if (input.posts.length === 0) {
    return ["이번 주 운영 브리핑이나 맵 트렌드처럼 데이터 기반 기본 콘텐츠 1건을 먼저 발행 후보로 만드세요."];
  }

  const wins = [];
  const topView = input.topByViews[0];
  const topEngagement = input.topByEngagement[0];
  const topCategory = input.categories[0];

  if (topView) wins.push(`"${topView.title}"의 후속편을 짧은 업데이트 글로 재활용하세요.`);
  if (topEngagement && topEngagement.id !== topView?.id) wins.push(`"${topEngagement.title}"처럼 댓글/좋아요를 부르는 질문형 마무리를 붙이세요.`);
  if (topCategory) wins.push(`${topCategory.category} 카테고리는 조회수 비중이 높아 이번 주 1건 더 발행할 후보입니다.`);
  if (input.averageEngagementRate < 3) wins.push("본문 마지막에 제보/질문 유도 문장을 넣어 참여율을 올리세요.");

  return Array.from(new Set(wins)).slice(0, 4);
}

function buildWeeklyPlan(input: {
  topByViews: ContentPerformancePost[];
  topByEngagement: ContentPerformancePost[];
  categories: ReturnType<typeof summarizeCategories>;
}) {
  const topView = input.topByViews[0];
  const topEngagement = input.topByEngagement[0];
  const topCategory = input.categories[0];

  return [
    {
      day: "월",
      title: topView ? `${topView.title} 후속 정리` : "이번 주 BGMS 운영 브리핑",
      angle: topView ? "조회수가 높았던 주제를 짧게 업데이트" : "API/AI/캐시 상태를 유저 친화적으로 안내",
      source: topView ? "topByViews" : "operations"
    },
    {
      day: "수",
      title: topCategory ? `${topCategory.category} 카테고리 확장 글` : "최근 맵 트렌드 요약",
      angle: topCategory ? "반응 좋은 카테고리의 시리즈화" : "맵별 플레이 흐름과 전술 포인트 제공",
      source: topCategory ? "category" : "map_stats"
    },
    {
      day: "금",
      title: topEngagement ? `${topEngagement.title} 형식 재사용` : "주말 플레이 체크 포인트",
      angle: topEngagement ? "참여율 높은 구성과 질문형 마무리 재사용" : "주말 전 유저가 바로 써먹을 팁 제공",
      source: topEngagement ? "topByEngagement" : "community"
    }
  ];
}

function buildRecommendations(
  posts: ContentPerformancePost[],
  averageEngagementRate: number,
  momentum: ContentPerformanceReport["momentum"]
) {
  if (posts.length === 0) {
    return ["최근 게시글 데이터가 부족합니다. 운영 브리핑이나 맵 트렌드 초안을 먼저 발행 후보로 검토하세요."];
  }

  const topView = [...posts].sort((a, b) => b.views - a.views)[0];
  const topEngagement = [...posts].sort((a, b) => b.engagementRate - a.engagementRate)[0];
  const recommendations = [
    `조회수 기준으로는 "${topView.title}" 유형의 후속 콘텐츠를 우선 검토하세요.`,
    `참여율 기준으로는 "${topEngagement.title}"의 구조를 재사용하면 좋습니다.`
  ];

  if (averageEngagementRate < 3) {
    recommendations.push("평균 참여율이 낮습니다. 제목을 더 구체적으로 만들고, 본문 끝에 질문/제보 유도 문장을 추가하세요.");
  } else {
    recommendations.push("참여율이 안정적입니다. 상위 글의 주제를 주간 시리즈로 이어가는 것을 추천합니다.");
  }
  if (momentum.label === "quiet") {
    recommendations.push("콘텐츠 모멘텀이 낮습니다. 이번 주는 짧은 운영 브리핑과 맵 트렌드 글을 나눠 발행해 리듬을 회복하세요.");
  } else if (momentum.label === "strong") {
    recommendations.push("콘텐츠 모멘텀이 좋습니다. 상위 반응 주제를 공지/가이드/분석 글로 2차 확장하세요.");
  }

  return recommendations;
}
