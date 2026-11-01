import html
import mimetypes
import os
import shutil
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote, unquote

PORT = 8030
ROOT = "/uploads"
AREAS = {"ftp": "/srv/uploads/ftp", "sftp": "/srv/uploads/sftp", "smb": "/srv/uploads/smb"}


def area_files(area: str) -> list[str]:
    base = AREAS[area]
    found = []
    for directory, _, names in os.walk(base):
        for name in names:
            found.append(os.path.relpath(os.path.join(directory, name), base))
    return sorted(found)


def section(title: str, links: list[tuple[str, str]]) -> str:
    items = "".join(f'<li><a href="{href}">{html.escape(text)}</a></li>' for href, text in links)
    return f"<h2>{html.escape(title)}</h2><ul>{items or '<li>(empty)</li>'}</ul>"


def index() -> bytes:
    parts = ["<!doctype html><meta charset=utf-8><title>Preview uploads</title><h1>Uploads</h1>"]
    for area in AREAS:
        links = [(f"{ROOT}/files/{area}/{quote(path)}", path) for path in area_files(area)]
        parts.append(section(area.upper(), links))
    return "".join(parts).encode()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = unquote(self.path.split("?", 1)[0])
        if path in (ROOT, f"{ROOT}/"):
            self.send(200, "text/html; charset=utf-8", index())
        elif path.startswith(f"{ROOT}/files/"):
            self.send_area_file(path.removeprefix(f"{ROOT}/files/"))
        else:
            self.send(404, "text/plain", b"not found")

    def send(self, status: int, content_type: str, body: bytes) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_area_file(self, rest: str) -> None:
        area, _, relative = rest.partition("/")
        base = AREAS.get(area)
        target = os.path.realpath(os.path.join(base, relative)) if base else ""
        if not base or not target.startswith(base + os.sep) or not os.path.isfile(target):
            self.send(404, "text/plain", b"not found")
            return
        self.send_response(200)
        self.send_header(
            "Content-Type", mimetypes.guess_type(target)[0] or "application/octet-stream"
        )
        self.send_header("Content-Length", str(os.path.getsize(target)))
        self.end_headers()
        with open(target, "rb") as source:
            shutil.copyfileobj(source, self.wfile)

    def log_message(self, format, *args):
        pass


ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
