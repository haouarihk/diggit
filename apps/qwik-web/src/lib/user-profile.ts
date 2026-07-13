export function userProfileHref(username: string) {
  return `/${encodeURIComponent(username)}`;
}
