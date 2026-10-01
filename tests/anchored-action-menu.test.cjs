const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');

test('action popup stays beside its button and flips at the viewport edge', () => {
  const previous = global.window;
  global.window = { innerWidth: 360, innerHeight: 640 };
  try {
    const refs = [];
    const { default: Menu } = loadTs('components/anchored-action-menu.tsx', {
      'react/jsx-runtime': require('react/jsx-runtime'),
      react: { useId: () => 'menu', useEffect() {}, useRef: () => { const ref = { current: null }; refs.push(ref); return ref; } },
      'lucide-react': require('lucide-react'),
    });
    const tree = Menu({ label: 'Actions', children: null });
    let rect = { left: 280, right: 350, top: 580, bottom: 616 }, hidden = false;
    refs[0].current = { getBoundingClientRect: () => rect };
    const popup = { style: {}, matches: () => true, scrollHeight: 120, offsetHeight: 120, offsetWidth: 180, hidePopover: () => { hidden = true; } };
    refs[1].current = popup;
    const reposition = tree.props.children[1].props.onToggle;
    reposition();
    assert.equal(popup.style.left, '172px');
    assert.equal(popup.style.top, '454px');
    rect = { left: 12, right: 82, top: 50, bottom: 86 };
    reposition();
    assert.equal(popup.style.left, '12px');
    assert.equal(popup.style.top, '92px');
    rect = { left: 12, right: 82, top: -90, bottom: -54 };
    reposition();
    assert.equal(hidden, true);
  } finally { global.window = previous; }
});
