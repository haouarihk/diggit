export function organizationHref(name: string) {
  return `/organizations/${encodeURIComponent(name)}`;
}
