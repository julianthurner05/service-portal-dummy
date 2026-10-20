/* ================================================================
   LOGIN – Overlay beim Start, kehrt nach Log out zurück
   ================================================================ */

/* Vorübergehend aus, damit beim Testen kein Login dazwischenkommt –
   auf true setzen, um den Start-Login wieder einzuschalten (Log out zeigt ihn immer) */
const LOGIN_ENABLED = false;

const loginEl       = document.getElementById('login');
const loginEmail    = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginSubmit   = document.getElementById('login-submit');

function showLogin() {
  loginPassword.value = '';
  loginEl.classList.remove('is-hidden');
  closeAllMenus();
  setTimeout(() => loginPassword.focus(), 400);
}

function hideLogin() {
  loginEl.classList.add('is-hidden');
  showView('home');
}

/* Dummy: weiterklicken reicht, leere Felder werden nur sanft angemahnt */
loginSubmit.addEventListener('click', () => {
  if (!loginEmail.value.trim()) { showToast('error', 'Please enter your e-mail address.'); loginEmail.focus(); return; }
  hideLogin();
});

[loginEmail, loginPassword].forEach(input =>
  input.addEventListener('keydown', e => { if (e.key === 'Enter') loginSubmit.click(); }));

document.getElementById('login-forgot').addEventListener('click', () => {
  showToast('success', `We sent a password link to ${loginEmail.value.trim() || 'your e-mail address'}.`);
});

document.querySelectorAll('.login__footer a').forEach(a =>
  a.addEventListener('click', e => e.preventDefault()));

if (LOGIN_ENABLED) {
  setTimeout(() => loginPassword.focus(), 300);
} else {
  /* ohne Ausblend-Animation weg, damit beim Laden nichts aufblitzt */
  loginEl.style.transition = 'none';
  hideLogin();
  loginEl.offsetHeight;
  loginEl.style.transition = '';
}
