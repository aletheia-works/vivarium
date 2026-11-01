import html
import mimetypes
import os
import shutil
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote, unquote

PORT = 8030
ROOT = "/uploads"
AREAS = {"ftp": "/srv/uploads/ftp", "sftp": "/srv/uploads/sftp", "smb": "/srv/uploads/smb"}
RUSTFS = "/usr/local/bin/rustfs"
S3_ENDPOINT = "https://127.0.0.1:9100"


def area_files(area: str) -> list[str]:
    base = AREAS[area]
    found = []
    for directory, _, names in os.walk(base):
        for name in names:
            found.append(os.path.relpath(os.path.join(directory, name), base).replace(os.sep, "/"))
    return sorted(found)


def s3_client():
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id="preview",
        aws_secret_access_key="password",
        region_name="us-east-1",
        verify=False,
    )


def s3_objects() -> list[tuple[str, str]]:
    s3 = s3_client()
    found = []
    for bucket in s3.list_buckets().get("Buckets", []):
        for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket["Name"]):
            found += [(bucket["Name"], item["Key"]) for item in page.get("Contents", [])]
    return found


def section(title: str, links: list[tuple[str, str]]) -> str:
    items = "".join(f'<li><a href="{href}">{html.escape(text)}</a></li>' for href, text in links)
    return f"<h2>{html.escape(title)}</h2><ul>{items or '<li>(empty)</li>'}</ul>"


def index() -> bytes:
    parts = ["<!doctype html><meta charset=utf-8><title>Preview uploads</title><h1>Uploads</h1>"]
    for area in AREAS:
        links = [(f"{ROOT}/files/{area}/{quote(path)}", path) for path in area_files(area)]
        parts.append(section(area.upper(), links))
    if os.path.exists(RUSTFS):
        try:
            links = [(f"{ROOT}/s3/{quote(b)}/{quote(k)}", f"{b}/{k}") for b, k in s3_objects()]
            parts.append(section("S3", links))
        except Exception as error:
            parts.append(f"<h2>S3</h2><p>{html.escape(repr(error))}</p>")
    return "".join(parts).encode()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = unquote(self.path.split("?", 1)[0])
        if path in (ROOT, f"{ROOT}/"):
            self.send(200, "text/html; charset=utf-8", index())
        elif path.startswith(f"{ROOT}/files/"):
            self.send_area_file(path.removeprefix(f"{ROOT}/files/"))
        elif path.startswith(f"{ROOT}/s3/") and os.path.exists(RUSTFS):
            self.send_object(path.removeprefix(f"{ROOT}/s3/"))
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
        with open(target, "rb") as source:
            self.send_download(os.path.basename(target), os.path.getsize(target), source)

    def send_object(self, rest: str) -> None:
        bucket, _, key = rest.partition("/")
        try:
            item = s3_client().get_object(Bucket=bucket, Key=key)
        except Exception:
            self.send(404, "text/plain", b"not found")
            return
        self.send_download(key.rsplit("/", 1)[-1], item["ContentLength"], item["Body"])

    def send_download(self, name: str, length: int, source) -> None:
        self.send_response(200)
        self.send_header(
            "Content-Type", mimetypes.guess_type(name)[0] or "application/octet-stream"
        )
        self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{quote(name)}")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(length))
        self.end_headers()
        shutil.copyfileobj(source, self.wfile)

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
