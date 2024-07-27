from http.server import SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
import http.server

class ThreadingHTTPServer(ThreadingMixIn, http.server.HTTPServer):
    pass

class CustomHTTPRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        if self.path.endswith(".js") or self.path.endswith(".css") or self.path.endswith(".html"):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

if __name__ == "__main__":
    PORT = 8000  # You can replace this with your desired port
    server_address = ('', PORT)
    httpd = ThreadingHTTPServer(server_address, CustomHTTPRequestHandler)
    print(f"Serving on port {PORT}")
    httpd.serve_forever()
