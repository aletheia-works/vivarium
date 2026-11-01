import http.cookiejar
import json
import socket
import ssl
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 9000
MOTIONEYE = "http://127.0.0.1:8765"
CAMERAS = range(1, 5)
MAILPIT_UI = "http://127.0.0.1:8025/mailpit/"
SMTP = ("127.0.0.1", 1025)
SMTPS = ("127.0.0.1", 1465)
HOOKS = "/aws/lambda-microvms/runtime/v1/"


def serving_pictures() -> bool:
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
    )
    login = urllib.request.Request(
        f"{MOTIONEYE}/login",
        data=json.dumps({"username": "admin", "password": "password"}).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        opener.open(login, timeout=3).read()
        for camera_id in CAMERAS:
            with opener.open(f"{MOTIONEYE}/picture/{camera_id}/current/", timeout=3) as r:
                if r.headers.get_content_type() != "image/jpeg" or not r.read():
                    return False
    except OSError:
        return False
    return True


def catching_mail() -> bool:
    insecure = ssl.create_default_context()
    insecure.check_hostname = False
    insecure.verify_mode = ssl.CERT_NONE
    try:
        with urllib.request.urlopen(MAILPIT_UI, timeout=3) as r:
            if r.status != 200:
                return False
        with socket.create_connection(SMTP, timeout=3) as s:
            if not s.recv(64).startswith(b"220"):
                return False
        with (
            socket.create_connection(SMTPS, timeout=3) as raw,
            insecure.wrap_socket(raw) as s,
        ):
            if not s.recv(64).startswith(b"220"):
                return False
    except OSError:
        return False
    return True


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        hook = self.path.removeprefix(HOOKS)
        if hook in ("ready", "validate"):
            status = 200 if serving_pictures() and catching_mail() else 503
        elif hook in ("run", "resume", "suspend", "terminate"):
            status = 200
        else:
            status = 404
        self.send_response(status)
        self.send_header("Content-Length", "0")
        self.end_headers()

    do_POST = do_GET


ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
