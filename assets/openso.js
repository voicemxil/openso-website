/* OpenSO website — shared client helpers for talking to the FSO.Server.Api.Core (userapi). */

/* Set this to your live API host (the Hetzner box, behind Cloudflare).
   During local testing you can point it at your dev server. */
window.OPENSO_API_BASE = "https://api.openso.org";

/* Friendly messages for the documented userapi error codes (RegistrationController /
   PasswordController — error_description values, plus the odd one that only comes back as
   `status` — see opensoPost() below for how a code gets picked out of the raw response). */
const OPENSO_ERRORS = {
  user_short: "That username is too short.",
  user_long: "That username is too long.",
  user_invalid: "That username isn't valid — double-check the spelling, or it may contain characters that aren't allowed (letters, numbers and underscores only).",
  pass_required: "Please enter a password.",
  email_invalid: "Please enter a valid email address.",
  email_taken: "That email is already registered.",
  user_exists: "That username is already taken.",
  ip_banned: "Registration from your network is not allowed.",
  registrations_too_frequent: "Too many attempts — please wait a bit and try again.",
  resend_cooldown: "You'll need to wait about a minute between resend requests. Please try again shortly.",
  email_rate_limited: "Too many verification emails have been requested for this address. Please wait a while before trying again.",
  too_many_attempts: "Too many incorrect attempts. Please wait a few minutes, then request a new verification email.",
  confirmation_pending: "A confirmation email is already on its way — check your inbox.",
  invalid_token: "This link is invalid or has expired. Please start again.",
  incorrect_password: "Your current password is incorrect.",
  missing_fields: "Please fill in all the fields.",
  missing_confirmation_token: "This action requires email verification, which is enabled on this server. Please refresh the page and try again, or contact support if it keeps happening.",
  email_send_failed: "We couldn't send your verification email. Please try again, or contact support if it keeps happening.",
  email_failed: "We couldn't send that password reset email. Please try again in a moment, or contact support if it keeps happening.",
  smtp_disabled: "Email verification isn't enabled on this server.",
  key_wrong: "That registration key isn't valid. Check the key you were given, or contact an admin.",
  default: "Something went wrong. Please try again."
};

function opensoFriendly(code) {
  return OPENSO_ERRORS[code] || OPENSO_ERRORS.default;
}

/* POST x-www-form-urlencoded to a userapi endpoint. Returns {ok, data, code}. */
async function opensoPost(path, fields) {
  const body = new URLSearchParams(fields).toString();
  let res, data;
  try {
    res = await fetch(window.OPENSO_API_BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
  } catch (e) {
    return { ok: false, code: "network", message: "Couldn't reach the server. Check your connection." };
  }
  try { data = await res.json(); } catch (e) { data = {}; }

  /* The API returns errors as {error:'<bucket>', error_description:'<code>'} — the SPECIFIC code
     (email_taken, ip_banned, incorrect_password, ...) is in error_description; `error` is just a
     generic bucket (registration_failed / password_reset_failed / bad_request). Prefer the specific
     code so OPENSO_ERRORS resolves to a friendly message. Success = HTTP 2xx + no error field. */
  const errCode = data.error_description || data.error || data.reason || (data.status && data.status !== "success" && data.status !== "ok" ? data.status : null);
  if (!res.ok || errCode) {
    return { ok: false, code: errCode || "default", message: opensoFriendly(errCode) , data };
  }
  return { ok: true, data };
}

/* GET a userapi endpoint. Returns parsed JSON, or null on any network/parse/HTTP error. */
async function opensoGet(path) {
  try {
    const res = await fetch(window.OPENSO_API_BASE + path, { method: "GET" });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

/* Discover the server's registration mode (userapi/registration/info). Contains only booleans — the
   registration key itself is never exposed. Fails OPEN to the PUBLIC defaults ({key_required:false}) so a
   missing/older endpoint or a network hiccup never blocks the public registration flow. The server still
   enforces the real key requirement when a form is actually submitted. */
async function opensoRegInfo() {
  const info = await opensoGet("/userapi/registration/info");
  return {
    key_required: !!(info && info.key_required),
    smtp_enabled: !!(info && info.smtp_enabled)
  };
}

/* Small UI helper: show a message in a .msg element. */
function opensoMsg(el, kind, text) {
  if (!el) return;
  el.className = "msg show " + (kind === "ok" ? "ok" : "error");
  el.textContent = text;
}
function opensoClear(el){ if(el){ el.className="msg"; el.textContent=""; } }

/* Read a query param (used by email-confirm pages). */
function opensoQuery(name){ return new URLSearchParams(location.search).get(name); }
