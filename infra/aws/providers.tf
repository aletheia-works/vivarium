provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "vivarium"
      ManagedBy = "opentofu"
    }
  }
}

provider "awscc" {
  region = var.aws_region
}
