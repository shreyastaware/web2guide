// Keep older saved guides usable. New fields are additive; checklist keys stay stable.
export const STAGES = ['Prepare', 'Create', 'Configure', 'Test', 'Launch'];
export const APPROVAL_STATUSES = ['Required', 'Not Required', 'Conditional', 'Unknown'];
const list = value => Array.isArray(value) ? value : [];
export const isSafeLink = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
};
export function difficultyLabel(value) {
  if (value === 'Easy' || value === 'Moderate') return value;
  if (/^Hard\b/.test(value || '') || value === 'Advanced') return 'Advanced';
  return 'Unknown';
}
export function approvalLabel(guide) {
  return APPROVAL_STATUSES.includes(guide.approvalStatus) ? guide.approvalStatus : 'Unknown';
}
// Engineering estimates are shown only when they read as a short duration, never as documented times.
export function shortDuration(value) {
  const text = String(value || '').replace(/[,;]?\s*estimate[ds]?$/i, '').trim();
  return text.length <= 40 && /\d|minute|hour|day|week/i.test(text) && !/^unknown/i.test(text) ? text : '';
}
const OWNERS = {Human: 'You', Agent: 'Agent', 'Human + agent': 'Agent + you'};
// Every guide shows a time. Documented durations win; otherwise these typical ranges fill the gap and are labeled estimates.
const STAGE_TIME = {Prepare: '10–20 min', Create: '10–20 min', Configure: '15–30 min', Test: '30–60 min', Launch: '30–60 min'};
const DIFFICULTY_TIME = {Easy: '30–60 min', Moderate: '1–3 h', Advanced: '3–6 h', Unknown: '1–4 h'};
const WAIT_TIME = {Required: '2–6 wks', Conditional: '0–2 wks', Unknown: '1–4 wks'};
const leadingRange = value => value.match(/^[\d.]+(?:\s*[–-]\s*[\d.]+)?\s*(?:min|minutes?|h|hours?|days?|business days|wks?|weeks?)\b/i)?.[0] || value;
// Ranges are collapsed to their midpoint so every guide shows one exact number.
const UNIT_DEFAULT = {min: 15, h: 2, day: 3, week: 2};
export function exactTime(value) {
  const text = String(value || '');
  const word = text.match(/\b(min(?:ute)?s?|h|hrs?|hours?|days?|wks?|weeks?)\b/i)?.[1].toLowerCase();
  if (!word) return text;
  const unit = word.startsWith('min') ? 'min' : word.startsWith('h') ? 'h' : word.startsWith('d') ? 'day' : 'week';
  const numbers = (text.match(/\d+(?:\.\d+)?/g) || []).map(Number).slice(0, 2);
  const amount = numbers.length ? numbers.reduce((sum, number) => sum + number, 0) / numbers.length : UNIT_DEFAULT[unit];
  if (unit === 'day' || unit === 'week') { const count = Math.max(1, Math.round(amount)); return `${count} ${unit}${count === 1 ? '' : 's'}`; }
  const minutes = Math.max(5, Math.round((unit === 'h' ? amount * 60 : amount) / 5) * 5);
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return hours ? `${hours} h${rest ? ` ${rest} min` : ''}` : `${rest} min`;
}
// Library summaries carry no sources, so they use the same estimate a guide shows when no setup time is documented.
export const summaryTime = raw => exactTime(leadingRange(shortDuration(raw.effort)) || DIFFICULTY_TIME[difficultyLabel(raw.difficulty)]);
export const TIME_BUCKETS = [{id: 'quick', label: '⚡ Under 1 h'}, {id: 'hours', label: '🕐 1–3 h'}, {id: 'long', label: '🐢 3 h+'}];
export function timeBucket(time) {
  const units = {min: 1 / 60, h: 1, day: 8, week: 40};
  const hours = [...String(time).matchAll(/(\d+(?:\.\d+)?)\s*(min|h|day|week)/g)].reduce((sum, [, number, unit]) => sum + Number(number) * units[unit], 0);
  return hours <= 1 ? 'quick' : hours <= 3 ? 'hours' : 'long';
}
function inferStage(step) {
  if (STAGES.includes(step.stage)) return step.stage;
  const title = String(step.title || '').toLowerCase();
  if (/submit|review|publish|marketplace|distribut|go live|launch/.test(title)) return 'Launch';
  if (/test|verif|authoriz|exchange|implement|build/.test(title)) return 'Test';
  if (/configur|redirect|scope|permission|capabilit/.test(title) && !/create|register/.test(title)) return 'Configure';
  if (/create|register/.test(title)) return 'Create';
  return 'Prepare';
}
export function guideModel(raw) {
  const sources = list(raw.sources).filter(source => source && isSafeLink(source.url));
  const sourceIds = new Set(sources.map(source => source.id));
  const cited = ids => list(ids).filter(id => sourceIds.has(id));
  const steps = list(raw.steps).filter(Boolean).map((step, index) => ({
    ...step, index, key: step.id || String(index), stage: inferStage(step),
    title: step.title || 'Review the provider instructions',
    instructions: list(step.instructions).filter(text => typeof text === 'string' && text.trim()).length
      ? step.instructions.filter(text => typeof text === 'string' && text.trim())
      : [step.detail || 'Check the linked provider instructions before continuing.'],
    values: list(step.values).filter(value => value && typeof value.value === 'string'),
    blockers: list(step.blockers).filter(Boolean), goalIds: list(step.goalIds),
    sourceIds: cited(step.sourceIds),
    where: {label: step.where?.label || 'Provider documentation', url: isSafeLink(step.where?.url) ? step.where.url : ''},
    verify: step.verify || 'This saved guide does not specify a success check. Confirm the result in the linked provider documentation.',
    owner: OWNERS[step.owner] || 'You', time: exactTime(shortDuration(step.time) || STAGE_TIME[inferStage(step)]),
  }));
  const goals = list(raw.goals).filter(goal => goal && typeof goal.id === 'string' && goal.label).map(goal => ({
    ...goal,
    approvalStatus: cited(goal.sourceIds).length && APPROVAL_STATUSES.includes(goal.approvalStatus) ? goal.approvalStatus : 'Unknown',
    reviewWait: cited(goal.reviewSourceIds).length ? goal.reviewWait || 'Unknown' : 'Unknown',
    sourceIds: cited(goal.sourceIds), reviewSourceIds: cited(goal.reviewSourceIds),
  }));
  return {
    ...raw, name: raw.name || 'OAuth integration', sources, steps, goals,
    description: raw.description || String(raw.summary || '').split(/(?<=[.!?])\s/)[0] || 'Set up an OAuth connection for this application.',
    requirements: list(raw.requirements).filter(Boolean), blockers: list(raw.blockers).filter(Boolean),
    branches: list(raw.branches).filter(Boolean), unknowns: list(raw.unknowns),
    agentCan: list(raw.agentCan).filter(text => typeof text === 'string' && text.trim()),
    humanMust: list(raw.humanMust).filter(text => typeof text === 'string' && text.trim()),
    effortEstimate: leadingRange(shortDuration(raw.effort)),
    timeEstimate: exactTime((cited(raw.setupTimeSourceIds).length && shortDuration(raw.setupTime)) || leadingRange(shortDuration(raw.effort)) || DIFFICULTY_TIME[difficultyLabel(raw.difficulty)]),
    difficulty: difficultyLabel(raw.difficulty),
    difficultyNote: difficultyLabel(raw.difficulty) === 'Unknown' ? raw.difficulty || 'Not documented' : '',
    approvalStatus: cited(raw.approvalSourceIds).length ? approvalLabel(raw) : 'Unknown',
    setupTime: cited(raw.setupTimeSourceIds).length ? raw.setupTime || 'Unknown' : 'Unknown',
    reviewWait: cited(raw.reviewSourceIds).length ? raw.reviewWait || 'Unknown' : 'Unknown',
    approvalSourceIds: cited(raw.approvalSourceIds), reviewSourceIds: cited(raw.reviewSourceIds),
  };
}
export function selectedPath(guide, goalId) {
  const goal = guide.goals.find(item => item.id === goalId) || guide.goals[0];
  return {
    goal,
    steps: STAGES.flatMap(stage => guide.steps.filter(step => step.stage === stage && (!step.goalIds.length || !goal || step.goalIds.includes(goal.id)))),
    approvalStatus: goal?.approvalStatus || guide.approvalStatus,
    approval: goal?.approval || guide.approval || 'Approval requirements have not been verified. Check the provider rules before distribution.',
    reviewWait: goal?.reviewWait || guide.reviewWait,
    sourceIds: goal?.sourceIds || guide.approvalSourceIds,
    reviewSourceIds: goal?.reviewSourceIds || guide.reviewSourceIds,
  };
}
export function waitEstimate(guide, path) {
  if (path.approvalStatus === 'Not Required') return '';
  return exactTime(shortDuration(path.goal?.reviewEstimate || guide.reviewEstimate) || leadingRange(shortDuration(path.reviewWait)) || WAIT_TIME[path.approvalStatus] || WAIT_TIME.Unknown);
}
export function completedSteps(steps, saved) {
  return steps.filter(step => list(saved).some(key => String(key) === step.key));
}
export function validateQuery(value) {
  const query = String(value || '').trim();
  if (query.length < 2 || query.length > 140 || !/[\p{L}\p{N}]/u.test(query) || /[<>\n\r]/.test(query)) return 'Enter an app name or website, using 2–140 characters.';
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(query)) {
    try { const url = new URL(query); if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) throw Error(); } catch { return 'Enter a valid website, such as https://linear.app.'; }
  }
  return '';
}
