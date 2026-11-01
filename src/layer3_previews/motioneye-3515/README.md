# motionEye #3515 — "Remember me" comes back to the login

[motioneye-project/motioneye#3515](https://github.com/motioneye-project/motioneye/pull/3515)
brings back a "Remember me" switch on the login dialog, on by default. On,
the `user` session cookie lasts a day, as in 0.44.0; off, it has no expiry and
goes when the browser closes. The server-side session lifetime is unchanged. It relates to
[#3364](https://github.com/motioneye-project/motioneye/issues/3364) without
closing it, so `preview.json` has `issue: 0`.

## Checking it in the preview

1. Open the preview link. The login dialog shows a **Remember me** switch,
   on, below **Username** and **Password**.
2. Hover over the **Remember me** row: a **?** appears at its end. Hover over
   the **?**: its tooltip says the switch keeps you logged in after the browser
   is closed, for 24 hours as the admin and 30 days as the surveillance user.
3. In a normal window, sign in as `admin` with the password `password` and
   **Remember me** left on. Quit the browser completely, start it again and
   open the link: you are still signed in. A private window would not show
   this, because closing it drops every cookie.
4. In a private window, turn **Remember me** off and sign in. Close every
   private window, open a new one and open the link again: the login dialog is
   back.
5. Optionally, look at the `user` cookie in the browser's developer tools:
   with the switch off it expires with the session, with it on about a day
   later.

A browser that restores the previous session can keep session cookies across
a restart, which is why step 4 uses a private window. The preview's own
access cookie lasts a day and is set again whenever the link is opened, so it
does not affect either step.
