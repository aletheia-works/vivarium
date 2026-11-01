import http.cookiejar
import json
import os
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
UPLOADS_UI = "http://127.0.0.1:8030/uploads/"
GREETINGS = {("127.0.0.1", 21): b"220", ("127.0.0.1", 22): b"SSH-"}
SMB = ("127.0.0.1", 445)
S3 = ("127.0.0.1", 9100)
RUSTFS = "/usr/local/bin/rustfs"
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


def receiving_uploads() -> bool:
    try:
        with urllib.request.urlopen(UPLOADS_UI, timeout=10) as r:
            if r.status != 200:
                return False
        for address, greeting in GREETINGS.items():
            with socket.create_connection(address, timeout=3) as s:
                if not s.recv(64).startswith(greeting):
                    return False
        socket.create_connection(SMB, timeout=3).close()
        if os.path.exists(RUSTFS):
            insecure = ssl.create_default_context()
            insecure.check_hostname = False
            insecure.verify_mode = ssl.CERT_NONE
            with socket.create_connection(S3, timeout=3) as raw, insecure.wrap_socket(raw):
                pass
    except OSError:
        return False
    return True


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        hook = self.path.removeprefix(HOOKS)
        if hook in ("ready", "validate"):
            status = 200 if serving_pictures() and catching_mail() and receiving_uploads() else 503
        elif hook in ("run", "resume", "suspend", "terminate"):
            status = 200
        else:
            status = 404
        self.send_response(status)
        self.send_header("Content-Length", "0")
        self.end_headers()

    do_POST = do_GET


ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
