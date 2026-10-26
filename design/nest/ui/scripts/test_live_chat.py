import importlib.util
import json
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

spec = importlib.util.spec_from_file_location('preview', Path(__file__).with_name('serve-preview.py'))
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)
CONVERSATION = '10000000-0000-4000-8000-000000000001'
RUN = '20000000-0000-4000-8000-000000000001'


class Backend(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
        self.server.received.append((self.path, body))
        payload = json.dumps({'conversationId': CONVERSATION}).encode()
        self.send_response(201)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        payload = b'id: 1\ndata: {"type":"text_delta","delta":"A real answer"}\n\nid: 2\ndata: {"type":"settled"}\n\n'
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass


class PreviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.backend = ThreadingHTTPServer(('127.0.0.1', 0), Backend)
        cls.backend.received = []
        cls.server = preview.make_server(0, f'http://127.0.0.1:{cls.backend.server_port}')
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'
        for server in [cls.backend, cls.server]:
            threading.Thread(target=server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        for server in [cls.server, cls.backend]:
            server.shutdown()
            server.server_close()

    def test_preview_origin_can_start_chat_and_receive_stream(self):
        origin = 'http://127.0.0.1:8765'
        request = urllib.request.Request(self.base + '/api/agent/conversations', data=b'{}', headers={'Origin': origin})
        with urllib.request.urlopen(request) as response:
            self.assertEqual(response.status, 201)
            self.assertEqual(response.headers['Access-Control-Allow-Origin'], origin)
            self.assertEqual(json.load(response)['conversationId'], CONVERSATION)
        with urllib.request.urlopen(self.base + f'/api/agent/conversations/{CONVERSATION}/runs/{RUN}/events?after=0') as response:
            self.assertEqual(response.headers['Content-Type'], 'text/event-stream')
            self.assertIn(b'"type":"settled"', response.read())

    def test_execution_and_untrusted_origins_are_not_proxied(self):
        for path, origin, status in [('/api/execution/submit', None, 404), ('/api/agent/conversations', 'https://untrusted.example', 403)]:
            request = urllib.request.Request(self.base + path, data=b'{}', headers={'Origin': origin} if origin else {})
            with self.assertRaises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(request)
            self.assertEqual(caught.exception.code, status)

    def test_preview_cannot_enable_action_preparation(self):
        request = urllib.request.Request(
            self.base + f'/api/agent/conversations/{CONVERSATION}/messages',
            data=json.dumps({'messageId': RUN, 'text': 'Compare', 'researchOnly': False}).encode(),
        )
        with urllib.request.urlopen(request):
            pass
        forwarded = json.loads(self.backend.received[-1][1])
        self.assertTrue(forwarded['researchOnly'])

    def test_offline_backend_returns_a_real_error(self):
        self.server.upstream_port = 1
        try:
            request = urllib.request.Request(self.base + '/api/agent/conversations', data=b'{}')
            with self.assertRaises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(request)
            self.assertEqual(caught.exception.code, 502)
            self.assertIn('Live chat is unavailable', json.load(caught.exception)['error']['message'])
        finally:
            self.server.upstream_port = self.backend.server_port

    def test_upstream_cannot_target_an_external_service(self):
        with self.assertRaises(ValueError):
            preview.make_server(0, 'http://external.example')


if __name__ == '__main__':
    unittest.main()
