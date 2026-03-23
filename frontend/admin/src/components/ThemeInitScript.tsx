import Script from 'next/script';

const INIT = `
(function(){
  try {
    var raw = localStorage.getItem('admin-theme');
    if (!raw) { document.documentElement.classList.remove('dark'); return; }
    var parsed = JSON.parse(raw);
    var t = parsed && parsed.state && parsed.state.theme;
    if (t === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  } catch (e) {
    document.documentElement.classList.remove('dark');
  }
})();
`;

/** Runs before paint to match persisted theme (zustand persist key: admin-theme). */
export default function ThemeInitScript() {
  return <Script id="admin-theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: INIT }} />;
}
