# weboverlay

Layered Hybrid Web Server: Local, Remote, and Transform

[![Node.js CI](https://github.com/kawanet/weboverlay/workflows/Node.js%20CI/badge.svg?branch=master)](https://github.com/kawanet/weboverlay/actions/)
[![npm version](https://badge.fury.io/js/weboverlay.svg)](https://www.npmjs.com/package/weboverlay)

## SYNOPSIS

```sh
# install
npm install -g weboverlay

# overlay multiple local document root paths
weboverlay ../repo1/htdocs ../repo2/htdocs ../repo3/htdocs

# overlay local files and upstream remote origin server contents with cache

# rewrite remote content with sed-style transform
weboverlay 's#/example.com/#/127.0.0.1:3000/#g' https://example.com --cache=cached --log=dev --json

# replace product names on a corporate website 
weboverlay "s/MacBook/Surface/g" https://www.apple.com --cache=cached --port=3000

# open browser
open http://127.0.0.1:3000/
```

## CLI

```sh
weboverlay [s/regexp/replacement/g] [@type=function] [htdocs...] [https://hostname] [--options...]
```

- `s/regexp/replacement/g` - sed-style transform applied for every text contents.
- `@text/html=s=>s.toLowerCase()` - custom transform function for given content type.
- `/path/to/not/found=404` - path to force 404 Not Found.
- `htdocs` - path to local document root directory.
- `https://upstream.host` - URL to remote upstream server: `http://` or `https://`
- `--basic=user:password` - Basic authentication
- `--cache=cached` - path to directory to cache remote content (default: disabled)
- `--compress=br` - force compression with Brotli (default: auto)
- `--compress=identity` - no compression
- `--config=weboverlay.yml` - load configuration from YAML file.
- `--json` - prettify JSON (default: disabled)
- `--log=tiny` - morgan access log format: `combined`, `dev`, etc. (default: `tiny`)
- `--logfile=weboverlay.log` - path to log file
- `--port=3000` - port number to listen. (default: `3000`)

## YAML

```yaml
layers:
    - s/regexp/replacement/g
    - @text/html=s=>s.toLowerCase()
    - /path/to/not/found=404
    - htdocs
    - https://upstream.host
basic:
    - user:password
cache: cached
json: true
log: tiny
logfile: weboverlay.log
port: 3000
```

## API

See TypeScript declaration
[weboverlay.d.ts](https://github.com/kawanet/weboverlay/blob/master/types/weboverlay.d.ts)
for more detail.

## SEE ALSO

- https://github.com/kawanet/express-compress
- https://github.com/kawanet/express-intercept
- https://github.com/kawanet/express-sed
- https://github.com/kawanet/express-tee
- https://github.com/kawanet/express-upstream
- https://github.com/kawanet/weboverlay

## LICENSE

The MIT License (MIT)

Copyright (c) 2020 Yusuke Kawasaki

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
