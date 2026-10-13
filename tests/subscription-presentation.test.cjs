/* eslint-disable @typescript-eslint/no-require-imports -- Node's CommonJS test harness. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function fixture(exportName = 'default') {
  let state;
  const component = loadTs('app/(dashboard)/dashboard/settings/subscription/subscription-presentation.tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'),
    react: { useState(initial) { state ??= initial; return [state, value => { state = value; }]; }, useEffect() {}, useRef() { return { current: null }; } },
    'lucide-react': require('lucide-react'),
    './subscription-responsive.module.css': { default: {} },
  })[exportName];
  return props => nodes(component(props));
}

test('tab switching preserves the server content and existing subscription action', () => {
  const render = fixture();
  const children = { type: 'section', props: { children: 'Loaded subscription content' } };
  const action = { type: 'a', props: { href: '/dashboard/settings/subscription?view=plans' } };
  const props = { children, action };
  let tree = render(props);
  assert.equal(tree.find(node => node.type === 'main').props['data-tab'], 'overview');
  tree.find(node => node.props?.id === 'subscription-payments-tab').props.onClick();
  tree = render(props);
  assert.equal(tree.find(node => node.type === 'main').props['data-tab'], 'payments');
  assert.ok(tree.includes(children));
  assert.ok(tree.includes(action));
  assert.equal(tree.find(node => node.props?.id === 'subscription-payments-tab').props['aria-selected'], true);
  tree.find(node => node.props?.id === 'subscription-overview-tab').props.onClick();
  assert.equal(render(props).find(node => node.type === 'main').props['data-tab'], 'overview');
});

test('keyboard tabs select and restore focus; non-owners have no bottom action', () => {
  const render = fixture();
  let focus;
  const previous = global.document;
  global.document = { getElementById(id) { return { focus() { focus = id; } }; } };
  try {
    let tree = render({ children: null, action: null });
    assert.equal(tree.find(node => node.type === 'main').props['data-has-action'], false);
    const event = { key: 'ArrowRight', preventDefault() { this.prevented = true; } };
    tree.find(node => node.props?.id === 'subscription-overview-tab').props.onKeyDown(event);
    assert.equal(event.prevented, true);
    assert.equal(focus, 'subscription-payments-tab');
    tree = render({ children: null, action: null });
    assert.equal(tree.find(node => node.props?.id === 'subscription-payments-tab').props.tabIndex, 0);
    tree.find(node => node.props?.id === 'subscription-payments-tab').props.onKeyDown({ key: 'Home', preventDefault() {} });
    assert.equal(focus, 'subscription-overview-tab');
  } finally { global.document = previous; }
});

test('supplemental usage and help remain mounted behind the compact disclosure', () => {
  const render = fixture('SubscriptionExtras');
  const children = { type: 'section', props: { children: 'Existing usage and help' } };
  let tree = render({ children });
  assert.equal(tree.find(node => node.type === 'button').props['aria-expanded'], false);
  assert.ok(tree.includes(children));
  tree.find(node => node.type === 'button').props.onClick();
  tree = render({ children });
  assert.equal(tree.find(node => node.type === 'button').props['aria-expanded'], true);
  assert.ok(tree.includes(children));
});
