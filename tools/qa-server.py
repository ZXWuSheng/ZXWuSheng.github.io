"""Local-only fault/slow-response smoke-test server; no production dependency."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit
from urllib.parse import unquote
import argparse
import time

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=8001)
parser.add_argument('--mode', choices=['slow', 'missing-images', 'no-js'], default='slow')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(root), **kw)
    def do_GET(self):
        path = urlsplit(self.path).path
        if args.mode == 'missing-images' and path.endswith('.html'):
            file = root / unquote(path.lstrip('/'))
            if file.is_file() and file.resolve().is_relative_to(root.resolve()):
                body = file.read_bytes().replace(b'https://mc-heads.net/avatar/', b'/missing-avatar/')
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
        if args.mode == 'missing-images' and path.endswith(('.png', '.webp')):
            self.send_error(404, 'Intentional QA image failure')
            return
        if args.mode == 'no-js' and path.endswith('.js'):
            self.send_error(404, 'Intentional QA script failure')
            return
        if args.mode == 'slow':
            time.sleep(0.7)
        super().do_GET()

print(f'QA mode={args.mode} port={args.port}', flush=True)
ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
