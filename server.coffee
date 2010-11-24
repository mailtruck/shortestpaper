require('joose')
require('joosex-namespace-depended')
require('hash')
fs = require('fs')
assert = require('assert')
queryString = require('querystring')
http = require('http')
sys = require('sys')
Url = require('url')
httpProxy = require('./node-http-proxy') # https://github.com/nodejitsu/node-http-proxy
jsdom = require('jsdom')
Redis = require('redis') # https://github.com/mranney/node_redis
request = require('request')

jquery = 'https://ajax.googleapis.com/ajax/libs/jquery/1.4.2/jquery.min.js'
sha1 = 'http://crypto-js.googlecode.com/files/2.0.0-crypto-sha1.js'
instapaper = 'www.instapaper.com'
shortestpaperScript = fs.readFileSync('shortestpaper.js', 'utf8')

downloadClient = Redis.createClient()

processDownloads = () ->
  downloadClient.lpop 'download', (error, reply) ->
    if reply?
      downloadClient.llen 'download', (e, r) ->
        sys.puts("#{r} URLs left")
      url = reply.toString()
      key = Hash.sha1(url)[0..9]
      downloadClient.get key, (error, reply) ->
        unless reply?
          sys.puts("Analyzing #{url}")
          uri = "http://#{instapaper}/text?u=#{escape(url)}"
          request { uri: uri }, (error, resp, body) ->
            setTimeout(processDownloads, 5000)
            unless error?
              jsdom.jQueryify jsdom.jsdom(body, jsdom.defaultLevel, { url: uri }).createWindow(), jquery, (w, $) ->
                if w.document.outerHTML.match(/Exceeded rate limit/)
                  # Try again
                  sys.puts("Retrying #{url}")
                  downloadClient.rpush 'download', url
                else
                  # Count the number of words in the `#story` element.
                  count = 0
                  words = $('#story').text().split(/\s+/)
                  for word in words
                    # Only include words > 2 characters
                    count += 1 if word.length > 2
                  downloadClient.set key, count, (e, r) ->
                    sys.puts("Counted and stored #{url}")
        else
          setTimeout(processDownloads, 500)
    else
      setTimeout(processDownloads, 500)

processDownloads()

processorClient = Redis.createClient()
pageProcessor = Redis.createClient()
pageProcessor.on 'message', (channel, message) ->
  message = JSON.parse(message)
  jsdom.jQueryify jsdom.jsdom(message.buffer, jsdom.defaultLevel, { url: message.url }).createWindow(), jquery, (window, $) ->
    document = window.document
    $('#bookmark_list .tableViewCellTitleLink').each (i, e) ->
      url = this.href
      sys.puts(url)
      key = Hash.sha1(url)[0..9]
      sys.puts("Found URL #{url}")
      processorClient.get key, (error, reply) ->
        unless reply?
          sys.puts("Queueing #{url} for download")
          processorClient.rpush 'download', url

pageProcessor.subscribe('processing')

mainClient = Redis.createClient()

httpProxy.createServer((req, res, proxy) ->
  url = Url.parse(req.url)
  switch url.pathname
    when '/counts.json'
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8'
      })
      query = queryString.parse(url.query)
      params = query.keys.split(',')
      params.push (error, reply) ->
        counts = reply.toString('utf8').split(',')
        h = {}
        for i in [0..counts.length]
          h[params[i]] = parseInt(counts[i])
        res.end(JSON.stringify(h))
      mainClient.mget.apply mainClient, params
    when '/shortestpaper.js'
      res.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8'
        'Content-Length': shortestpaperScript.length
      })
      res.end(shortestpaperScript)
    else
      gzip = !!url.pathname.match(/\.(js(on)?|js|jpe?g|png|gif|css)$/)
      req.headers['accept-encoding'] = '' unless gzip
      buffer = ''
      proxy.proxyRequest(80, instapaper, /text\/html/, ((chunk) ->
        chunk = chunk.toString('utf8')
        buffer += chunk
        res.write(chunk.replace(/<\/body>\s*<\/html>/, "<script type='text/javascript' src='#{jquery}'></script>\n<script type='text/javascript' src='/shortestpaper.js'></script>\n</body>\n</html>"))
      ), (() ->
        # gzip should be false
        assert.equal(gzip, false)
        res.end()
        mainClient.publish('processing', JSON.stringify({
          buffer: buffer,
          url: "http://#{instapaper}#{req.url}"
        }))
      ))
).listen(process.ARGV[2] || 8080)