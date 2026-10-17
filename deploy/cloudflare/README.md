# Cloudflare Pages deployment

This configuration creates a Direct Upload Pages project for the static Vite app.
Terraform manages the project and optional domain/DNS, not the contents of `dist`.
It does not create a Worker, database, subscription, or purchase a domain.
The existing deleted files under `infrastructure` are unrelated and are not reused.

## Prerequisites

- Terraform 1.6 or newer (below 2.0), Node.js 22+, and npm.
- A Cloudflare account and an API token with Account / Cloudflare Pages / Edit.
- For Terraform-managed DNS, also grant Zone / DNS / Edit for the intended zone.
- An apex custom domain requires that its zone is active in the same Cloudflare
  account. Register the domain and configure its nameservers separately.
- Confirm you may publicly redistribute the bundled game images and other assets.

## Deploy from the devcontainer (Bash)

The repository devcontainer installs Terraform 1.9.8 and Node.js 22. In VS Code,
run **Dev Containers: Rebuild and Reopen in Container** after changing its
configuration. Open a new Bash terminal inside the container and run the commands
below from the repository root. No Windows Terraform installation is required.

```bash
terraform -version
node --version
```

The PowerShell token environment is not automatically shared with this container.
Enter a new token inside Bash using a hidden prompt; never paste it in chat:

```bash
read -r -s -p 'Cloudflare API token: ' CLOUDFLARE_API_TOKEN
printf '\n'
export CLOUDFLARE_API_TOKEN
```

Keep the existing local `terraform.tfvars` if already configured. Only for a fresh
checkout, create it and fill in account and zone IDs:

```bash
test -f deploy/cloudflare/terraform.tfvars || cp deploy/cloudflare/terraform.tfvars.example deploy/cloudflare/terraform.tfvars
```

Initialize providers inside Linux even if Terraform was previously initialized
on Windows. The lockfile is portable; installed provider binaries are not.

```bash
terraform -chdir=deploy/cloudflare init
export CLOUDFLARE_ACCOUNT_ID="$(terraform -chdir=deploy/cloudflare console <<< 'var.account_id' | tr -d '\"')"
terraform -chdir=deploy/cloudflare fmt -check
terraform -chdir=deploy/cloudflare validate
terraform -chdir=deploy/cloudflare plan -out=deployment.tfplan
```

Review the plan. For a new project, it should create the Pages project, its
`games.jarbas.dev.br` domain association and that hostname's CNAME only. It must
not modify the apex domain or any other sites. After review:

```bash
terraform -chdir=deploy/cloudflare apply deployment.tfplan
npm ci && npm test && npm run build && npx wrangler@4 pages deploy dist --project-name=abi-games --branch=main
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
```

## Deploy from Windows (PowerShell)

Keep the token out of chat, source files, command history, and Terraform variables.
In PowerShell, enter it using a masked prompt:

```powershell
$secureToken = Read-Host 'Cloudflare API token' -AsSecureString
$env:CLOUDFLARE_API_TOKEN = [System.Net.NetworkCredential]::new('', $secureToken).Password
```

## Create the project

From the repository root:

```powershell
Copy-Item deploy/cloudflare/terraform.tfvars.example deploy/cloudflare/terraform.tfvars
terraform -chdir=deploy/cloudflare init
```

Edit `terraform.tfvars` with your account ID. The default custom domain is
`games.jarbas.dev.br`, within the existing `jarbas.dev.br` Cloudflare zone.
Set `zone_id` to the `jarbas.dev.br` zone's ID to manage only the games CNAME. With
`zone_id = null`, DNS remains unmanaged and must already point to the Pages project
or be configured separately. To deploy first using only `pages.dev`, explicitly
set both `custom_domain` and `zone_id` to null.

```powershell
terraform -chdir=deploy/cloudflare fmt -check
terraform -chdir=deploy/cloudflare validate
terraform -chdir=deploy/cloudflare plan -out=deployment.tfplan
terraform -chdir=deploy/cloudflare apply deployment.tfplan
```

Review the plan before applying. Existing Pages projects or DNS records must be
imported rather than recreated. No existing DNS is automatically overwritten.
The local state is ignored by Git; back it up securely. Commit the generated
`.terraform.lock.hcl` to pin provider checksums. Use a secured remote backend before
multiple people or CI manage this same infrastructure.

## Publish the game

Still from the repository root, with the token environment variable available:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = 'YOUR_ACCOUNT_ID'
npm ci
npm test
npm run build
npx wrangler@4 pages deploy dist --project-name=abi-games --branch=main
```

If you changed the project name or production branch, use the command printed by
`terraform -chdir=deploy/cloudflare output -raw deploy_command` instead.
The upload command publishes publicly; run it only when ready. The app's build
downloads missing assets through `sync:assets`, so build with network access.
This project has no native Pages Git integration. Releases can use the GitHub
Actions workflow below or another manual build/upload.
Direct Upload projects cannot later be switched to Pages Git integration in place.

## GitHub Actions deployment

The workflow `.github/workflows/deploy-cloudflare.yml` tests and builds on every
push to `main`. It uploads only that tested build to the existing `abi-games`
Pages project. You can also run it from Actions / Deploy Cloudflare Pages /
Run workflow, selecting `main`. Manual runs on other branches are skipped.

Before enabling deployments:

1. Create the Pages project and configure `games.jarbas.dev.br` using Terraform.
  The workflow does not apply Terraform, create DNS, or provision the project.
2. In GitHub, open Settings / Environments and create `production`.
3. Add environment secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
  Use a new token with Cloudflare Pages Edit scoped to the intended account;
  the deployment workflow does not need DNS permission. Never use a token
  previously exposed in chat or commit it to the repository.
4. Restrict the environment to `main`, and optionally require deployment approval
  where your GitHub plan supports environment protection rules.

Tests/build run without Cloudflare credentials. Only the publish step receives
them, after the production environment's approval rules. Asset synchronization
is handled by `npm run build` and needs network access. The workflow publishes
publicly at `https://games.jarbas.dev.br` once the custom domain is active.
Deployment runs are serialized so concurrent uploads do not race.

## Attach games.jarbas.dev.br

After the initial `pages.dev` deployment succeeds, set:

```hcl
custom_domain = "games.jarbas.dev.br"
zone_id       = "YOUR_32_CHARACTER_ZONE_ID"
```

Run `plan` and `apply` again using the same commands above. This associates the
hostname and creates a proxied CNAME to the project's actual Pages subdomain.
TLS/domain validation may take time; verify the domain becomes Active in Pages.
This does not add `www` or a redirect, and does not change nameservers.
Check existing A, AAAA, and CNAME records for `games.jarbas.dev.br` before applying:
pointing this hostname to Pages replaces the website currently served there.
If its CNAME already exists, import it into `cloudflare_dns_record.site[0]`
instead of creating a duplicate. Do not change apex records for `jarbas.dev.br`
or records for other subdomains. Keep unrelated records, including MX/TXT, intact.
For an external subdomain, leave `zone_id = null` and create the required CNAME
with the DNS provider yourself. That does not work for an external apex zone.

When done, remove credentials from the current PowerShell session:

```powershell
Remove-Item Env:CLOUDFLARE_API_TOKEN
Remove-Item Env:CLOUDFLARE_ACCOUNT_ID -ErrorAction SilentlyContinue
Remove-Variable secureToken -ErrorAction SilentlyContinue
```