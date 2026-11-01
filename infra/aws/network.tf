data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "preview" {
  cidr_block         = "10.80.0.0/24"
  enable_dns_support = false
  tags               = { Name = "vivarium-preview" }
}

resource "aws_subnet" "preview" {
  count             = 2
  vpc_id            = aws_vpc.preview.id
  cidr_block        = cidrsubnet(aws_vpc.preview.cidr_block, 1, count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags              = { Name = "vivarium-preview-${count.index}" }
}

resource "aws_security_group" "preview" {
  name        = "vivarium-preview"
  description = "Preview MicroVMs: no rules, so nothing leaves them."
  vpc_id      = aws_vpc.preview.id
}

resource "aws_iam_role" "preview_network" {
  name                 = "vivarium-preview-network"
  description          = "Lets Lambda manage the network interfaces of the preview egress connector."
  permissions_boundary = aws_iam_policy.workload_boundary.arn
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = ["lambda.amazonaws.com", "network-connectors.lambda.amazonaws.com"] }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "preview_network" {
  name = "preview-network"
  role = aws_iam_role.preview_network.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["ec2:CreateNetworkInterface", "ec2:DeleteNetworkInterface"]
        Resource = [
          "arn:aws:ec2:${var.aws_region}:${local.account_id}:network-interface/*",
          aws_security_group.preview.arn,
          aws_subnet.preview[0].arn,
          aws_subnet.preview[1].arn,
        ]
      },
      {
        Effect    = "Allow"
        Action    = "ec2:CreateTags"
        Resource  = "arn:aws:ec2:${var.aws_region}:${local.account_id}:network-interface/*"
        Condition = { StringEquals = { "ec2:ManagedResourceOperator" = "network-connectors.lambda.amazonaws.com" } }
      },
      {
        Effect   = "Allow"
        Action   = "ec2:Describe*"
        Resource = "*"
      },
    ]
  })
}

resource "aws_lambdacore_network_connector" "preview" {
  name          = "vivarium-preview-no-egress"
  operator_role = aws_iam_role.preview_network.arn
  configuration {
    vpc_egress_configuration {
      subnet_ids                        = aws_subnet.preview[*].id
      security_group_ids                = [aws_security_group.preview.id]
      network_protocol                  = "IPv4"
      associated_compute_resource_types = ["MicroVm"]
    }
  }

  depends_on = [aws_iam_role_policy.preview_network]
}
