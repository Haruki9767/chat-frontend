(() => {
  try {
    const theme = localStorage.getItem('theme');
    const font = localStorage.getItem('font');
    if (theme && theme !== 'default') document.documentElement.setAttribute('data-theme', theme);
    if (font && font !== 'default') document.documentElement.setAttribute('data-font', font);
  } catch {}
})();
