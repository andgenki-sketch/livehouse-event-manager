/**
 * Public-only event projection for the WordPress integration.
 * No network calls, secrets, or private fields are included.
 */
const REQUIRED = ['id', 'title', 'event_date'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

function publicText(value, max = 5000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function publicTime(value) {
  if (!value) return null;
  const time = String(value).trim();
  if (!TIME_RE.test(time)) throw new Error('Invalid public event time');
  return time.slice(0, 5);
}
function publicPrice(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid public event price');
  return n;
}
/**
 * Returns a minimal, allowlisted payload.
 * An unpublished event becomes an unpublish instruction, never a full event.
 */
export function projectWordPressEvent(event) {
  if (!event || typeof event !== 'object') throw new Error('Invalid event');
  if (typeof event.id !== 'string' || !event.id.trim()) throw new Error('Missing event id');
  const externalId = event.id.trim();
  if (event.website_published !== true) {
    return { external_id: externalId, action: 'unpublish' };
  }
  for (const field of REQUIRED) {
    if (!event[field]) throw new Error('Missing public event field: ' + field);
  }
  if (!DATE_RE.test(event.event_date) || Number.isNaN(Date.parse(event.event_date + 'T00:00:00Z')) ||
      new Date(event.event_date + 'T00:00:00Z').toISOString().slice(0,10) !== event.event_date) {
    throw new Error('Invalid event date');
  }
  const title = publicText(event.title, 300);
  if (!title) throw new Error('Missing public event title');
  return {
    external_id: externalId,
    action: 'upsert',
    title,
    event_date: event.event_date,
    timezone: 'Asia/Tokyo',
    open_time: publicTime(event.open_time),
    start_time: publicTime(event.start_time),
    venue: publicText(event.venue, 300),
    advance_price: publicPrice(event.advance_price),
    door_price: publicPrice(event.door_price),
    public_description: publicText(event.public_description, 10000),
    flyer_path: publicText(event.flyer_path, 500) || null,
    pickup: event.website_pickup === true
  };
}
