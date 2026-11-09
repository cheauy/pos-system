import http from 'node:http';
import { createBotSafeInviteLink, handleBotJoinRequestWebhook } from './option1BotInvite.js';
import { safeMtprotoContactAndInvite } from './option2MtprotoInvite.js';
import { evaluateInviteSafety, loadState, recordAction } from './safetyState.js';

const PORT = Number(process.env.PORT || 3040);

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 100_000) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

const UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TENH · Telegram Safe Inviter (2 Options)</title>
<style>
  :root{--bg:#f7f9fb;--panel:#fff;--line:#e6eaef;--text:#0f1b2a;--muted:#5d6b7c;--brand:#16537e;--brand-50:#eef4f9;--brand-100:#dbe8f2;--green:#138562;--green-50:#eaf8f1;--amber:#9a6a12;--amber-50:#fdf6e7;--red:#b64a58;--red-50:#fff1f3;--shadow:0 1px 2px rgba(15,27,42,.04),0 4px 16px rgba(15,27,42,.05)}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.55}
  .wrap{max-width:1180px;margin:0 auto;padding:32px 24px 56px}
  .top{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:24px;flex-wrap:wrap}
  .eyebrow{font-size:11px;font-weight:700;letter-spacing:.1em;color:var(--brand);text-transform:uppercase}
  h1{margin:4px 0 6px;font-size:26px;letter-spacing:-.02em}
  p{margin:0;color:var(--muted)}
  .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;align-items:start}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);overflow:hidden}
  .card-head{padding:20px 22px;border-bottom:1px solid var(--line);display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
  .card-head h2{margin:0 0 4px;font-size:16px}
  .badge{font-size:11px;font-weight:600;padding:4px 10px;border-radius:999px;white-space:nowrap}
  .badge-green{background:var(--green-50);color:var(--green);border:1px solid #ccebd9}
  .badge-amber{background:var(--amber-50);color:var(--amber);border:1px solid #f3e2bd}
  .card-body{padding:22px;display:grid;gap:14px}
  label{display:block;font-size:12px;font-weight:600;color:#2b3a4c}
  input,select{width:100%;margin-top:6px;padding:10px 12px;border:1px solid #d5dbe3;border-radius:9px;font:inherit;background:#fff;color:var(--text);outline:none}
  input:focus,select:focus{border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-100)}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 18px;border-radius:9px;font-weight:600;font-size:13px;border:1px solid var(--brand);background:#fff;color:var(--brand);cursor:pointer;transition:all .16s}
  .btn:hover{background:var(--brand);color:#fff;box-shadow:0 4px 14px rgba(22,83,126,.22)}
  .out{padding:12px 14px;border-radius:10px;font-size:13px;background:var(--brand-50);border:1px solid var(--brand-100);display:none;overflow-wrap:anywhere}
  .out.err{background:var(--red-50);border-color:#f3d8df;color:var(--red)}
  .meters{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:12px;background:var(--bg);border:1px solid var(--line);border-radius:10px;text-align:center}
  .meters strong{display:block;font-size:18px;color:var(--brand)}
  .meters span{font-size:11px;color:var(--muted)}
  .log{margin-top:24px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{padding:11px 16px;border-bottom:1px solid var(--line);text-align:left}
  th{background:var(--bg);font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
  @media(max-width:860px){.grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div>
      <div class="eyebrow">TENH · Telegram Onboarding</div>
      <h1>Telegram Safe Inviter — 2 Options</h1>
      <p>Use <b>Option 1</b> for unlimited ban-proof customer links, or <b>Option 2</b> for rate-limited contact + direct group invites.</p>
    </div>
    <button class="btn" onclick="refreshState()">Refresh safety status</button>
  </div>

  <div class="grid">
    <!-- OPTION 1 -->
    <section class="card">
      <div class="card-head">
        <div>
          <h2>Option 1 · Bot Invite Link + Auto-Approve</h2>
          <p>Creates a tracked link via Bot API. Zero ban risk &amp; unlimited members.</p>
        </div>
        <span class="badge badge-green">100% Ban-Proof</span>
      </div>
      <form class="card-body" onsubmit="runOption1(event)">
        <label>Customer / Campaign Label
          <input id="o1Label" placeholder="e.g. Order #1049 or VIP Customer" value="VIP Customer" required />
        </label>
        <div class="two">
          <label>Verification Mode
            <select id="o1Mode">
              <option value="join_request">Auto-Approve Join Request (Recommended)</option>
              <option value="single_use">Single-Use Direct Link (member_limit = 1)</option>
            </select>
          </label>
          <label>Expires In (Hours)
            <input id="o1Hours" type="number" min="1" max="720" value="168" />
          </label>
        </div>
        <label>Target Group / Channel ID <span style="font-weight:400;color:var(--muted)">(optional override)</span>
          <input id="o1Chat" placeholder="Uses TELEGRAM_CHAT_ID from .env if blank" />
        </label>
        <button class="btn" type="submit">Generate Safe Invite Link</button>
        <div id="o1Out" class="out"></div>
      </form>
    </section>

    <!-- OPTION 2 -->
    <section class="card">
      <div class="card-head">
        <div>
          <h2>Option 2 · MTProto Add Contact + Direct Invite</h2>
          <p>Adds contact to your user account &amp; invites to group with anti-flood guards.</p>
        </div>
        <span class="badge badge-amber">Rate-Limited Guard</span>
      </div>
      <form class="card-body" onsubmit="runOption2(event)">
        <div class="meters">
          <div><strong id="mHour">0 / 4</strong><span>Invites (1h)</span></div>
          <div><strong id="mDay">0 / 15</strong><span>Invites (24h)</span></div>
          <div><strong id="mContact">0 / 12</strong><span>Contacts (24h)</span></div>
        </div>
        <div class="two">
          <label>Phone Number (with +country)
            <input id="o2Phone" placeholder="+85512345678" />
          </label>
          <label>Or @Username
            <input id="o2User" placeholder="@username" />
          </label>
        </div>
        <div class="two">
          <label>First Name (for Contact)
            <input id="o2First" placeholder="Sokha" value="Customer" />
          </label>
          <label>Fallback Invite Link (if Privacy Restricted)
            <input id="o2Fallback" placeholder="https://t.me/+... (auto-filled from Option 1)" />
          </label>
        </div>
        <button class="btn" type="submit">Add Contact &amp; Safe Invite</button>
        <div id="o2Out" class="out"></div>
      </form>
    </section>
  </div>

  <section class="card log">
    <div class="card-head">
      <div><h2>Recent Invite &amp; Safety Activity</h2><p>Tracks both Option 1 links and Option 2 MTProto rate-limit events.</p></div>
    </div>
    <table>
      <thead><tr><th>Time</th><th>Option</th><th>Target / Label</th><th>Result</th></tr></thead>
      <tbody id="logBody"><tr><td colspan="4" style="color:var(--muted)">No activity yet.</td></tr></tbody>
    </table>
  </section>
</div>

<script>
const $ = id => document.getElementById(id);

async function refreshState(){
  const res = await fetch('/api/status');
  const data = await res.json();
  const s = data.safety.stats;
  $('mHour').textContent = s.invitesLastHour + ' / ' + s.limits.maxInvitesPerHour;
  $('mDay').textContent = s.invitesLastDay + ' / ' + s.limits.maxInvitesPerDay;
  $('mContact').textContent = s.contactsLastDay + ' / ' + s.limits.maxContactsPerDay;
  const rows = data.history || [];
  $('logBody').innerHTML = rows.length ? rows.slice(0, 15).map(r =>
    '<tr><td>' + new Date(r.at).toLocaleTimeString() + '</td><td>' + r.option + '</td><td>' + (r.target || '-') + '</td><td><b>' + r.status + '</b></td></tr>'
  ).join('') : '<tr><td colspan="4" style="color:var(--muted)">No activity yet.</td></tr>';
}

async function runOption1(e){
  e.preventDefault();
  const box = $('o1Out'); box.style.display = 'block'; box.className = 'out'; box.textContent = 'Generating link…';
  const res = await fetch('/api/option1/create-link', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ label: $('o1Label').value, mode: $('o1Mode').value, expireHours: Number($('o1Hours').value), chatId: $('o1Chat').value || undefined })
  });
  const data = await res.json();
  if(!res.ok){ box.className = 'out err'; box.textContent = data.error; return; }
  box.innerHTML = '<b>Safe Invite Link:</b> <a href="' + data.inviteLink + '" target="_blank">' + data.inviteLink + '</a>';
  $('o2Fallback').value = data.inviteLink;
  refreshState();
}

async function runOption2(e){
  e.preventDefault();
  const box = $('o2Out'); box.style.display = 'block'; box.className = 'out'; box.textContent = 'Running safety checks & inviting…';
  const res = await fetch('/api/option2/contact-invite', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ phone: $('o2Phone').value, username: $('o2User').value, firstName: $('o2First').value, fallbackInviteLink: $('o2Fallback').value })
  });
  const data = await res.json();
  if(!res.ok){ box.className = 'out err'; box.textContent = data.error; refreshState(); return; }
  box.innerHTML = '<b>' + data.status + ':</b> ' + (data.message || ('Invited ' + data.target));
  refreshState();
}

refreshState();
</script>
</body>
</html>`;

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(UI_HTML);
      }

      if (req.method === 'GET' && url.pathname === '/api/status') {
        const state = loadState();
        return sendJson(res, 200, {
          safety: evaluateInviteSafety(state),
          history: state.history || [],
        });
      }

      if (req.method === 'POST' && url.pathname === '/api/option1/create-link') {
        const body = await readJson(req);
        const result = await createBotSafeInviteLink({
          label: body.label,
          mode: body.mode,
          expireHours: body.expireHours,
          chatId: body.chatId || process.env.TELEGRAM_CHAT_ID,
        });
        recordAction(loadState(), {
          option: 'OPTION_1_BOT_LINK',
          target: result.name,
          status: 'LINK_CREATED',
          inviteLink: result.inviteLink,
        });
        return sendJson(res, 200, result);
      }

      if (req.method === 'POST' && url.pathname === '/api/option1/webhook') {
        const update = await readJson(req);
        const result = await handleBotJoinRequestWebhook(update);
        if (result.handled) {
          recordAction(loadState(), {
            option: 'OPTION_1_WEBHOOK',
            target: `${result.firstName} (${result.approvedUserId})`,
            status: 'AUTO_APPROVED',
          });
        }
        return sendJson(res, 200, result);
      }

      if (req.method === 'POST' && url.pathname === '/api/option2/contact-invite') {
        const body = await readJson(req);
        const result = await safeMtprotoContactAndInvite({
          phone: body.phone,
          username: body.username,
          firstName: body.firstName,
          lastName: body.lastName,
          chatId: body.chatId || process.env.TELEGRAM_CHAT_ID,
          fallbackInviteLink: body.fallbackInviteLink,
        });
        return sendJson(res, 200, result);
      }

      return sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      return sendJson(res, 400, { error: err.message || 'Request failed', code: err.code || 'ERROR' });
    }
  });
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  createServer().listen(PORT, () => {
    console.log(`Telegram Safe Inviter (Option 1 + Option 2) running on http://localhost:${PORT}`);
  });
}
