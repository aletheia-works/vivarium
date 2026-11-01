import os
import subprocess
from datetime import datetime, timedelta

from PIL import Image, ImageDraw

ROOT = "/var/lib/motioneye"
CAMERAS = range(1, 5)
COLOURS = {1: (40, 90, 160), 2: (160, 70, 40), 3: (40, 140, 80), 4: (120, 60, 140)}
DAYS = 2
PICTURES_PER_DAY = 3
FPS = 10
MOVIE_SECONDS = 5


def frame(camera_id: int, moment: datetime, x: int) -> Image.Image:
    image = Image.new("RGB", (640, 480), COLOURS[camera_id])
    draw = ImageDraw.Draw(image)
    draw.rectangle((x, 200, x + 40, 240), fill=(240, 240, 240))
    draw.text((20, 20), f"recorded on camera {camera_id}", fill=(255, 255, 255))
    draw.text((20, 40), moment.strftime("%Y-%m-%d %H:%M:%S"), fill=(255, 255, 255))
    return image


def media_path(camera_id: int, moment: datetime, extension: str) -> str:
    path = f"{ROOT}/Camera{camera_id}/{moment:%Y-%m-%d/%H-%M-%S}{extension}"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def stamp(path: str, moment: datetime) -> None:
    seconds = moment.timestamp()
    os.utime(path, (seconds, seconds))


def picture(camera_id: int, moment: datetime) -> None:
    path = media_path(camera_id, moment, ".jpg")
    frame(camera_id, moment, 300).save(path, "JPEG", quality=80)
    stamp(path, moment)


def movie(camera_id: int, moment: datetime) -> None:
    path = media_path(camera_id, moment, ".mp4")
    encoder = subprocess.Popen(
        [
            "ffmpeg",
            "-loglevel",
            "error",
            "-f",
            "image2pipe",
            "-framerate",
            str(FPS),
            "-i",
            "-",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            path,
        ],
        stdin=subprocess.PIPE,
    )
    for n in range(FPS * MOVIE_SECONDS):
        at = moment + timedelta(seconds=n / FPS)
        frame(camera_id, at, n * 12 % 600).save(encoder.stdin, "JPEG", quality=85)
    encoder.stdin.close()
    if encoder.wait():
        raise SystemExit(f"ffmpeg failed on {path}")
    stamp(path, moment + timedelta(seconds=MOVIE_SECONDS))


today = datetime.now().replace(hour=9, minute=0, second=0, microsecond=0)
for camera_id in CAMERAS:
    for day in range(1, DAYS + 1):
        start = today - timedelta(days=day)
        for n in range(PICTURES_PER_DAY):
            picture(camera_id, start + timedelta(hours=3 * n))
        movie(camera_id, start + timedelta(hours=1, minutes=30))
