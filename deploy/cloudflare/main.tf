terraform {
  required_version = ">= 1.6.0, < 2.0.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.28.0"
    }
  }
}

provider "cloudflare" {}

variable "account_id" {
  description = "Cloudflare account ID. Authentication uses CLOUDFLARE_API_TOKEN."
  type        = string

  validation {
    condition     = can(regex("^[a-fA-F0-9]{32}$", var.account_id))
    error_message = "Supply the 32-character Cloudflare account ID."
  }
}

variable "project_name" {
  description = "Pages project name; must be available in your account."
  type        = string
  default     = "abi-games"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{0,57}$", var.project_name))
    error_message = "Use 1-58 lowercase letters, numbers, or hyphens, starting with a letter or number."
  }
}

variable "production_branch" {
  description = "Branch label used by Wrangler for production deployments."
  type        = string
  default     = "main"
}

variable "custom_domain" {
  description = "Hostname to associate. Currently games.jarbas.dev.br; set null to use only pages.dev. Does not purchase a domain."
  type        = string
  default     = "games.jarbas.dev.br"
  nullable    = true

  validation {
    condition     = var.custom_domain == null ? true : can(regex("^[a-z0-9][a-z0-9.-]*\\.[a-z]{2,}$", var.custom_domain))
    error_message = "Use a lowercase hostname without a scheme or path, or null."
  }
}

variable "zone_id" {
  description = "Optional Cloudflare zone ID. When supplied with custom_domain, Terraform creates its CNAME."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.zone_id == null ? true : can(regex("^[a-fA-F0-9]{32}$", var.zone_id))
    error_message = "Supply a 32-character Cloudflare zone ID or null."
  }
}

resource "cloudflare_pages_project" "site" {
  account_id        = var.account_id
  name              = var.project_name
  production_branch = var.production_branch
}

resource "cloudflare_pages_domain" "site" {
  count        = var.custom_domain == null ? 0 : 1
  account_id   = var.account_id
  project_name = cloudflare_pages_project.site.name
  name         = var.custom_domain
}

resource "cloudflare_dns_record" "site" {
  count   = var.custom_domain != null && var.zone_id != null ? 1 : 0
  zone_id = var.zone_id
  name    = var.custom_domain
  type    = "CNAME"
  content = cloudflare_pages_project.site.subdomain
  proxied = true
  ttl     = 1

  depends_on = [cloudflare_pages_domain.site]
}

output "pages_url" {
  description = "Available after the first successful asset deployment."
  value       = "https://${cloudflare_pages_project.site.subdomain}"
}

output "custom_url" {
  value = var.custom_domain == null ? null : "https://${var.custom_domain}"
}

output "deploy_command" {
  description = "Run from the repository root after npm run build."
  value       = "npx wrangler@4 pages deploy dist --project-name=${var.project_name} --branch=${var.production_branch}"
}