export const TURNSTILE_ACTIONS = {
  post: "guest_post",
  comment: "guest_comment",
} as const;

export type TurnstileAction = typeof TURNSTILE_ACTIONS[keyof typeof TURNSTILE_ACTIONS];
