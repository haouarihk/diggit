const RESERVED_LOCAL_USERNAMES = new Set([
  "activity",
  "admin",
  "auth",
  "dev",
  "new",
  "organizations",
  "repos",
  "search",
  "servers",
  "settings",
  "users",
]);

export function validateNewLocalUsername(value: string) {
  const raw = value.trim();
  const normalized = raw.toLowerCase();

  if (!raw) {
    return "Username is required.";
  }

  if (raw.startsWith(".") || raw.startsWith("_")) {
    return "Username must not start with a dot or underscore.";
  }

  if (!/^[a-z0-9_-]+$/i.test(raw)) {
    return "Username may only contain letters, numbers, dashes, and underscores.";
  }

  if (RESERVED_LOCAL_USERNAMES.has(normalized)) {
    return `${normalized} is reserved and cannot be used as a username.`;
  }

  return null;
}
