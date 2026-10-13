/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node regression fixture. */
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
  let popupOpen = true;
  const sequence = [];
  const popup = {id:'staff-filters',style:{display:'flex'},dataset:{}};
  const form = { elements: fields, closest: selector => selector === ':target' ? (popupOpen ? popup : null) : popup.dataset.dateFilterDisplay === undefined ? null : popup };
  const globals = { HTMLInputElement: Input, HTMLSelectElement: class {}, FormData: class {
    constructor(form) { this.data = new Map(form ? fields.map(field => [field.name,field.value]) : []); }
    has(name) { return this.data.has(name); }
    get(name) { return this.data.get(name); }
    set(name,value) { this.data.set(name,value); }
    forEach(callback) { this.data.forEach(callback); }
  }, document: {querySelectorAll:()=>[{getAttribute:()=> '#staff-filters',focus:options=>{assert.deepEqual(options,{preventScroll:true});sequence.push('focus');}}]}, location: {pathname:'/dashboard/staff-report',search:'?branch=kept'}, window: {
    history: {state:{kept:true},replaceState(state,_title,url){assert.deepEqual(state,{kept:true});assert.equal(url,'/dashboard/staff-report?branch=kept');popupOpen=false;sequence.push('close');}},
    addEventListener(name, handler) { events[name] = handler; }, removeEventListener() {} } };
  const events = {}, refs = [], effects = [], routes = [];
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]);
  }
  const NavigationForm = loadTs('components/navigation-form.tsx', {
    react: { ...React, useRef(value) { const ref = { current: value }; refs.push(ref); return ref; }, useEffect: callback => effects.push(callback), useTransition: () => [false, callback => callback()] },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': { usePathname: () => '/dashboard/staff-report', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: url => {sequence.push('navigate');routes.push(url);}, replace: url => routes.push(url) }) },
    '@/components/providers/language-provider': { useLanguage: () => ({ t: value => value }) },
    '@/components/ui/activity-link': { useActivity() {} },
    '@/lib/date-range': loadTs('lib/date-range.ts'),
  }).default;
  const rendered = NavigationForm({ reset: { range: 'yesterday', from: '', to: '' } });
  refs[0].current = form;
  const cleanups = effects.map(callback => callback());
  const event = { currentTarget: form, preventDefault() {} };
  fields.namedItem('to').value = '2026-10-08';
  rendered.props.onChange({ target: fields.namedItem('to') });
  assert.deepEqual(routes, []);
  rendered.props.onSubmit(event);
  assert.match(fields.namedItem('to').error, /Start date/);
  assert.deepEqual(routes, []);
  assert.equal(popupOpen,true);
  assert.equal(popup.style.display,'flex');
  rendered.props.onReset(event);
  assert.equal(fields.namedItem('range').value, 'yesterday');
  assert.equal(fields.namedItem('to').error, '');
  assert.deepEqual(routes, []);
  rendered.props.onSubmit(event);
  assert.deepEqual(routes, ['/dashboard/staff-report?range=yesterday']);
  assert.equal(popupOpen,false);
  assert.equal(popup.style.display,'none','hide CSS target even when replaceState does not update it');
  cleanups[0]();
  assert.equal(popup.style.display,'none','committing new filters and remounting the form must not reopen the popup');
  assert.deepEqual(sequence,['close','focus','navigate']);
  fields.namedItem('from').value = '2026-09-01';
  events.hashchange();
  assert.equal(popup.style.display,'flex','restore popup when the user opens its hash again');
  assert.equal(fields.namedItem('from').value, '2026-10-09');
  assert.equal(fields.namedItem('range').value, 'custom');
  assert.equal(routes.length, 1);
  rendered.props.onSubmit(event);
  assert.equal(routes.length, 1, 'unchanged applied fields do not navigate again');
});
