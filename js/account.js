/* ================================================================
   ACCOUNT – Sessions, Passwort, MFA-Dummy, Benachrichtigungen
   ================================================================ */

/* Letzter Login: heute, ein paar Stunden her */
document.getElementById('acc-last-login').textContent = 'Today, 08:14';

/* ---- Log out ---- */
document.getElementById('acc-logout').addEventListener('click', async () => {
  const ok = await confirmDialog({ title: 'Log out?', text: 'You will need to sign in again to access the SpotTool.', confirmLabel: 'Log out' });
  if (!ok) return;
  showLogin();
});

/* ---- Passwort: nur ein CTA, der Link kommt per Mail ---- */
document.getElementById('pw-request').addEventListener('click', () => {
  showToast('success', 'We sent a password link to julian.thurner@sound-dna.com.');
});

/* ---- MFA-Dummy-Workflow ---- */
const mfaStatus = document.getElementById('mfa-status');
const mfaOff    = document.getElementById('mfa-off');
const mfaStep1  = document.getElementById('mfa-step1');
const mfaStep2  = document.getElementById('mfa-step2');
const mfaOn     = document.getElementById('mfa-on');
const mfaCode   = document.getElementById('mfa-code');
const mfaInputs = [...mfaCode.querySelectorAll('input')];

/* Pseudo-QR-Muster (deterministisch) */
(() => {
  const qr = document.getElementById('mfa-qr');
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  let html = '';
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      const finder = (x < 4 && y < 4) || (x > 7 && y < 4) || (x < 4 && y > 7);
      const on = finder ? !((x === 1 || x === 2 || x === 9 || x === 10) && (y === 1 || y === 2 || y === 9 || y === 10)) && !(x === 3 || y === 3 || x === 8 || y === 8)
                        : rnd() > 0.5;
      html += `<span class="${on ? '' : 'off'}"></span>`;
    }
  }
  qr.innerHTML = html;
})();

function showMfa(step) {
  mfaOff.hidden = step !== 'off';
  mfaStep1.hidden = step !== 'step1';
  mfaStep2.hidden = step !== 'step2';
  mfaOn.hidden = step !== 'on';
  mfaStatus.textContent = step === 'on' ? 'On' : 'Recommended';
  mfaStatus.classList.toggle('is-on', step === 'on');
  document.getElementById('mfa-card').classList.toggle('acc-card--attention', step !== 'on');
}
showMfa('off');

document.getElementById('mfa-start').addEventListener('click', () => showMfa('step1'));
document.getElementById('mfa-cancel').addEventListener('click', () => showMfa('off'));
document.getElementById('mfa-next').addEventListener('click', () => {
  showMfa('step2');
  mfaInputs.forEach(i => (i.value = ''));
  mfaInputs[0].focus();
});
document.getElementById('mfa-back').addEventListener('click', () => showMfa('step1'));

/* 6-stellige Eingabe: automatisch weiterspringen */
mfaInputs.forEach((input, i) => {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(-1);
    if (input.value && mfaInputs[i + 1]) mfaInputs[i + 1].focus();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Backspace' && !input.value && mfaInputs[i - 1]) mfaInputs[i - 1].focus();
    if (e.key === 'Enter') document.getElementById('mfa-verify').click();
  });
  input.addEventListener('paste', e => {
    const text = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    e.preventDefault();
    [...text].forEach((ch, k) => { if (mfaInputs[k]) mfaInputs[k].value = ch; });
    mfaInputs[Math.min(text.length, 5)].focus();
  });
});

document.getElementById('mfa-verify').addEventListener('click', () => {
  const code = mfaInputs.map(i => i.value).join('');
  if (code.length < 6) { showToast('error', 'Please enter all 6 digits.'); return; }
  /* Dummy: jeder vollständige Code gilt */
  const backup = document.getElementById('mfa-backup');
  backup.innerHTML = [...Array(6)].map(() =>
    `<span>${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}</span>`
  ).join('');
  showMfa('on');
  showToast('success', 'Two-factor authentication enabled.');
});

document.getElementById('mfa-disable').addEventListener('click', async () => {
  const ok = await confirmDialog({ title: 'Disable two-factor authentication?', text: 'Your account will be protected by password only.', confirmLabel: 'Disable' });
  if (!ok) return;
  showMfa('off');
  showToast('success', 'Two-factor authentication disabled.');
});
