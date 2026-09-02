import http from 'node:http'
import next from 'next'
import httpProxy from 'http-proxy'

const frappeUrl = process.env.FRAPPE_URL || 'https://portal.kababrayhan.com'
const app = next({ dev: process.env.NODE_ENV !== 'production' })
const handle = app.getRequestHandler()
const proxy = httpProxy.createProxyServer({ target: frappeUrl, changeOrigin: true, ws: true })
proxy.on('error', (error, _request, response) => {
  console.error('Frappe proxy error:', error.message)
  if (response && 'writeHead' in response) {
    if (!response.headersSent) response.writeHead(502)
    response.end('Frappe connection failed')
  }
})

function addAuthorization(request: http.IncomingMessage) {
  const key = process.env.FRAPPE_API_KEY
  const secret = process.env.FRAPPE_API_SECRET
  if (key && secret) request.headers.authorization = `token ${key}:${secret}`
  return request
}

function addSocketCredentials(request: http.IncomingMessage) {
  request.headers.origin = frappeUrl
  request.headers.referer = `${frappeUrl}/`
  const sid = request.headers.cookie?.match(/(?:^|;\s*)sid=([^;]+)/)?.[1]
  if (sid) {
    request.headers.cookie = `sid=${sid}`
    delete request.headers.authorization
  } else {
    addAuthorization(request)
  }
  return request
}

app.prepare().then(() => {
  const server = http.createServer((request, response) => {
    if (request.url?.startsWith('/socket.io')) {
      proxy.web(addSocketCredentials(request), response)
      return
    }
    void handle(request, response)
  })
  server.on('upgrade', (request, socket, head) => {
    if (request.url?.startsWith('/socket.io')) proxy.ws(addSocketCredentials(request), socket, head)
  })
  server.listen(Number(process.env.PORT || 3000), () => console.log('Next.js Frappe gateway is ready'))
})