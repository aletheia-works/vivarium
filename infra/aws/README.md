# `infra/aws/` — preview environments on Lambda MicroVMs

OpenTofu configuration for running a project's backend, at a given commit, as
a preview a reviewer opens in a browser. Each preview is a
[Lambda MicroVM](https://docs.aws.amazon.com/lambda/latest/dg/microvms-launching.html)
image built from that commit, and a public function URL in front of it.

The first preview is motionEye with four fake cameras. The approach was tried
step by step in the `spikes/motioneye-microvm` spike first.

## What is managed

| File | Resources |
|---|---|
| [storage.tf](storage.tf) | The private, versioned S3 bucket for the images' code artifacts |
| [previews.tf](previews.tf) | Per preview: the MicroVM image, the proxy function, its URL, key and log group. Shared: the build and proxy roles and the build log group |

`local.previews` in `previews.tf` lists the previews, each a repository and a
commit.

### The image

The code artifact is a zip of [motioneye/Dockerfile.tftpl](motioneye/Dockerfile.tftpl)
and the files beside it. The build downloads the commit's tarball from GitHub
and installs it, so the zip carries no file modes that matter. The image adds:

- `fakecam.py`: four cameras on `127.0.0.1:9900`, each a moving square and the
  time, so the preview needs no real camera.
- `seed.py`: adds the four cameras to motionEye's configuration at build time.
- `hooks.py`: the lifecycle hooks on port 9000. `ready` and `validate` answer
  200 only once motionEye serves a picture from every camera, so Lambda
  snapshots a running motionEye with frames flowing.

The image is ARM_64 with 1 GB.

### The proxy

[preview-proxy/index.mjs](preview-proxy/index.mjs) runs behind each preview's
function URL with `RESPONSE_STREAM`.

- **Access**: the link carries `?vivarium-key=<key>`. The proxy turns it into
  an `HttpOnly` cookie and redirects to the same path without the key. A
  request without the cookie gets 403, before any AWS call.
- **The MicroVM**: the proxy reuses the image's live MicroVM, or starts one.
  The MicroVM suspends after 5 minutes without traffic, resumes on the next
  request, and ends after an hour suspended or 8 hours in all.
- **Forwarding**: the proxy streams motionEye's answers back to the browser.

`node --test infra/aws/preview-proxy/` runs its tests without AWS.

### Cost

In the spike, an hour of one reviewer watching four cameras came to about
$0.15. That figure is an estimate from third-party us-east-1 rates, not a
bill. A suspended MicroVM costs no compute.

## Open points

- motionEye's admin and user passwords are empty. motionEye applies no
  setting until both are set.
- The state is local. Planning and applying from CI, with a recipe per
  preview, is the next stage.
- CI does not run the proxy's tests yet.

## Running it locally (日本語)

AWS の認証情報は、この会話や tfvars に貼り付けません。すべて本人の端末で、本人の
認証情報を使って実行します。aws CLI は Docker で動かします。

1. ログインします。

   ```powershell
   & "C:\Program Files\Docker\Docker\resources\bin\docker.exe" run --rm -it -v "$HOME\.aws:/root/.aws" amazon/aws-cli:2.37.12 login --remote
   ```

2. 同じ PowerShell で、認証情報を環境変数に読み込みます。

   ```powershell
   & "C:\Program Files\Docker\Docker\resources\bin\docker.exe" run --rm -v "$HOME\.aws:/root/.aws" amazon/aws-cli:2.37.12 configure export-credentials --format powershell | Invoke-Expression
   ```

3. そのまま plan と apply を実行します。読み込んだ認証情報は短時間で期限が切れ、
   イメージのビルドは数分かかるので、apply の直前に手順 2 をやり直してください。

   ```powershell
   mise run infra:aws:plan
   mise run infra:aws:apply
   ```

4. レビュアーに渡すリンクは、次のコマンドで表示します。リンクにはキーが入っています。

   ```powershell
   mise run infra:aws:links
   ```

state（`infra/aws/terraform.tfstate`）は手元にしかありません。消さないでください。
