terraform {
  required_version = ">= 1.7"

  backend "gcs" {
    bucket = "mailmon-dev-494511-terraform-state"
    prefix = "terraform/state"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.28.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 7.28.0"
    }
  }
}
