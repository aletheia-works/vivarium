import subprocess
import time

import boto3

ENDPOINT = "https://127.0.0.1:9100"
BUCKET = "motioneye"

server = subprocess.Popen(["sh", "/usr/local/lib/preview/rustfs.sh"])
s3 = boto3.client(
    "s3",
    endpoint_url=ENDPOINT,
    aws_access_key_id="preview",
    aws_secret_access_key="password",
    region_name="us-east-1",
    verify=False,
)
try:
    for _ in range(120):
        try:
            s3.list_buckets()
            break
        except Exception:
            time.sleep(1)
    s3.create_bucket(Bucket=BUCKET)
finally:
    server.terminate()
    server.wait()
