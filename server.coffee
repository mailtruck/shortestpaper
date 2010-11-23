require('joose')
require('joosex-namespace-depended')
require('hash')
queryString = require('querystring')
http = require('http')
sys = require('sys')
httpProxy = require('./node-http-proxy')
jsdom = require('jsdom')
express = require('express')
redis = require('redis').createClient()
request = require('request')
jquery = 'https://ajax.googleapis.com/ajax/libs/jquery/1.4.2/jquery.min.js'
instapaper = 'www.instapaper.com'

process = () ->
  redis.lpop 'download', (error, reply) ->
    if reply?
      redis.llen 'download', (e, r) ->
        sys.puts("#{r} URLs left")
      url = reply.toString()
      key = Hash.sha1(url)[0..9]
      redis.get key, (error, reply) ->
        unless reply?
          sys.puts("Analyzing #{url}")
          request { uri: url }, (error, resp, body) ->
            setTimeout(process, 10000)
            unless error?
              jsdom.jQueryify jsdom.jsdom(body).createWindow(), jquery, (w, $) ->
                if w.document.outerHTML.match(/Exceeded rate limit/)
                  # Try again
                  sys.puts("Retrying #{url}")
                  redis.rpush 'download', url
                else
                  # Count the number of words in the `#story` element.
                  count = 0
                  words = $('#story').text().split(/\s+/)
                  for word in words
                    # Only include words > 2 characters
                    count += 1 if word.length > 2
                  redis.set key, count, (e, r) ->
                    sys.puts("Counted and stored #{url}")
        else
          setTimeout(process, 1000)
    else
      setTimeout(process, 1000)

process()

httpProxy.createServer((req, res, proxy) ->
  # Have to clear this so we don't get gzip crap
  # TODO: Make it work with gzip
  req.headers['accept-encoding'] = ''
  buffer = ''
  proxy.proxyRequest(80, instapaper, /text\/html/, ((chunk) ->
    buffer += chunk
  ), (() ->
    jsdom.jQueryify jsdom.jsdom(buffer).createWindow(), jquery, (w, $) ->
      document = w.document

      script = document.createElement('script')
      script.src = jquery
      script.type = 'text/javascript'
      document.body.appendChild(script)

      script = document.createElement('script')
      # script.src = "http://#{req.headers.host.replace(/8080/, '8081')}/sorting.js"
      script.src = '/sorting.js'
      script.type = 'text/javascript'
      document.body.appendChild(script)

      $('#bookmark_list > .tableViewCell').each (i, e) ->
        url = "http://#{instapaper}#{$('.textButton', e).attr('href')}"
        key = Hash.sha1(url)[0..9]
        $(e).attr('key', key)
        sys.puts("Found URL #{url}")
        redis.get key, (error, reply) ->
          unless reply?
            sys.puts("Queueing #{url} for download")
            redis.rpush 'download', url
      res.end(w.document.outerHTML.replace(/&amp;/g, '&'))
  ))
).listen(8080)

app = express.createServer()
app.use(express.staticProvider(__dirname + '/public'))

app.get '/counts.json', (req, res) ->
  res.writeHead(200, {
    'Content-Type': 'text/javascript; charset=utf-8'
  })
  query = queryString.parse(req.url.split('?')[1])
  params = query.keys.split(',')
  params.push (error, reply) ->
    h = {}
    counts = reply.toString('utf8').split(',')
    for i in [0..counts.length]
      h[params[i]] = parseInt(counts[i])
    res.end("#{query.callback}(#{JSON.stringify(h)});");
  redis.mget.apply redis, params

app.listen(8081)