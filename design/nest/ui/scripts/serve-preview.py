#!/usr/bin/env python3
"""Serve the design UI and relay only the local assistant API; no credentials are read here."""
import argparse
import http.client
import json
import re
import socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
UUID = r'[0-9a-fA-F-]{36}'
CHAT_PATH = re.compile(rf'/api/agent/conversations(?:/{UUID}(?:/messages|/runs/{UUID}/(?:events|abort))?)?')


class PreviewHandler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        origin = self.headers.get('Origin')
        if origin in self.server.allowed_origins:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def valid_request(self):
        host = self.headers.get('Host', '')
        origin = self.headers.get('Origin')
        return host in self.server.allowed_hosts and (not origin or origin in self.server.allowed_origins)

    def error_json(self, status, message):
        body = json.dumps({'error': {'message': message}}).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        if not self.valid_request():
            return self.error_json(403, 'This request is not allowed.')
        self.send_response(204)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Last-Event-ID')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        if not self.valid_request():
            return self.error_json(403, 'This request is not allowed.')
        if self.path.startswith('/api/'):
            return self.proxy()
        return super().do_GET()

    def do_POST(self):
        if not self.valid_request():
            return self.error_json(403, 'This request is not allowed.')
        return self.proxy()

    def proxy(self):
        path = urlsplit(self.path).path
        if path != '/api/health' and not CHAT_PATH.fullmatch(path):
            return self.error_json(404, 'This service only provides chat.')
        stream = path.endswith('/events')
        allowed_method = 'GET' if path == '/api/health' or stream or re.fullmatch(rf'/api/agent/conversations/{UUID}', path) else 'POST'
        if self.command != allowed_method:
            return self.error_json(405, 'This method is not allowed.')
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            return self.error_json(400, 'Invalid request size.')
        if length < 0 or length > 256_000:
            return self.error_json(413, 'This message is too large.')
        body = self.rfile.read(length) if length else None
        if self.command == 'POST' and path.endswith('/messages'):
            try:
                message = json.loads(body or b'{}')
            except (ValueError, UnicodeDecodeError):
                return self.error_json(400, 'Invalid chat message.')
            if not isinstance(message, dict):
                return self.error_json(400, 'Invalid chat message.')
            body = json.dumps({**message, 'researchOnly': True}, ensure_ascii=False).encode()
        connection = http.client.HTTPConnection(self.server.upstream_host, self.server.upstream_port, timeout=110)
        headers = {'Content-Type': 'application/json'}
        if self.headers.get('Last-Event-ID'):
            headers['Last-Event-ID'] = self.headers['Last-Event-ID']
        started = False
        try:
            connection.request(self.command, self.path, body=body, headers=headers)
            response = connection.getresponse()
            if stream and response.status == 200:
                self.send_response(response.status)
                self.send_header('Content-Type', response.getheader('Content-Type', 'application/json'))
                self.send_header('Connection', 'close')
                self.end_headers()
                started = True
                self.close_connection = True
                while chunk := response.readline():
                    self.wfile.write(chunk)
                    self.wfile.flush()
            else:
                result = response.read(1_000_001)
                if len(result) > 1_000_000:
                    return self.error_json(502, 'The chat response was too large. Please try again.')
                self.send_response(response.status)
                self.send_header('Content-Type', response.getheader('Content-Type', 'application/json'))
                self.send_header('Content-Length', str(len(result)))
                self.end_headers()
                started = True
                self.wfile.write(result)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except (OSError, socket.timeout, http.client.HTTPException):
            if not started:
                self.error_json(502, 'Live chat is unavailable. Please try again.')
        finally:
            connection.close()


def make_server(port, upstream):
    parsed = urlsplit(upstream)
    if parsed.scheme != 'http' or parsed.hostname not in {'127.0.0.1', 'localhost'} or parsed.path not in {'', '/'}:
        raise ValueError('The chat backend must be a loopback HTTP server.')
    server = ThreadingHTTPServer(('127.0.0.1', port), PreviewHandler)
    server.upstream_host, server.upstream_port = parsed.hostname, parsed.port or 80
    server.allowed_hosts = {f'127.0.0.1:{server.server_port}', f'localhost:{server.server_port}'}
    server.allowed_origins = {f'http://{host}' for host in server.allowed_hosts} | {
        'http://127.0.0.1:8765', 'http://localhost:8765',
    }
    return server


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8878)
    parser.add_argument('--upstream', default='http://127.0.0.1:5173')
    args = parser.parse_args()
    with make_server(args.port, args.upstream) as server:
        print(f'Nest preview: http://127.0.0.1:{args.port}/ui/index.html#chat', flush=True)
        server.serve_forever()
