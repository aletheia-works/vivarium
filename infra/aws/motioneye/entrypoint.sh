#!/usr/bin/env sh
set -e
python3 /usr/local/lib/preview/fakecam.py &
python3 /usr/local/lib/preview/hooks.py &
/usr/local/bin/mailpit --smtp 127.0.0.1:1025 --listen 0.0.0.0:8025 --webroot /mailpit/ \
  --smtp-tls-cert /etc/mailpit/cert.pem --smtp-tls-key /etc/mailpit/key.pem \
  --smtp-auth-accept-any --smtp-auth-allow-insecure --disable-version-check &
python3 /usr/local/lib/preview/smtps.py &
exec /usr/local/bin/meyectl startserver -c /etc/motioneye/motioneye.conf
