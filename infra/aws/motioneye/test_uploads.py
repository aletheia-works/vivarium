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


if __name__ == "__main__":
    unittest.main()
