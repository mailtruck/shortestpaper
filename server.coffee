require('joose')
require('joosex-namespace-depended')
require('hash')
http = require('http')
sys = require('sys')
proxy = require('./htmlfiltre')
jsdom = require('jsdom')
express = require('express')
redis = require('redis').createClient()
request = require('request')
jquery = 'https://ajax.googleapis.com/ajax/libs/jquery/1.4.2/jquery.min.js'
instapaper = 'www.instapaper.com'

setInterval((() ->
  redis.lpop 'download', (error, reply) ->
    if reply?
      url = reply.toString()
      key = Hash.sha1(url)[0..9]
      request { uri: url }, (error, resp, body) ->
        unless error?
          jsdom.jQueryify jsdom.jsdom(body).createWindow(), jquery, (w, $) ->
            if w.document.outerHTML.match(/Exceeded rate limit/)
              # Try again
              redis.rpush 'download', url
            else
              # Count the number of words in the `#story` element.
              count = 0
              words = $('#story').text().split(/\s+/)
              for word in words
                # Only include words > 2 characters
                count += 1 if word.length > 2
              redis.hmset key, 'size', count, 'url', url
), 10000)

http.createServer((req, res) ->
  proxy.htmlFiltre(req, { foreignHost: instapaper }, ((status, buffer, preq, response, loc) ->
    headers = response.headers
    res.writeHead('200', headers)

    if headers['content-type'].match(/text\/html/)
      jsdom.jQueryify jsdom.jsdom(buffer).createWindow(), jquery, (w, $) ->
        document = w.document
        script = document.createElement('script')
        script.src = jquery
        script.type = 'text/javascript'
        document.body.appendChild(script)

        script = document.createElement('script')
        script.src = "http://#{req.headers.host}:8081/sorting.js"
        script.type = 'text/javascript'
        document.body.appendChild(script)

        $('#bookmark_list > .tableViewCell').each (i, e) ->
          url = "http://#{instapaper}#{$('.textButton', e).attr('href')}"
          key = Hash.sha1(url)[0..9]
          $(e).attr('key', key)
          redis.hget key, 'size', (error, reply) ->
            unless reply?
              redis.rpush 'download', url
        res.end(w.document.outerHTML.replace(/&amp;/g, '&'))
    else
      res.end(buffer)
  ), ((loc) ->
    res.writeHead('302', { location: loc })
    res.end()
  ))
).listen(8080)

app = express.createServer()
app.use(express.staticProvider(__dirname + '/public'))
app.listen(8081)