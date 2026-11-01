import io
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import uploads


class UploadsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = os.path.realpath(cls.tmp.name)
        cls.outside = os.path.join(root, "outside.txt")
        with open(cls.outside, "w") as f:
            f.write("secret")
        areas = {name: os.path.join(root, name) for name in ("ftp", "sftp", "smb")}
        for path in areas.values():
            os.makedirs(path)
        os.makedirs(os.path.join(areas["ftp"], "2026-11-02"))
        cls.write(areas["ftp"], "2026-11-02/09-00-00.jpg", b"\xff\xd8jpeg")
        cls.write(areas["sftp"], "space and ü.txt", b"unicode")
        cls.write(areas["smb"], "a&b.html", b"<script>alert(1)</script>")
        uploads.AREAS = areas
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), uploads.Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.tmp.cleanup()

    @staticmethod
    def write(area: str, relative: str, data: bytes) -> None:
        with open(os.path.join(area, relative), "wb") as f:
            f.write(data)

    def get(self, path: str):
        return urllib.request.urlopen(self.base + path, timeout=5)

    def status(self, path: str) -> int:
        try:
            with self.get(path) as r:
                return r.status
        except urllib.error.HTTPError as error:
            error.close()
            return error.code

    def test_listing_shows_every_area_and_escapes_names(self):
        page = self.get("/uploads/").read().decode()
        for title in ("FTP", "SFTP", "SMB"):
            self.assertIn(f"<h2>{title}</h2>", page)
        self.assertIn('href="/uploads/files/ftp/2026-11-02/09-00-00.jpg"', page)
        self.assertIn(">a&amp;b.html<", page)
        self.assertNotIn(">a&b.html<", page)

    def test_nested_file_downloads_as_an_attachment(self):
        with self.get("/uploads/files/ftp/2026-11-02/09-00-00.jpg") as r:
            self.assertEqual(r.read(), b"\xff\xd8jpeg")
            self.assertTrue(r.headers["Content-Disposition"].startswith("attachment;"))
            self.assertEqual(r.headers["X-Content-Type-Options"], "nosniff")

    def test_encoded_name_downloads(self):
        with self.get("/uploads/files/sftp/space%20and%20%C3%BC.txt") as r:
            self.assertEqual(r.read(), b"unicode")
            self.assertIn("space%20and%20%C3%BC.txt", r.headers["Content-Disposition"])

    def test_html_upload_is_not_rendered(self):
        with self.get("/uploads/files/smb/a%26b.html") as r:
            self.assertTrue(r.headers["Content-Disposition"].startswith("attachment;"))
            self.assertEqual(r.headers["X-Content-Type-Options"], "nosniff")

    def test_paths_outside_an_area_are_not_found(self):
        self.assertEqual(self.status("/uploads/files/ftp/..%2Foutside.txt"), 404)
        self.assertEqual(self.status("/uploads/files/ftp/../outside.txt"), 404)
        self.assertEqual(self.status("/uploads/files/nope/outside.txt"), 404)
        self.assertEqual(self.status("/uploads/files/ftp/2026-11-02"), 404)
        self.assertEqual(self.status("/elsewhere"), 404)

    def test_symlink_out_of_an_area_is_not_followed(self):
        link = os.path.join(uploads.AREAS["ftp"], "escape.txt")
        try:
            os.symlink(self.outside, link)
        except OSError as error:
            self.skipTest(f"cannot create a symlink here: {error}")
        self.assertEqual(self.status("/uploads/files/ftp/escape.txt"), 404)


class ClientError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.response = {"Error": {"Code": code}}


class FakeS3:
    def __init__(self, objects: dict[str, dict[str, bytes]]):
        self.objects = objects

    def list_buckets(self):
        return {"Buckets": [{"Name": name} for name in self.objects]}

    def get_paginator(self, _operation):
        return self

    def paginate(self, Bucket):
        keys = sorted(self.objects[Bucket])
        for start in range(0, len(keys), 2):
            yield {"Contents": [{"Key": key} for key in keys[start : start + 2]]}

    def get_object(self, Bucket, Key):
        if Bucket == "down":
            raise OSError("connection refused")
        if Bucket not in self.objects:
            raise ClientError("NoSuchBucket")
        if Key not in self.objects[Bucket]:
            raise ClientError("NoSuchKey")
        data = self.objects[Bucket][Key]
        return {"ContentLength": len(data), "Body": io.BytesIO(data)}


class S3UploadsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), uploads.Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.saved = (uploads.RUSTFS, uploads.s3_client, uploads.AREAS)
        uploads.AREAS = {}
        uploads.RUSTFS = __file__
        fake = FakeS3(
            {
                "motioneye": {
                    "2026-10-31/09-00-00.jpg": b"\xff\xd8jpeg",
                    "a b/ü.mp4": b"movie",
                    "c.jpg": b"c",
                    "d.html": b"<script>alert(1)</script>",
                }
            }
        )
        uploads.s3_client = lambda: fake

    def tearDown(self):
        uploads.RUSTFS, uploads.s3_client, uploads.AREAS = self.saved

    def status(self, path: str) -> int:
        try:
            with urllib.request.urlopen(self.base + path, timeout=5) as r:
                return r.status
        except urllib.error.HTTPError as error:
            error.close()
            return error.code

    def test_listing_reads_every_page_and_encodes_keys(self):
        page = urllib.request.urlopen(self.base + "/uploads/", timeout=5).read().decode()
        self.assertIn("<h2>S3</h2>", page)
        for key in ("2026-10-31/09-00-00.jpg", "a%20b/%C3%BC.mp4", "c.jpg", "d.html"):
            self.assertIn(f'href="/uploads/s3/motioneye/{key}"', page)

    def test_object_downloads_as_an_attachment(self):
        path = "/uploads/s3/motioneye/a%20b/%C3%BC.mp4"
        with urllib.request.urlopen(self.base + path, timeout=5) as r:
            self.assertEqual(r.read(), b"movie")
            self.assertEqual(
                r.headers["Content-Disposition"], "attachment; filename*=UTF-8''%C3%BC.mp4"
            )
            self.assertEqual(r.headers["X-Content-Type-Options"], "nosniff")

    def test_missing_object_or_bucket_is_not_found_and_an_outage_is_a_bad_gateway(self):
        self.assertEqual(self.status("/uploads/s3/motioneye/nope.jpg"), 404)
        self.assertEqual(self.status("/uploads/s3/nope/c.jpg"), 404)
        self.assertEqual(self.status("/uploads/s3/down/c.jpg"), 502)

    def test_without_rustfs_the_client_is_never_used(self):
        def refuse():
            raise AssertionError("s3_client called without RustFS")

        uploads.RUSTFS = "/nonexistent/rustfs"
        uploads.s3_client = refuse
        page = urllib.request.urlopen(self.base + "/uploads/", timeout=5).read().decode()
        self.assertNotIn("<h2>S3</h2>", page)
        self.assertEqual(self.status("/uploads/s3/motioneye/c.jpg"), 404)


if __name__ == "__main__":
    unittest.main()
