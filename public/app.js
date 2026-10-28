import {STAGES, TIME_BUCKETS, guideModel, selectedPath, completedSteps, waitEstimate, summaryTime, timeBucket, difficultyLabel, approvalLabel, isSafeLink, validateQuery} from './guide-model.js';

const root = document.querySelector('#root');
const state = {
  page: 'generator', slug: '', guide: null, guides: [], listStatus: 'loading', enabled: null,
  query: '', search: '', filters: {time: '', difficulty: '', approval: ''}, working: false, activity: '', error: '', sidebar: false,
  goalId: '', openStep: '', progress: {}, preferences: {}, toast: '', storageError: false,
};
// Retain the original storage key so existing checklists survive the product rename.
try {
  const saved = JSON.parse(localStorage.getItem('authpath_checklists') || '{}');
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) state.progress = saved;
  const preferences = JSON.parse(localStorage.getItem('web2guide_goals') || '{}');
  if (preferences && typeof preferences === 'object' && !Array.isArray(preferences)) state.preferences = preferences;
} catch { /* Storage may be unavailable; the checklist still works for this visit. */ }
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
const icons = {
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', external: '<path d="M14 4h6v6m-9 3 9-9M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', book: '<path d="M4 4h6a2 2 0 0 1 2 2v14a3 3 0 0 0-3-2H4zm16 0h-6a2 2 0 0 0-2 2v14a3 3 0 0 1 3-2h5z"/>',
  check: '<path d="m5 12 4 4L19 6"/>', chevron: '<path d="m9 5 7 7-7 7"/>', down: '<path d="m6 9 6 6 6-6"/>', left: '<path d="m14 6-6 6 6 6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18"/>',
};
const icon = (name, size = 18) => `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.info}</svg>`;
const link = (url, label, className = '') => isSafeLink(url) ? `<a class="${className}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ${icon('external', 13)}</a>` : esc(label);
const safeTone = value => /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value || '') ? value : '';
const providerIcon = guide => `<span class="provider-icon" aria-hidden="true" ${safeTone(guide.tone) ? `style="--tone:${guide.tone}"` : ''}>${esc(guide.icon || guide.name?.slice(0, 2) || '?')}</span>`;
const APPROVAL_LABEL = {'Not Required':'✅ Not needed', Conditional:'🤔 Depends', Required:'🛂 Required', Unknown:'🤷 Unclear'};
const DIFFICULTY_LABEL = {Easy:'😌 Easy', Moderate:'🤏 Moderate', Advanced:'😤 Advanced', Unknown:'🤷 Unclear'};
const approvalClass = status => ({Required:'conditional', Conditional:'conditional', 'Not Required':'clear'})[status] || 'unknown';
function persist(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { state.storageError = true; }
}
function route(path) {
  history.pushState(null, '', path);
  resolve();
  window.scrollTo(0, 0);
  document.querySelector('h1')?.focus({preventScroll:true});
}
let guideRequest = 0;
function resolve() {
  const path = location.pathname;
  state.page = path.startsWith('/guides/') ? 'guide' : path === '/guides' || path === '/guides/' ? 'library' : 'generator';
  state.sidebar = false;
  state.toast = '';
  if (state.page === 'guide') {
    try { state.slug = decodeURIComponent(path.slice(8)); } catch { state.slug = ''; }
    loadGuide(state.slug);
  } else { guideRequest++; render(); }
}
async function loadGuide(slug) {
  const request = ++guideRequest;
  state.guide = null;
  render();
  try {
    const response = await fetch('/api/guides/' + encodeURIComponent(slug));
    if (request !== guideRequest) return;
    if (!response.ok) { state.guide = response.status === 404 ? 'missing' : 'error'; render(); return; }
    const raw = await response.json();
    if (request !== guideRequest) return;
    state.guide = guideModel(raw);
    state.goalId = state.preferences[slug] || state.guide.goals[0]?.id || '';
    const path = selectedPath(state.guide, state.goalId);
    const done = completedSteps(path.steps, state.progress[slug]);
    state.openStep = path.steps.find(step => !done.includes(step))?.key || path.steps[0]?.key || '';
  } catch { if (request !== guideRequest) return; state.guide = 'error'; }
  render();
}
async function loadList() {
  state.listStatus = 'loading';
  try {
    const response = await fetch('/api/guides');
    if (!response.ok) throw Error();
    const guides = await response.json();
    if (!Array.isArray(guides)) throw Error();
    state.guides = guides;
    state.listStatus = 'ready';
  } catch { state.listStatus = 'error'; }
  render();
}
function layout(content) {
  const library = state.page !== 'generator';
  return `<a class="skip-link" href="#main-content">Skip to content</a>
  <div class="app-shell">
    <aside class="sidebar ${state.sidebar ? 'open' : ''}" id="sidebar" aria-label="Main navigation" ${state.sidebar ? 'role="dialog" aria-modal="true"' : ''}>
      <a class="brand" href="/" data-route="/" aria-label="Web2Guide home"><span>Web2Guide</span></a>
      <button class="icon-button mobile-close" data-action="sidebar-close" aria-label="Close navigation">${icon('close')}</button>
      <nav class="primary-nav" aria-label="Sections">
        <a href="/" data-route="/" ${!library ? 'aria-current="page"' : ''}>${icon('plus')}<span>Web 2 Guide Generator</span></a>
        <a href="/guides" data-route="/guides" ${library ? 'aria-current="page"' : ''}>${icon('book')}<span>Checkout Generated Guides</span></a>
      </nav>
    </aside>
    ${state.sidebar ? '<button class="mobile-backdrop" data-action="sidebar-close" aria-label="Close navigation" tabindex="-1"></button>' : ''}
    <div class="main-area" ${state.sidebar ? 'inert' : ''}>
      <header class="topbar"><button class="icon-button menu-toggle" data-action="sidebar-open" aria-label="Open navigation" aria-expanded="${state.sidebar}" aria-controls="sidebar">${icon('menu')}</button><span>${state.page === 'generator' ? 'Guide generator' : state.page === 'library' ? 'Generated guides' : `Generated guides <span class="breadcrumb-divider">/</span> <span class="breadcrumb-current">${esc(state.guide?.name || 'Guide')}</span>`}</span></header>
      <main id="main-content" tabindex="-1" class="content ${state.page}">${content}</main>
    </div>
  </div><div class="toast ${state.toast ? 'visible' : ''}" role="status" aria-live="polite">${esc(state.toast)}</div>`;
}
function generatorPage() {
  return `<section class="generator-content" aria-labelledby="generator-title">
    <h1 id="generator-title" tabindex="-1">OAuth setup,<br class="desktop-break"> <span>minus the pain 😮‍💨</span></h1>
    <p class="page-description">Drop an app name or URL → get the steps, the time, and the approval tea ☕</p>
    <form id="generate-form" class="generate-form" aria-busy="${state.working}" novalidate>
      <label for="app-query">App name or website</label>
      <div class="generate-input-row ${state.error ? 'invalid' : ''}"><div class="input-with-icon">${icon('globe',20)}<input id="app-query" name="query" type="text" placeholder="Slack, linear.app, literally any app…" value="${esc(state.query)}" maxlength="140" required autocomplete="off" spellcheck="false" ${state.working ? 'disabled' : ''} ${state.error ? 'aria-invalid="true" aria-describedby="generation-error"' : ''}></div><button type="submit" class="button primary" ${state.working ? 'disabled' : ''}>${state.working ? '<span class="spinner"></span> Generating…' : `Generate ✨`}</button></div>
      ${state.error ? `<div class="message error-message" id="generation-error" role="alert">${icon('info')}<div>${esc(state.error)}</div></div>` : ''}
      ${state.working ? `<div class="generation-status" role="status" aria-live="polite"><span class="spinner"></span><div><strong>${esc(state.activity || 'Cooking your guide… 🍳')}</strong><p>Reading the docs so you don’t have to. Takes about a minute ⏳</p></div></div>` : ''}
      ${state.enabled === false && !state.error && !state.working ? '<p class="availability-note">New guide generation is currently unavailable. You can still open saved apps.</p>' : ''}
    </form>
  </section>`;
}
function libraryResults() {
  if (state.listStatus === 'loading') return `<div class="list-state" role="status"><span class="spinner"></span><p>Loading your guides…</p></div>`;
  if (state.listStatus === 'error') return `<div class="list-state"><h2>We couldn’t load the guides</h2><p>Check your connection and try again.</p><button class="button secondary" data-action="retry-list">Try again</button></div>`;
  const {time, difficulty, approval} = state.filters;
  const filtering = state.search || time || difficulty || approval;
  const guides = state.guides.filter(guide => `${guide.name} ${guide.summary} ${guide.description || ''}`.toLowerCase().includes(state.search.trim().toLowerCase())
    && (!time || timeBucket(summaryTime(guide)) === time) && (!difficulty || difficultyLabel(guide.difficulty) === difficulty) && (!approval || approvalLabel(guide) === approval)).sort((a,b) => String(b.updated || '').localeCompare(String(a.updated || '')) || a.name.localeCompare(b.name));
  if (!guides.length) return `<div class="list-state">${icon(filtering ? 'search' : 'book',28)}<h2>${filtering ? 'Nothing matches 👀' : 'No guides yet 👀'}</h2><p>${filtering ? 'Loosen the filters or generate a fresh one.' : 'Drop an app name and get your first guide.'}</p>${filtering ? '<button class="button secondary" data-action="clear-search">Clear filters</button>' : ''}<a class="button ${filtering ? 'text-button' : 'primary'}" href="/" data-route="/">Generate a guide ${icon('arrow',16)}</a></div>`;
  return `<div class="library-table"><div class="library-table-head" aria-hidden="true"><span>APP</span><span>SETUP</span><span>COMPLEXITY</span><span>APPROVAL</span><span></span></div>${guides.map(guide => `<a class="guide-row" href="/guides/${encodeURIComponent(guide.slug)}" data-route="/guides/${encodeURIComponent(guide.slug)}" aria-label="View ${esc(guide.name)} guide"><div class="guide-row-app">${providerIcon(guide)}<div><h2>${esc(guide.name)}</h2><p>${esc(guide.description || String(guide.summary || '').split(/(?<=[.!?])\s/)[0] || 'OAuth setup and approval guide.')}</p></div></div><div class="row-time"><span class="mobile-label">Setup</span>~${esc(summaryTime(guide))}</div><div class="row-difficulty"><span class="mobile-label">Complexity</span>${DIFFICULTY_LABEL[difficultyLabel(guide.difficulty)]}</div><div class="row-approval"><span class="mobile-label">Approval</span><span class="approval-indicator ${approvalClass(approvalLabel(guide))}">${APPROVAL_LABEL[approvalLabel(guide)]}</span></div><span class="row-arrow" aria-hidden="true">${icon('arrow',19)}</span></a>`).join('')}</div><p class="result-count" role="status">${guides.length} ${guides.length === 1 ? 'guide' : 'guides'}${filtering ? ' match' : ''}</p>`;
}
function filterSelect(name, label, anyLabel, options) {
  return `<label class="filter ${state.filters[name] ? 'active' : ''}"><span class="sr-only">${label}</span><select id="filter-${name}" data-filter="${name}"><option value="">${anyLabel}</option>${options.map(([value,text]) => `<option value="${esc(value)}" ${state.filters[name] === value ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
}
function libraryPage() {
  return `<section class="library-content"><div class="page-heading"><h1 tabindex="-1">Your guides 📚</h1><p class="page-description">Find your app. Pick up where you left off.</p></div><div class="library-toolbar"><label class="search-field" for="guide-search">${icon('search')}<input type="search" id="guide-search" placeholder="Search apps…" value="${esc(state.search)}" autocomplete="off"><span class="sr-only">Search guides</span></label>${filterSelect('time','Setup time','⏱ Any setup time',TIME_BUCKETS.map(bucket => [bucket.id,bucket.label]))}${filterSelect('difficulty','Complexity','🧠 Any complexity',Object.entries(DIFFICULTY_LABEL))}${filterSelect('approval','Approval','🛂 Any approval',Object.entries(APPROVAL_LABEL))}</div><div id="library-results">${libraryResults()}</div></section>`;
}
const OWNER_LABEL = {You:'🙋 You', Agent:'🤖 Agent', 'Agent + you':'🤝 Agent + you'};
const shortWhere = label => String(label || '').split('→').pop().trim() || 'dashboard';
function stepCard(step, number, guide, done) {
  const isDone = done.includes(step);
  const open = state.openStep === step.key;
  const key = `step-${step.index}`;
  const whereUrl = step.where.url || guide.sources.find(source => step.sourceIds.includes(source.id))?.url;
  return `<li class="step ${isDone ? 'is-complete' : ''} ${open ? 'is-open' : ''}" id="${key}">
    <div class="step-row"><input type="checkbox" class="step-checkbox" data-n="${number}" data-check="${esc(step.key)}" ${isDone ? 'checked' : ''} aria-label="Mark ${esc(step.title)} ${isDone ? 'not done' : 'done'}"><h3><button class="step-toggle" id="toggle-${key}" data-open-step="${esc(step.key)}" aria-expanded="${open}" aria-controls="detail-${key}"><span>${esc(step.title)}</span><small class="step-meta">${esc(OWNER_LABEL[step.owner] || step.owner)} · ⏱ ${esc(step.time)}</small></button></h3></div>
    <div class="step-body" id="detail-${key}" role="region" aria-labelledby="toggle-${key}" ${open ? '' : 'hidden'}>
      <ul class="actions">${step.instructions.map(action => `<li>${esc(action)}</li>`).join('')}</ul>
      ${step.values.map((value,index) => `<div class="config-value"><div><span>${esc(value.label || 'Value')}</span><code>${esc(value.value)}</code></div><button class="icon-button" data-copy-value="${index}" data-copy-step="${step.index}" aria-label="Copy ${esc(value.label || 'value')}">${icon('copy',16)}</button></div>`).join('')}
      ${step.warning ? `<p class="heads-up">⚠️ <strong>Heads up:</strong> ${esc(step.warning)}</p>` : ''}
      <p class="done-when">✅ <strong>Done when:</strong> ${esc(step.verify)}</p>
      ${step.blockers.length ? `<details class="stuck" id="blockers-${key}"><summary>😵 Stuck?</summary><ul>${step.blockers.map(blocker => `<li><strong>${esc(blocker.problem)}</strong> → ${esc(blocker.solution)}</li>`).join('')}</ul></details>` : ''}
      <div class="step-actions">${isSafeLink(whereUrl) ? `<a class="button secondary" href="${esc(whereUrl)}" target="_blank" rel="noopener noreferrer">Open ${esc(shortWhere(step.where.label))} ${icon('external',14)}</a>` : ''}<button class="button primary" data-complete="${esc(step.key)}">${isDone ? 'Next step' : 'Done, next'} ${icon('arrow',15)}</button></div>
    </div>
  </li>`;
}
function guidePage(guide) {
  if (!guide) return '<div class="list-state" role="status"><span class="spinner"></span><p>Loading your guide…</p></div>';
  if (typeof guide === 'string') return `<div class="list-state"><h1 tabindex="-1">${guide === 'missing' ? 'Guide not found 👀' : 'Couldn’t load this guide 😵'}</h1><p>${guide === 'missing' ? 'Check the link or grab one from the library.' : 'Check your connection and try again.'}</p>${guide === 'error' ? '<button class="button secondary" data-action="retry-guide">Try again</button>' : ''}<a class="button text-button" href="/guides" data-route="/guides">Browse guides ${icon('arrow',16)}</a></div>`;
  const path = selectedPath(guide, state.goalId);
  const done = completedSteps(path.steps,state.progress[guide.slug]);
  const percent = path.steps.length ? Math.round(done.length / path.steps.length * 100) : 0;
  const wait = waitEstimate(guide, path);
  const needs = guide.requirements.filter(item => !item.goalIds?.length || !path.goal || item.goalIds.includes(path.goal.id)).slice(0,3);
  const approval = APPROVAL_LABEL[path.approvalStatus] || APPROVAL_LABEL.Unknown;
  return `<div class="guide-content">
    <div class="guide-topline"><a href="/guides" data-route="/guides" class="back-link">${icon('left',15)} All guides</a><div class="guide-tools"><button class="text-button" data-action="copy-link">${icon('copy',15)} Copy link</button><button class="text-button" data-action="export">${icon('download',15)} Export</button></div></div>
    <header class="guide-heading"><div class="guide-title">${providerIcon(guide)}<h1 tabindex="-1">${esc(guide.name)}</h1></div><p class="guide-description">${esc(guide.description)}</p></header>
    ${guide.goals.length > 1 ? `<div class="goal-question"><label for="guide-goal">🎯 I want to</label><select id="guide-goal">${guide.goals.map(goal => `<option value="${esc(goal.id)}" ${goal.id === path.goal?.id ? 'selected' : ''}>${esc(goal.label)}</option>`).join('')}</select></div>` : ''}
    <dl class="stats">
      <div><dt>⏱ Setup time</dt><dd>~${esc(guide.timeEstimate)}</dd><span>est. hands-on</span></div>
      <div><dt>🛂 Approval</dt><dd class="approval-${approvalClass(path.approvalStatus)}">${approval}</dd><span>${wait ? `~${esc(wait)} wait (est.)` : 'zero waiting, no cap'}</span></div>
      <div><dt>🧠 Difficulty</dt><dd>${esc(guide.difficulty === 'Unknown' && guide.difficultyNote ? `🤔 ${guide.difficultyNote}` : DIFFICULTY_LABEL[guide.difficulty])}</dd></div>
    </dl>
    ${needs.length ? `<div class="needs"><strong>🎒 You’ll need</strong><ul>${needs.map(item => `<li>${esc(item.title)}</li>`).join('')}</ul></div>` : ''}
    <section class="steps" aria-labelledby="steps-heading">
      <div class="steps-head"><h2 id="steps-heading">${path.steps.length && done.length === path.steps.length ? 'All done 🎉 go ship it' : 'The steps 👇'}</h2><span>${done.length}/${path.steps.length} done</span></div>
      <div class="progress-track" role="progressbar" aria-label="Progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><div style="width:${percent}%"></div></div>
      ${state.storageError ? '<p class="message" role="status">Browser storage is off, so progress only lasts this visit.</p>' : ''}
      ${path.steps.length ? `<ol class="stepper">${path.steps.map((step,index) => stepCard(step,index + 1,guide,done)).join('')}</ol>` : '<div class="message">No steps saved for this one. Check the sources below 👇</div>'}
    </section>
    <section class="references-section" aria-label="Troubleshooting and sources">
      <details class="advanced-section" id="troubleshooting"><summary><strong>🛠 Troubleshooting</strong>${icon('plus',18)}</summary><ul class="fixes">${guide.blockers.filter(item => !item.goalIds?.length || !path.goal || item.goalIds.includes(path.goal.id)).map(blocker => `<li><strong>${esc(blocker.problem)}</strong> → ${esc(blocker.solution)}</li>`).join('')}${commonBlockers()}</ul></details>
      <details class="advanced-section" id="references"><summary><strong>📎 Sources</strong>${icon('plus',18)}</summary><ul class="fixes">${guide.sources.map(source => `<li>${link(source.url,source.title)}</li>`).join('') || '<li>No source links for this one.</li>'}<li class="muted">${esc(guide.type || 'Docs only')} · times are estimates · double-check before launch</li></ul></details>
    </section>
  </div>`;
}
function commonBlockers() {
  return `<li><strong>Redirect URI mismatch</strong> → make the callback URL match exactly: protocol, host, path, port, trailing slash.</li><li><strong>Invalid client credentials</strong> → use the ID + secret from the same app. Secret stays on your server.</li><li><strong>Missing scopes</strong> → add the scope, then reconnect the test account.</li>`;
}
let renderedContext = '';
function render() {
  const active = document.activeElement;
  const focusId = active?.id;
  const selection = active instanceof HTMLInputElement && ['text','search'].includes(active.type) ? [active.selectionStart, active.selectionEnd] : null;
  const context = `${state.page}:${state.slug}`;
  const detailsOpen = renderedContext === context ? [...root.querySelectorAll('details[open][id]')].map(element => element.id) : [];
  renderedContext = context;
  root.innerHTML = layout(state.page === 'generator' ? generatorPage() : state.page === 'library' ? libraryPage() : guidePage(state.guide));
  for (const id of detailsOpen) document.getElementById(id)?.setAttribute('open','');
  document.body.classList.toggle('nav-open',state.sidebar);
  if (focusId) {
    const element = document.getElementById(focusId);
    element?.focus({preventScroll:true});
    if (selection && element && !element.disabled) element.setSelectionRange(...selection);
  }
  const name = state.page === 'guide' && state.guide?.name ? `${state.guide.name} OAuth Setup` : state.page === 'library' ? 'Generated Guides' : 'Generate an OAuth Setup Guide';
  document.title = `${name} — Web2Guide`;
}
let toastTimer;
function toast(message) {
  state.toast = message;
  const element = document.querySelector('.toast');
  if (element) { element.textContent = message; element.classList.add('visible'); }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.toast = ''; document.querySelector('.toast')?.classList.remove('visible'); },3000);
}
async function copyText(value) {
  try { if (!navigator.clipboard) throw Error(); await navigator.clipboard.writeText(value); toast('Copied 📋'); }
  catch { toast('Couldn’t copy. Select and copy the text manually.'); }
}
function markStep(key, checked) {
  const guide = state.guide;
  const saved = Array.isArray(state.progress[guide.slug]) ? state.progress[guide.slug] : [];
  const filtered = saved.filter(value => String(value) !== key);
  state.progress[guide.slug] = checked ? [...filtered, /^\d+$/.test(key) ? Number(key) : key] : filtered;
  persist('authpath_checklists',state.progress);
}
function markdown(guide) {
  const path = selectedPath(guide,state.goalId);
  return [`# ${guide.name} OAuth Setup Guide`, `Generated with Web2Guide · Updated ${guide.updated || 'Unknown'}${guide.type ? ` · ${guide.type}` : ''}`, '', guide.description,
    `\n## Quick overview\n- Setup time: ~${guide.timeEstimate} (est.)\n- Difficulty: ${guide.difficulty}\n- Provider approval: ${path.approvalStatus}\n- Review wait: ${waitEstimate(guide,path) ? `~${waitEstimate(guide,path)} (est.)` : 'None'}\n\n${path.approval}`,
    path.goal ? `\nSelected use: ${path.goal.label}` : '',
    guide.agentCan.length ? `\n## An agent can\n${guide.agentCan.map(item => `- ${item}`).join('\n')}` : '', guide.humanMust.length ? `\n## You need to\n${guide.humanMust.map(item => `- ${item}`).join('\n')}` : '', '\n## Prerequisites', ...guide.requirements.filter(item => !item.goalIds?.length || !path.goal || item.goalIds.includes(path.goal.id)).map(item => `- **${item.title}** — ${item.detail}`),
    ...STAGES.flatMap(stage => { const steps=path.steps.filter(step => step.stage === stage); return !steps.length ? [] : [`\n## ${stage}`, ...steps.map(step => [`\n### ${step.title}`, step.owner || step.time ? `_${[step.owner, step.time].filter(Boolean).join(' · ')}_` : '', `Where: ${step.where.label}${step.where.url ? ` (${step.where.url})` : ''}`, ...step.instructions.map((action,index) => `${index+1}. ${action}`), ...step.values.map(value => `\n${value.label}:\n\`\`\`\n${value.value}\n\`\`\``), `\nVerify: ${step.verify}`, step.warning ? `\nNote: ${step.warning}` : '', ...step.blockers.map(blocker => `- ${blocker.problem}: ${blocker.solution}`), ...step.sourceIds.map(id => {const source=guide.sources.find(source=>source.id===id); return source ? `Source: ${source.title} — ${source.url}` : '';})].join('\n'))]; }),
    '\n## Troubleshooting', ...guide.blockers.map(blocker=>`- **${blocker.problem}** — ${blocker.solution}`), '\n## Open questions', ...guide.unknowns.map(item=>`- ${item}`), '\n## Official references', ...guide.sources.map(source=>`- ${source.title}: ${source.url} (${source.status})`), '\nChecklist completion does not confirm distribution eligibility or provider approval.'
  ].join('\n');
}
root.addEventListener('click', async event => {
  const element = event.target.closest('[data-route],[data-action],[data-open-step],[data-complete],[data-copy-value]');
  if (!element) return;
  if (element.dataset.route) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button) return;
    event.preventDefault(); route(element.dataset.route); return;
  }
  if (element.dataset.openStep !== undefined) { state.openStep = state.openStep === element.dataset.openStep ? '' : element.dataset.openStep; render(); return; }
  if (element.dataset.complete !== undefined) {
    const path = selectedPath(state.guide,state.goalId);
    markStep(element.dataset.complete,true);
    const index = path.steps.findIndex(step => step.key === element.dataset.complete);
    const done = completedSteps(path.steps,state.progress[state.guide.slug]);
    const next = [...path.steps.slice(index+1),...path.steps.slice(0,index)].find(step => !done.includes(step));
    state.openStep = next?.key || '';
    render();
    if (next) document.querySelector(`#toggle-step-${next.index}`)?.focus(); else toast('All done 🎉 double-check approval in the provider dashboard');
    return;
  }
  if (element.dataset.copyValue !== undefined) { const value = state.guide.steps.find(step=>step.index===Number(element.dataset.copyStep))?.values[Number(element.dataset.copyValue)]; if(value) await copyText(value.value); return; }
  switch(element.dataset.action) {
    case 'sidebar-open': state.sidebar = true; render(); document.querySelector('.mobile-close')?.focus(); break;
    case 'sidebar-close': state.sidebar = false; render(); document.querySelector('.menu-toggle')?.focus(); break;
    case 'retry-list': loadList(); break;
    case 'retry-guide': loadGuide(state.slug); break;
    case 'clear-search': state.search = ''; state.filters = {time: '', difficulty: '', approval: ''}; render(); document.querySelector('#guide-search')?.focus(); break;
    case 'copy-link': await copyText(location.href); break;
    case 'export': {
      const url = URL.createObjectURL(new Blob([markdown(state.guide)],{type:'text/markdown;charset=utf-8'}));
      const anchor = document.createElement('a'); anchor.href=url; anchor.download=state.guide.slug+'-oauth-guide.md'; anchor.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); break;
    }
  }
});
root.addEventListener('input', event => {
  if (event.target.id === 'app-query') state.query = event.target.value;
  if (event.target.id === 'guide-search') { state.search=event.target.value; render(); }
});
root.addEventListener('change', event => {
  if (event.target.dataset.filter) { state.filters[event.target.dataset.filter] = event.target.value; render(); return; }
  if (event.target.dataset.check !== undefined) { markStep(event.target.dataset.check,event.target.checked); render(); }
  if (event.target.id === 'guide-goal') {
    state.goalId = event.target.value;
    state.preferences[state.guide.slug] = state.goalId;
    persist('web2guide_goals',state.preferences);
    const path = selectedPath(state.guide,state.goalId);
    const done = completedSteps(path.steps,state.progress[state.guide.slug]);
    state.openStep = path.steps.find(step => !done.includes(step))?.key || path.steps[0]?.key || '';
    render();
  }
});
root.addEventListener('keydown', event => {
  if (!state.sidebar) return;
  if (event.key === 'Escape') { state.sidebar=false; render(); document.querySelector('.menu-toggle')?.focus(); }
  if (event.key === 'Tab') {
    const focusable=[...root.querySelectorAll('.sidebar a,.sidebar button')].filter(element=>element.getClientRects().length);
    const first=focusable[0], last=focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
function existingGuide(query) {
  const needle = query.toLowerCase().trim().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/$/,'');
  return state.guides.find(guide => {
    let hostname = ''; try { hostname = new URL(guide.website).hostname.replace(/^www\./,''); } catch {}
    return [guide.name.toLowerCase(),guide.slug,hostname,...(guide.aliases || [])].includes(needle);
  });
}
function generationMessage(message) {
  if (/structur|plan/i.test(message)) return 'Organizing your setup checklist…';
  if (/citation|unknown|check/i.test(message)) return 'Checking sources and approval requirements…';
  return 'Reading the provider’s documentation…';
}
async function generate() {
  if (state.working) return;
  state.error = validateQuery(state.query);
  if (state.error) { render(); document.querySelector('#app-query')?.focus(); return; }
  const query = state.query.trim();
  state.working = true; state.activity = 'Cooking your guide… 🍳'; render();
  let controller;
  let timeout;
  try {
    if (state.listStatus !== 'ready') await loadList();
    const existing = existingGuide(query);
    if (existing) { route('/guides/'+encodeURIComponent(existing.slug)); return; }
    if (state.enabled === false) throw Error('unavailable');
    controller = new AbortController();
    timeout = setTimeout(()=>controller.abort(),150000);
    const response = await fetch('/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query}),signal:controller.signal});
    if (!response.ok) throw Error(response.status===429 ? 'limit' : response.status===400 ? 'invalid' : 'generation');
    if (!response.body) throw Error('connection');
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer='', complete=false;
    while (!complete) {
      const {value,done}=await reader.read();
      if (done) break;
      buffer+=decoder.decode(value,{stream:true});
      const chunks=buffer.replace(/\r\n/g,'\n').split('\n\n'); buffer=chunks.pop() || '';
      for (const chunk of chunks) {
        const type=chunk.match(/(?:^|\n)event: ([^\n]+)/)?.[1];
        const raw=chunk.match(/(?:^|\n)data: ([^\n]+)/)?.[1];
        if (!type || !raw) continue;
        let data; try {data=JSON.parse(raw);}catch{continue;}
        if (type==='step') { state.activity=generationMessage(data.message); render(); }
        if (type==='error') throw Error('generation');
        if (type==='complete' && typeof data.slug==='string' && data.slug) {
          complete=true; await reader.cancel(); await loadList(); route('/guides/'+encodeURIComponent(data.slug)); break;
        }
      }
    }
    if (!complete) throw Error('connection');
  } catch (error) {
    state.error = ({unavailable:'New guide generation is currently unavailable. Try a saved app or browse generated guides.',limit:'You’ve reached the generation limit. Try again in an hour, or open a saved guide.',invalid:'We couldn’t recognize that app. Enter an app name or a full website URL.'})[error.message] || (error.name==='AbortError' ? 'Generation took too long. Please try again.' : 'We couldn’t generate this guide. Check the app name and try again. Saved guides are still available.');
  } finally {clearTimeout(timeout); state.working=false; render();}
}
root.addEventListener('submit',event=>{if(event.target.id==='generate-form'){event.preventDefault();generate();}});
window.addEventListener('popstate',resolve);
window.matchMedia('(max-width: 760px)').addEventListener('change',event=>{if(!event.matches && state.sidebar){state.sidebar=false;render();}});
resolve();
loadList();
fetch('/api/health').then(response=>response.ok?response.json():Promise.reject()).then(health=>{state.enabled=health.researchEnabled;render();}).catch(()=>{state.enabled=null;});
