# weboverlay

Layered Hybrid Web Server: local files, upstream proxy and content transform

[![Node.js CI](https://github.com/kawanet/weboverlay/workflows/Node.js%20CI/badge.svg?branch=master)](https://github.com/kawanet/weboverlay/actions/)
[![npm version](https://badge.fury.io/js/weboverlay.svg)](https://www.npmjs.com/package/weboverlay)

## SYNOPSIS

```sh
# install
npm install -g weboverlay

# overlay multiple local document root paths
weboverlay ../repo1/htdocs ../repo2/htdocs ../repo3/htdocs

# overlay local files and upstream remote origin server contents with cache
weboverlay htdocs https://example.com --cache

# rewrite remote content with sed-style transform
weboverlay 's#/example.com/#/127.0.0.1:3000/#g' https://example.com --cache=cached --log=dev --json

# replace product names on a corporate website 
weboverlay "s/MacBook/Surface/g" https://www.apple.com --cache=cached --port=3000

# mount git repository
weboverlay ../repo1/.git:htdocs

# mount raw Express middleware
weboverlay "(req, res, next) => res.send('OK\n')"

# open browser
open http://127.0.0.1:3000/
```

## CLI

```sh
weboverlay [s/regexp/replacement/g] [type(function)] [htdocs...] [https://hostname] [--options...]
```

- `s/regexp/replacement/g` - `sed`-style transforms applied for every text contents
- `html(s=>s.toLowerCase())` - custom transform JavaScript function for the content type
- `htdocs` - path to local document root directory
- `^/path/with/regexp\.(html|css|js)$=htdocs` - regexp to match with the path specified
- `/path/to/not/found=404` - path to always respond the status: `404 Not Found`
- `path/to/.git:htdocs` - mount `htdocs` directory from `.git` repository
- `/alias/=local/path` - partial mount alias
- `https://upstream.host` - URL to remote upstream origin server: `http://` or `https://`
- `//virtual.host.name/=htdocs` - name based virtual host for local files
- `//proxy.host.name/=https://upstream.host` - name based virtual host for upstream proxy
- `//transorm.host.name/=s/regexp/replacement/g` - name based virtual host for content transform
- `(req, res, next) => res.send('OK\n')` - raw Express middleware
- `--basic=user:password` - username and password for basic authentication
- `--cache=cached` - path to directory to cache remote content (default: disabled)
- `--compress=br` - force compression with Brotli
- `--compress=identity` - no compression
- `--config=weboverlay.yml` - path to load configuration in YAML
- `--index` - directory listing for local files (default: disabled)
- `--json` - prettify JSON response (default: disabled)
- `--log=dev` - morgan access log format: `combined`, `dev`, etc. (default: `tiny`)
- `--logfile=weboverlay.log` - path to write log (default: STDOUT)
- `--port=3000` - port number to listen (default: `3000`)

## YAML

```yaml
# content source layers: local path, upstream proxy and content transform
layers:
    - s/regexp/replacement/g
    - html(s => s.toLowerCase())
    - htdocs
    - path/to/.git:htdocs
    - ^/path/with/regexp\.(html|css|js)$ = htdocs
    - /path/to/not/found = 404
    - /alias/ = local/path
    - https://upstream.host
    - //virtual.host.name/ = htdocs
    - //proxy.host.name/ = https://upstream.host
    - //transorm.host.name/ = s/regexp/replacement/g
    - (req, res, next) => res.send('OK\n')

# username and password for basic authentication
basic:
    - user:password

# path to directory to cache remote content (default: disabled)
cache: cached

# no compression
compress: identity

# directory listing for local files (default: disabled)
index: true

# prettify JSON response (default: disabled)
json: true

# morgan access log format: `combined`, `dev`, etc. (default: `tiny`)
log: dev

# path to write log (default: STDOUT)
logfile: weboverlay.log

# port number to listen (default: `3000`)
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
- https://github.com/kawanet/serve-static-git
- https://github.com/kawanet/weboverlay

## LICENSE

The MIT License (MIT)

Copyright (c) 2020-2023 Yusuke Kawasaki

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
