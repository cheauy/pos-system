const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
const file = ts.createSourceFile('team-setup.tsx', fs.readFileSync('mobile/src/team-setup.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const fn = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === 'saveTeamPassword');
const source = ts.transpileModule(fn.getText(file).replace('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function setup(changed = {}, activationError) {
  const calls = [];
  return { calls, save: new Function('auth', 'api', `${source};return saveTeamPassword;`)({ auth: { updateUser: async body => { calls.push(['password', body]); return changed; } } }, async (...args) => { calls.push(['activate', ...args]); if (activationError) throw activationError; }) };
}
test('validates before changing password and activates only after password update', async () => {
  const s = setup();
  await assert.rejects(s.save('short', 'short'));
  await assert.rejects(s.save('a-new-password', 'different'));
  assert.equal(s.calls.length, 0);
  await s.save('a-new-password', 'a-new-password');
  assert.deepEqual(s.calls, [['password', { password: 'a-new-password' }], ['activate', 'team-setup', {}, {}]]);
});
test('mobile setup accepts 8 and 72 characters and rejects 7 and 73', async () => {
  for (const length of [8, 72]) {
    const s = setup(), password = 'A'.repeat(length);
    await s.save(password, password);
    assert.equal(s.calls.length, 2);
  }
  for (const length of [7, 73]) {
    const s = setup(), password = 'A'.repeat(length);
    await assert.rejects(s.save(password, password), /8–72/);
    assert.equal(s.calls.length, 0);
  }
});
test('password failures block activation; lost activation responses can be retried', async () => {
  const denied = setup({ error: { code: 'weak_password', message: 'Weak password' } });
  await assert.rejects(denied.save('a-new-password', 'a-new-password'));
  assert.equal(denied.calls.length, 1);
  const retry = setup({ error: { code: 'same_password' } });
  await retry.save('a-new-password', 'a-new-password');
  assert.equal(retry.calls[1][0], 'activate');
  const failed = setup({}, new Error('Seat unavailable'));
  await assert.rejects(failed.save('a-new-password', 'a-new-password'), /Seat unavailable/);
});
test('mobile activation uses authenticated identity and gates pending members before workspace access', () => {
  const route = fs.readFileSync('app/api/mobile/[feature]/route.ts', 'utf8');
  const auth = route.indexOf('if (error || !user)');
  const activation = route.indexOf("feature === 'team-setup'");
  const pending = route.indexOf('await needsTeamPasswordSetup(user.id)');
  assert.ok(auth < activation && activation < pending && pending < route.indexOf('await getCurrentBusinessForSubscription'));
  assert.match(route.slice(activation, pending), /tenh_users_finish_setup', \{ p_user: user.id \}/);
  assert.match(route, /code: 'team_setup_required'/);
});
