# motionEye #3513 — the 0.45.0b1 beta

[motioneye-project/motioneye#3513](https://github.com/motioneye-project/motioneye/pull/3513)
merges `dev` into `beta` to release 0.45.0b1. The preview runs `dev` at the
commit in `preview.json`; a newer push to `dev` needs a new commit here.

## Checking it in the preview

1. Sign in as `admin` with the password `password`.
2. In a camera's **Motion Notifications**, turn on **Send An Email** with the
   SMTP server `127.0.0.1`, port `1025`, **Use TLS** on and any account. With
   **Verify certificate** on, **Test Email** fails on the self-signed
   certificate; turn it off, and the test e-mail arrives at `/mailpit/` of
   the preview link. **Use TLS** is STARTTLS here; implicit TLS on `1465`
   waits for motioneye-project/motioneye#2896.
3. In **File storage**, turn on **Upload Media Files** with the FTP service at
   `127.0.0.1`, port `21`, user `preview` and password `password`. Turn on
   the new **Use TLS (FTPS)** and turn off **Verify certificate**. Uploaded
   files show up at `/uploads/` of the preview link.
4. Use the new buttons on a camera to start and end a motion event and to
   toggle motion detection.
5. Open a camera's pictures and movies, play a movie, close it and play it
   again. Every camera has two days of recordings.
6. Change the layout and the camera order. They are now kept per browser, and
   the number of columns follows the window width by default.

Steps 2 and 3 need the mail catcher and the upload targets described in
[`../README.md`](../README.md).
