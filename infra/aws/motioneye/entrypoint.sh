#!/usr/bin/env sh
set -e
python3 /usr/local/lib/preview/fakecam.py &
python3 /usr/local/lib/preview/hooks.py &
/usr/local/bin/mailpit --smtp 127.0.0.1:1025 --listen 0.0.0.0:8025 --webroot /mailpit/ \
  --smtp-tls-cert /etc/preview/cert.pem --smtp-tls-key /etc/preview/key.pem \
  --smtp-auth-accept-any --smtp-auth-allow-insecure --disable-version-check &
python3 /usr/local/lib/preview/smtps.py &
mkdir -p /run/sshd
/usr/sbin/sshd
vsftpd /etc/vsftpd.conf &
smbd --daemon
if [ -x /usr/local/bin/rustfs ]; then
  RUSTFS_ACCESS_KEY=preview RUSTFS_SECRET_KEY=password RUSTFS_TLS_PATH=/etc/preview/rustfs \
    /usr/local/bin/rustfs server --address 127.0.0.1:9100 /srv/s3 &
fi
python3 /usr/local/lib/preview/uploads.py &
exec /usr/local/bin/meyectl startserver -c /etc/motioneye/motioneye.conf
