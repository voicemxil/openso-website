/* OpenSO website — shared client helpers for talking to the FSO.Server.Api.Core (userapi). */

/* Set this to your live API host (the Hetzner box, behind Cloudflare).
   During local testing you can point it at your dev server. */
window.OPENSO_API_BASE = "https://api.openso.org";

/* Friendly messages for the documented userapi error codes. */
const OPENSO_ERRORS = {
  user_short: "That username is too short.",
  user_long: "That username is too long.",
  user_invalid: "That username contains invalid characters.",
  pass_required: "Please enter a password.",
  email_invalid: "Please enter a valid email address.",
  email_taken: "That email is already registered.",
  user_exists: "That username is already taken.",
  ip_banned: "Registration from your network is not allowed.",
  registrations_too_frequent: "Too many attempts — please wait a bit and try again.",
  confirmation_pending: "A confirmation email is already on its way — check your inbox.",
  invalid_token: "This link is invalid or has expired. Please start again.",
  incorrect_password: "Your current password is incorrect.",
  missing_fields: "Please fill in all the fields.",
  smtp_disabled: "Email verification isn't enabled on this server.",
  key_wrong: "Server configuration error (registration key). Contact an admin.",
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

/* Small UI helper: show a message in a .msg element. */
function opensoMsg(el, kind, text) {
  if (!el) return;
  el.className = "msg show " + (kind === "ok" ? "ok" : "error");
  el.textContent = text;
}
function opensoClear(el){ if(el){ el.className="msg"; el.textContent=""; } }

/* Read a query param (used by email-confirm pages). */
function opensoQuery(name){ return new URLSearchParams(location.search).get(name); }
