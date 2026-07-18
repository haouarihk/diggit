/*
 * WHAT IS THIS FILE?
 *
 * It's the bundle entry point for `npm run preview`.
 * That is, serving your app built in production mode.
 *
 * Feel free to modify this file, but don't remove it!
 *
 * Learn more about Vite's preview command:
 * - https://vitejs.dev/config/preview-options.html#preview-options
 *
 */
import { createQwikCity } from "@builder.io/qwik-city/middleware/node";
import qwikCityPlan from "@qwik-city-plan";
// make sure qwikCityPlan is imported before entry
import render from "./entry.ssr";

/**
 * The default export is the QwikCity adapter used by Vite preview.
 */
export default createQwikCity({
  render,
  qwikCityPlan,
  // Diggit proxies GitLab-compatible POST endpoints like /oauth/token through
  // Qwik. External OAuth clients such as Dokploy do not send a browser Origin
  // header, so Qwik City's built-in origin check would reject the request
  // before the proxy route can forward it to the API.
  checkOrigin: false,
});
