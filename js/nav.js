/*
   NYAYSETU - NAV INJECTOR
   Call injectNav() in each page's <body>
*/

function injectNav() {
  const inPages = window.location.pathname.includes('/pages/');
  const homeHref = inPages ? '../index.html' : 'index.html';
  const pageHref = (file) => inPages ? file : `pages/${file}`;
  const user = typeof getStoredUser === 'function' ? getStoredUser() : null;
  const dashboardLink = user && user.role === 'student'
    ? `<a class="nav-tab" href="${pageHref('dashboard.html')}" data-page="dashboard"><span class="nav-icon"></span> <span data-i18n="nav_dashboard">Dashboard</span></a>`
    : user && user.role === 'lawyer'
      ? `<a class="nav-tab" href="${pageHref('lawyer-dashboard.html')}" data-page="lawyer-dashboard"><span class="nav-icon"></span> Dashboard</a>`
      : '';

  const nav = `
  <nav id="nav">
    <div class="nav-inner">
      <a href="${homeHref}" class="nav-logo">
        <div class="nav-logo-box">N</div>
        <span class="nav-logo-name">NyaySetu</span>
      </a>
      <div class="nav-tabs">
        <a class="nav-tab" href="${homeHref}" data-page="home"><span class="nav-icon">🏠</span> <span data-i18n="nav_home">Home</span></a>
        <a class="nav-tab" href="${pageHref('chat.html')}" data-page="chat"><span class="nav-icon">⚖️</span> <span data-i18n="nav_chat">AI Chat</span></a>
        <a class="nav-tab mobile-only-nav-item" href="${pageHref('chat.html')}"><span class="nav-icon">💡</span> <span data-i18n="nav_ask">Ask a Question</span></a>
        <a class="nav-tab" href="${pageHref('documents.html')}" data-page="docs"><span class="nav-icon">📄</span> <span data-i18n="nav_docs">Documents</span></a>
        <a class="nav-tab" href="${pageHref('simplifier.html')}" data-page="simplify"><span class="nav-icon">📚</span> <span data-i18n="nav_simplify">Simplifier</span></a>
        <a class="nav-tab" href="${pageHref('students.html')}" data-page="students"><span class="nav-icon">🎓</span> <span data-i18n="nav_students">Students</span></a>
        <a class="nav-tab" href="${pageHref('lawyers.html')}" data-page="lawyers"><span class="nav-icon">⚖️</span> <span data-i18n="nav_lawyers">Lawyers</span></a>
        <a class="nav-tab" href="${pageHref('legal-help.html')}" data-page="legal-help"><span class="nav-icon">🛡️</span> Get Legal Help</a>
        <a class="nav-tab" href="${pageHref('about.html')}" data-page="about"><span class="nav-icon">ℹ️</span> <span data-i18n="footer_about">About Us</span></a>
        ${dashboardLink}
        <button class="nav-tab mobile-only-nav-item" onclick="toggleTheme()" style="margin-top: auto; border-top: 1px solid var(--border); padding-top: 16px; border-radius: 0; justify-content: flex-start; border-bottom:none; background:transparent;"><span class="nav-icon">☀/☽</span> Toggle Theme</button>
        <div id="auth-nav-slot-menu" class="mobile-only-nav-item" style="width: 100%; margin-top: 8px;"></div>
      </div>
      <div class="nav-right">
        <div class="nav-lang">${typeof getLangSelectHTML === 'function' ? getLangSelectHTML() : ''}</div>
        <button class="nav-icon-btn" id="theme-btn" onclick="toggleTheme()" title="Toggle theme">&#9728;</button>
        <a href="${pageHref('chat.html')}" class="btn-nav" data-i18n="nav_ask">Ask a Question</a>
        <span id="auth-nav-slot"></span>
      </div>
    </div>
  </nav>
  <div id="toast"><span id="toast-icon">&#10003;</span><span id="toast-msg"></span></div>`;

  document.body.insertAdjacentHTML('afterbegin', nav);
  initTheme();
  setActiveNav();
  if (typeof initMobileNav === 'function') initMobileNav();
}
