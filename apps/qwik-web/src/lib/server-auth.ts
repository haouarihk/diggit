export const AUTH_TOKEN_COOKIE_KEY = "diggit_token";

type CookieStoreLike = {
  get(name: string): { value: string } | null | undefined;
};

export function authTokenFromCookie(cookie: CookieStoreLike) {
  return cookie.get(AUTH_TOKEN_COOKIE_KEY)?.value ?? null;
}
