# motionEye #3512 — the Google key through a loopback redirect

[motioneye-project/motioneye#3512](https://github.com/motioneye-project/motioneye/pull/3512)
fixes [#2516](https://github.com/motioneye-project/motioneye/issues/2516):
Google stopped the copy-and-paste flow motionEye used to get a Google Drive or
Google Photos key. The pull request gets it through a loopback redirect with
PKCE, and explains the steps in a dialog before it opens Google.

## Checking it in the preview

1. Sign in as `admin` with the password `password`.
2. In camera 1's **File storage**, turn on **Upload Media Files** and choose
   **Google Drive** as the **Upload Service**.
3. Click **Obtain key**. A dialog, **Obtaining the key from Google**, lists
   three steps and a two-paragraph note. The second paragraph warns that
   testing the upload with the new key replaces the current Google
   authorization, even before the settings are applied.
4. Click **Cancel**: nothing opens. Click **Obtain key** again and **OK**:
   Google's sign-in page opens in a new tab. Stop there. Do not sign in or
   allow access: the key would land in this shared preview, which anyone with
   the link can open.
5. Choose **Dropbox** instead and click **Obtain key**: Dropbox opens
   directly, without the dialog.

Google's page opens in the reviewer's browser, not in the MicroVM, so the
preview's blocked outbound traffic does not stop it.
