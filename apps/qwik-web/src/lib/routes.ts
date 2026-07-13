export function isRepositoryPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const [firstSegment] = segments;

  if (
    !firstSegment ||
    firstSegment === "admin" ||
    firstSegment === "api" ||
    firstSegment === "auth" ||
    firstSegment === "dev" ||
    firstSegment === "new" ||
    firstSegment === "oauth" ||
    firstSegment === "organizations" ||
    firstSegment === "search" ||
    firstSegment === "settings" ||
    firstSegment === "users"
  ) {
    return false;
  }

  return segments.length >= 2;
}
