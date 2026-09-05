#!/usr/bin/env python3
"""Static file server for local development.

The same as `python3 -m http.server`, except it tells the browser not to
cache anything. Without that, an edited .js file keeps being served out of
the browser cache and you end up debugging code that is no longer running.
"""

import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    print(f'typewriter: http://localhost:{port}/')
    ThreadingHTTPServer(('127.0.0.1', port), NoCacheHandler).serve_forever()
