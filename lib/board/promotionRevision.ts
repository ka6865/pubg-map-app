export function resolvePromoteExpectedParentRevision(
  post: { parent_id: number | null; revision: unknown },
  parent: { revision: unknown } | null,
  parentError: unknown,
): number | null {
  const isValidRevision = (value: unknown): value is number => (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
  );
  if (post.parent_id === null) return isValidRevision(post.revision) ? post.revision : null;
  return parentError || !parent || !isValidRevision(parent.revision) ? null : parent.revision;
}
