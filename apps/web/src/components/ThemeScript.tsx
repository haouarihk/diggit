export function ThemeScript() {
  const script = `
(() => {
  try {
    const preference = localStorage.getItem("diggit_theme") || "system";
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = preference === "dark" || (preference === "system" && systemDark) ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();
`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
