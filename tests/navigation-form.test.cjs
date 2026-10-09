const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loadTs } = require('./helpers/load-ts.cjs');

test('filter edits, Reset and closing stay drafts; Reset clears date errors before Apply', t => {
  class Input {
    constructor(name, value, type = 'text') { Object.assign(this, { name, value, defaultValue: value, type, error: '' }); }
    setCustomValidity(message) { this.error = message; }
    reportValidity() {}
  }
  const fields = [new Input('range', 'custom'), new Input('from', '2026-10-09', 'date'), new Input('to', '2026-10-10', 'date')];
  fields.namedItem = name => fields.find(field => field.name === name);
  const form = { elements: fields };
  const globals = { HTMLInputElement: Input, HTMLSelectElement: class {}, FormData: class {
    has(name) { return Boolean(fields.namedItem(name)); }
    get(name) { return fields.namedItem(name)?.value; }
    forEach(callback) { fields.forEach(field => callback(field.value, field.name)); }
  }, window: { addEventListener(name, handler) { events[name] = handler; }, removeEventListener() {} } };
  const events = {}, refs = [], effects = [], routes = [];
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]);
  }
  const NavigationForm = loadTs('components/navigation-form.tsx', {
    react: { ...React, useRef(value) { const ref = { current: value }; refs.push(ref); return ref; }, useEffect: callback => effects.push(callback), useTransition: () => [false, callback => callback()] },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': { usePathname: () => '/dashboard/staff-report', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: url => routes.push(url), replace: url => routes.push(url) }) },
    '@/components/providers/language-provider': { useLanguage: () => ({ t: value => value }) },
    '@/components/ui/activity-link': { useActivity() {} },
    '@/lib/date-range': loadTs('lib/date-range.ts'),
  }).default;
  const rendered = NavigationForm({ reset: { range: 'yesterday', from: '', to: '' } });
  refs[0].current = form;
  effects.forEach(callback => callback());
  const event = { currentTarget: form, preventDefault() {} };
  fields.namedItem('to').value = '2026-10-08';
  rendered.props.onChange({ target: fields.namedItem('to') });
  assert.deepEqual(routes, []);
  rendered.props.onSubmit(event);
  assert.match(fields.namedItem('to').error, /Start date/);
  assert.deepEqual(routes, []);
  rendered.props.onReset(event);
  assert.equal(fields.namedItem('range').value, 'yesterday');
  assert.equal(fields.namedItem('to').error, '');
  assert.deepEqual(routes, []);
  rendered.props.onSubmit(event);
  assert.deepEqual(routes, ['/dashboard/staff-report?range=yesterday']);
  fields.namedItem('from').value = '2026-09-01';
  events.hashchange();
  assert.equal(fields.namedItem('from').value, '2026-10-09');
  assert.equal(fields.namedItem('range').value, 'custom');
  assert.equal(routes.length, 1);
});
