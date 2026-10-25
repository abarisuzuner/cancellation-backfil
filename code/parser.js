// Deliberately local and rule-based: no model inference or network requests.
const dayPatterns = [/\bsun(?:day)?s?\b/i, /\bmon(?:day)?s?\b/i, /\btue(?:sday)?s?\b/i, /\bwed(?:nesday)?s?\b/i, /\bthu(?:rsday)?s?\b/i, /\bfri(?:day)?s?\b/i, /\bsat(?:urday)?s?\b/i];
const numberWords = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

export function parsePreferences(note) {
  let text = note.toLowerCase().trim().replace(/[–—]/g, '-').replace(/\b(an?|one) hour\b/g, '1 hour');
  for (const [word, number] of Object.entries(numberWords)) text = text.replace(new RegExp(`\\b${word}\\b`, 'g'), String(number));
  const draft = {};
  const warnings = [];
  if (!text) return { draft, warnings: ['Enter a scheduling note, or use the manual fields below.'] };
  const days = dayPatterns.flatMap((pattern, i) => pattern.test(text) ? [i] : []);
  if (/\bweekdays\b/.test(text)) days.push(1, 2, 3, 4, 5);
  if (/\bweekends\b/.test(text)) days.push(0, 6);
  if (/\bevery day\b|\bdaily\b/.test(text)) days.push(0, 1, 2, 3, 4, 5, 6);
  // Negation and day ranges need human interpretation; do not silently invert availability.
  const complexDays = /\b(except|not|never|but|only if|unless)\b/.test(text) || /(?:mon|tue|wed|thu|fri|sat|sun)\w*\s*(?:-|through|to)\s*(?:mon|tue|wed|thu|fri|sat|sun)/.test(text);
  if (days.length && !complexDays) draft.days = [...new Set(days)].sort();
  else warnings.push(complexDays ? 'Please select the available days manually; this note contains a range or exception.' : 'Choose the available days below.');
  const pattern = /(?:between\s+|from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:and|to|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/g;
  const ranges = [...text.matchAll(pattern)];
  if (ranges.length === 1 && !complexDays) {
    const match = ranges[0];
    let h1 = Number(match[1]), h2 = Number(match[4]);
    const m1 = Number(match[2] || 0), m2 = Number(match[5] || 0);
    let suffix1 = match[3], suffix2 = match[6];
    if (/\b(afternoon|evening)\b/.test(text)) { suffix1 ||= 'pm'; suffix2 ||= 'pm'; }
    else if (/\bmorning\b/.test(text)) { suffix1 ||= 'am'; suffix2 ||= 'am'; }
    if (!suffix1 && suffix2 && h1 <= h2) suffix1 = suffix2;
    const ambiguous = (!suffix1 && !suffix2 && h1 <= 12 && h2 <= 12 && !match[2] && !match[5]) || (!suffix1 && !!suffix2);
    const valid = h1 < 24 && h2 < 24 && m1 < 60 && m2 < 60 && (!suffix1 || (h1 >= 1 && h1 <= 12)) && (!suffix2 || (h2 >= 1 && h2 <= 12));
    if (suffix1) h1 = h1 % 12 + (suffix1 === 'pm' ? 12 : 0);
    if (suffix2) h2 = h2 % 12 + (suffix2 === 'pm' ? 12 : 0);
    if (!ambiguous && valid && h1 * 60 + m1 < h2 * 60 + m2) { draft.from = h1 * 60 + m1; draft.to = h2 * 60 + m2; }
    else warnings.push('Please specify a clear time range, such as 14:00–17:00 or 2pm–5pm.');
  } else warnings.push('Please enter one exact availability window in the time fields below.');
  const notice = text.match(/(?:at least\s+|minimum\s+|need\s+)?(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)(?:['’]s?)?\s*(?:of\s+)?notice/);
  if (notice && !/\b(no|not|less than)\b.{0,12}\d+\s*(hours?|minutes?)/.test(text)) {
    const value = Number(notice[1]) * (/^h/.test(notice[2]) ? 60 : 1);
    if (value >= 0 && value <= 10080) draft.notice = value;
  }
  if (draft.notice === undefined) warnings.push('Minimum notice was not specified clearly; review it manually.');
  return { draft, warnings };
}
