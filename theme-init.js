(() => {
  try {
    const saved = window.localStorage.getItem('drd:theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.dataset.theme = saved;
    }
  } catch {
    return;
  }
})();
