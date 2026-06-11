export interface CategoryRow {
  id: string;
  label: string;
  color: string;
  icon_id: string;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
}

export type CategoryInfoMap = Record<string, {
  label: string;
  color: string;
  path: string;
  iconType: string;
}>;
