# `infra/aws/` — preview environments on Lambda MicroVMs

OpenTofu configuration for running a project's backend, at a given commit, as
a preview a reviewer opens in a browser. Each preview is a
[Lambda MicroVM](https://docs.aws.amazon.com/lambda/latest/dg/microvms-launching.html)
image built from that commit, and a public function URL in front of it.

The first preview ran motionEye with four fake cameras. The approach was tried
step by step in a spike first
([aletheia-works/vivarium#615](https://github.com/aletheia-works/vivarium/pull/615)).

## What is managed

| File | Resources |
|---|---|
| [iam.tf](iam.tf) | The CI roles for plan and apply and the permissions boundary, created by hand and imported |
| [storage.tf](storage.tf) | The private, versioned S3 bucket for the images' code artifacts |
| [previews.tf](previews.tf) | Per preview: the MicroVM image, the proxy function, its URL, key and log group. Shared: the build and proxy roles and the build log group |
| [network.tf](network.tf) | The egress connector the proxy runs every preview MicroVM with: a VPC with no internet gateway, NAT or DNS resolver, two subnets, a security group with no rules, and the role Lambda uses for the connector's network interfaces |

Each preview is a recipe under [`src/layer3_previews/`](../../src/layer3_previews/README.md):
a `<project>-<pull>/preview.json` naming the repository, the pull request and
the commit. `previews.tf` reads them, so adding a recipe adds a preview and
removing it removes the preview.

### The image

The code artifact is a zip of [motioneye/Dockerfile.tftpl](motioneye/Dockerfile.tftpl)
and the files beside it. The build downloads the commit's tarball from GitHub
and installs it, so the zip carries no file modes that matter. The image adds:

- `fakecam.py`: four cameras on `127.0.0.1:9900`, each a moving square and the
  time, so the preview needs no real camera.
- `seed.py`: adds the four cameras to motionEye's configuration at build time,
  and sets the `admin` and `user` passwords to `password`. motionEye applies no
  setting while either password is empty, and the preview's key already keeps
  strangers out, so the passwords only spare the reviewer that step.
- `hooks.py`: the lifecycle hooks on port 9000. `ready` and `validate` answer
  200 only once motionEye serves a picture from every camera and mailpit
  answers on its UI, on 1025 and over TLS on 1465, so Lambda snapshots a
  running motionEye with frames flowing and mail being caught.
- mailpit 1.33.0, downloaded at build time and checked against its SHA-256,
  with a self-signed certificate made at build time. It takes SMTP on
  `127.0.0.1:1025` (plain or STARTTLS) and serves its UI on port 8025 under
  `/mailpit/`. It is never given a relay, so mail stays in the MicroVM.
- `smtps.py`: implicit TLS on `127.0.0.1:1465`, passed on to mailpit, for
  motionEye's TLS mode.
- `media.py`: at build time, two days of pictures and short MP4 movies per
  camera, dated before the build, so the media browser is not empty.

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
- **Forwarding**: the proxy sends paths under `/mailpit/` to mailpit on port
  8025 and everything else to motionEye on 8765, and streams the answers back
  to the browser. Its MicroVM token allows only those two ports.

Before applying, the apply workflow ends the MicroVMs of every image the plan
deletes or replaces ([preview-proxy/end-microvms.mjs](preview-proxy/end-microvms.mjs)):
deleting an image failed while a MicroVM a reviewer had used was still
suspended.

`mise run ci:previews` runs its tests without AWS, and CI runs them on a PR
that changes the proxy. `mise run infra:aws:check` lints it with the docs
site's Biome settings.

### Cost

In the spike, an hour of one reviewer watching four cameras came to about
$0.15. That figure is an estimate from third-party us-east-1 rates, not a
bill. A suspended MicroVM costs no compute.

## CI

[aws-terraform-plan.yml](../../.github/workflows/aws-terraform-plan.yml)
plans a PR that changes this module and posts the plan on it.
[aws-terraform-apply.yml](../../.github/workflows/aws-terraform-apply.yml)
applies `main`. Both follow formicarium's `infra/aws`: they assume a role
through GitHub's OIDC token, so no AWS key is stored; the plan runs on
`pull_request_target` only for a PR from this repository or from someone with
write access; and the state is encrypted with `TF_STATE_PASSPHRASE` and kept
as the `terraform-state-aws` artifact of the run that
`LATEST_AWS_APPLY_RUN_ID` names.

Retry a failed apply with a new run (`gh workflow run aws-terraform-apply.yml
--ref main`), not a re-run. A re-run of a failed apply loaded the state the
failed attempt had read, even after a later apply had saved a newer one. It
then pointed `LATEST_AWS_APPLY_RUN_ID` back at that older state.

The account runs other stacks, so the roles are narrow. Both read through
`tofu-read` ([bootstrap/read-policy.json.tftpl](bootstrap/read-policy.json.tftpl)).
The apply role, which only the `aws-apply` environment on `main` can assume,
may write only `vivarium-*` buckets, functions, MicroVM images, roles and
`/vivarium/*` log groups, network connectors, and VPCs, subnets and security
groups tagged `Project=vivarium`, and may create a role only inside the
`vivarium-workload-boundary` permissions boundary. It cannot change the
boundary or the CI roles: they are made by hand from [bootstrap/](bootstrap/),
and a plan reports any change made to them since.

## Setup (日本語)

AWS の認証情報は、この会話や tfvars に貼り付けません。すべて本人の端末で、本人の
認証情報を使って実行します。aws CLI は Docker で動かします。以下は PowerShell で、
リポジトリの `infra/aws` を current directory にして実行します。

### 0. ログインと認証情報

```powershell
$docker = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
& $docker run --rm -it -v "$HOME\.aws:/root/.aws" amazon/aws-cli:2.37.12 login --remote
& $docker run --rm -v "$HOME\.aws:/root/.aws" amazon/aws-cli:2.37.12 configure export-credentials --format powershell | Invoke-Expression
```

### 1. CI の role と permissions boundary を手で作る

template の `${account_id}` と `${subject_prefix}` を置き換えて、`.build/bootstrap/` に
書き出してから作ります。tag は provider の `default_tags` と同じにします（違うと plan が
tag の変更を出し、apply の role はこれらを変えられないので失敗します）。

```powershell
$aws = { & $docker run --rm -v "$HOME\.aws:/root/.aws" -v "${PWD}\.build\bootstrap:/bootstrap" amazon/aws-cli:2.37.12 @args }
$account = & $aws sts get-caller-identity --query Account --output text
New-Item -ItemType Directory -Force .build\bootstrap | Out-Null
foreach ($name in 'workload-boundary', 'trust-plan', 'trust-apply', 'read-policy', 'apply-policy') {
  (Get-Content "bootstrap\$name.json.tftpl" -Raw).Replace('${account_id}', $account).Replace('${subject_prefix}', 'repo:aletheia-works/vivarium') |
    Set-Content -NoNewline ".build\bootstrap\$name.json"
}
$tags = 'Key=Project,Value=vivarium', 'Key=ManagedBy,Value=opentofu'

& $aws iam create-policy --policy-name vivarium-workload-boundary --description 'The most any role this module creates may do.' --policy-document file:///bootstrap/workload-boundary.json --tags @tags

& $aws iam create-role --role-name github-actions-vivarium-tofu-plan --description 'OpenTofu plan for infra/aws. Reads this module only.' --assume-role-policy-document file:///bootstrap/trust-plan.json --tags @tags
& $aws iam put-role-policy --role-name github-actions-vivarium-tofu-plan --policy-name tofu-read --policy-document file:///bootstrap/read-policy.json

& $aws iam create-role --role-name github-actions-vivarium-tofu-apply --description 'OpenTofu apply for infra/aws from main.' --assume-role-policy-document file:///bootstrap/trust-apply.json --tags @tags
& $aws iam put-role-policy --role-name github-actions-vivarium-tofu-apply --policy-name tofu-read --policy-document file:///bootstrap/read-policy.json
& $aws iam put-role-policy --role-name github-actions-vivarium-tofu-apply --policy-name tofu-apply --policy-document file:///bootstrap/apply-policy.json
```

GitHub の OIDC provider（`token.actions.githubusercontent.com`）は、この account に既に
あるもの（formicarium と共有）を使います。新しくは作りません。

network connector を作るには、account に 1 つの service-linked role
`AWSServiceRoleForLambda` が要ります。apply の role には作る権限が無いので、まだ無い
account では 1 度だけ手で作ります。

```powershell
& $aws iam create-service-linked-role --aws-service-name lambda.amazonaws.com
```

### 2. GitHub 側

- [vivarium の Actions の変数](https://github.com/aletheia-works/vivarium/settings/variables/actions)
  に、次の 2 つを登録します。ARN には account ID が入るので、repo のコードには書きません。
  - `AWS_TOFU_PLAN_ROLE_ARN`：`arn:aws:iam::<account>:role/github-actions-vivarium-tofu-plan`
  - `AWS_TOFU_APPLY_ROLE_ARN`：`arn:aws:iam::<account>:role/github-actions-vivarium-tofu-apply`
- `aws-apply` environment は infra/github の `github_repository_environment.aws_apply` が
  作ります。この PR のマージで infra/github の Apply も走ります。
- state の暗号化は、infra/github と同じ organization secret の `TF_STATE_PASSPHRASE` を
  使います。`LATEST_AWS_APPLY_RUN_ID` は最初の Apply が作ります。

### 3. 最初の Apply

マージすると AWS Terraform Apply が走り、import block で手作りの role と boundary を
取り込み、残りを作って、state を保存します。infra/github の Apply より先に走って
`aws-apply` environment がまだ無いと失敗するので、そのときは infra/github の Apply が
終わってから AWS Terraform Apply を `workflow_dispatch` で新しく実行してください。

### 4. レビュアーに渡すリンク

リンクにはキーが入っているので、state から本人の端末で取り出します。`$passphrase` は
`TF_STATE_PASSPHRASE` の値です。

```powershell
$run = gh variable get LATEST_AWS_APPLY_RUN_ID --repo aletheia-works/vivarium
gh run download $run --repo aletheia-works/vivarium --name terraform-state-aws --dir .
$env:TF_ENCRYPTION = @"
key_provider "pbkdf2" "state" {
  passphrase = "$passphrase"
}
method "aes_gcm" "state" {
  keys = key_provider.pbkdf2.state
}
state {
  method = method.aes_gcm.state
}
"@
tofu init
tofu output -json preview_links
```

### CI の role と boundary を変えるとき

`bootstrap/` の template を変えた PR は、マージの前に、変えた policy を手順 1 と同じ方法で
手で更新します（apply の role はこれらを変えられないので、更新しないと Apply が
失敗します）。inline policy は `iam put-role-policy`、boundary は
`iam create-policy-version --set-as-default` です。
