"""Serve the diagram gallery and seekable reference media on loopback."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
import os
import re
import sys


class LessonHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_head(self):
        self.byte_range = None
        route = urlparse(self.path).path
        if route.startswith('/chapters/') and '.' not in route:
            self.path = '/index.html'
        file_path = Path(self.translate_path(self.path))
        if file_path.suffix not in {'.webm', '.mp4', '.wav', '.m4a'} or not file_path.is_file():
            return super().send_head()

        size = file_path.stat().st_size
        start, end = 0, size - 1
        requested = self.headers.get('Range')
        if requested:
            match = re.fullmatch(r'bytes=(\d*)-(\d*)', requested.strip())
            valid = bool(match and (match[1] or match[2]))
            if valid:
                if match[1]:
                    start = int(match[1])
                    end = min(int(match[2]), size - 1) if match[2] else size - 1
                else:
                    count = int(match[2])
                    start = max(0, size - count)
                    valid = count > 0
                valid = valid and 0 <= start <= end < size
            if not valid:
                self.send_response(416)
                self.send_header('Content-Range', f'bytes */{size}')
                self.send_header('Content-Length', '0')
                self.end_headers()
                return None
            self.byte_range = (start, end)

        source = file_path.open('rb')
        source.seek(start)
        self.send_response(206 if requested else 200)
        self.send_header('Content-Type', {'.mp4': 'video/mp4', '.m4a': 'audio/mp4', '.wav': 'audio/wav'}.get(file_path.suffix, 'audio/webm'))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(end - start + 1))
        if requested:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.end_headers()
        return source

    def copyfile(self, source, outputfile):
        try:
            if self.byte_range is None:
                return super().copyfile(source, outputfile)
            remaining = self.byte_range[1] - self.byte_range[0] + 1
            while remaining:
                block = source.read(min(65536, remaining))
                if not block:
                    break
                outputfile.write(block)
                remaining -= len(block)
        except (BrokenPipeError, ConnectionResetError):
            # Switching sections cancels the previous audio download.
            pass


if __name__ == '__main__':
    os.chdir(Path(__file__).resolve().parent)
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8130
    server = ThreadingHTTPServer(('127.0.0.1', port), LessonHandler)
    print(f'Diagram gallery: http://localhost:{port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
