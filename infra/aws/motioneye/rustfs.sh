#!/usr/bin/env sh
RUSTFS_ACCESS_KEY=preview RUSTFS_SECRET_KEY=password RUSTFS_TLS_PATH=/etc/preview/rustfs \
  exec /usr/local/bin/rustfs server --address 127.0.0.1:9100 /srv/s3
