import asyncio
import ssl
import sys

LISTEN = ("127.0.0.1", 1465)
MAILPIT = ("127.0.0.1", 1025)
CERT = "/etc/mailpit/cert.pem"
KEY = "/etc/mailpit/key.pem"


async def pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        while data := await reader.read(65536):
            writer.write(data)
            await writer.drain()
    finally:
        writer.close()


async def handle(client_reader: asyncio.StreamReader, client_writer: asyncio.StreamWriter) -> None:
    try:
        reader, writer = await asyncio.open_connection(*MAILPIT)
    except OSError:
        client_writer.close()
        return
    results = await asyncio.gather(
        pipe(client_reader, writer), pipe(reader, client_writer), return_exceptions=True
    )
    for result in results:
        if isinstance(result, Exception):
            print(f"smtps: {result!r}", file=sys.stderr, flush=True)


async def main() -> None:
    context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    context.load_cert_chain(CERT, KEY)
    server = await asyncio.start_server(handle, *LISTEN, ssl=context)
    async with server:
        await server.serve_forever()


asyncio.run(main())
