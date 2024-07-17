import http.server
from socketserver import ThreadingMixIn

PORT = 8000

class ThreadingHTTPServer(ThreadingMixIn, http.server.HTTPServer):
    pass

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        if self.path.endswith(".js") or self.path.endswith(".css") or self.path.endswith(".html"):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

if __name__ == "__main__":
    server_address = ('', PORT)
    httpd = ThreadingHTTPServer(server_address, CustomHTTPRequestHandler)
    print(f"Serving on port {PORT}")
    httpd.serve_forever()
