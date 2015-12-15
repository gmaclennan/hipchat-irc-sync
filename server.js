var express = require('express')
var bodyParser = require('body-parser')
var morgan = require('morgan')
var Hipchatter = require('hipchatter')
var url = require('url')
var _ = require('lodash')
var herokuSelfPing = require('heroku-self-ping')

var irc = require('./irc')
var app = express()

var HIPCHAT_TOKEN = process.env.HIPCHAT_TOKEN
var HOSTNAME = process.env.HOSTNAME

var hipchatter = new Hipchatter(HIPCHAT_TOKEN)

herokuSelfPing('https://' + HOSTNAME + '/')

irc.getIrcRooms(function (err, rooms) {
  if (err) return console.error(err)
  for (var channel in rooms) {
    createWebhooks(rooms[channel])
  }
})

function createWebhooks (roomId) {
  hipchatter.webhooks(roomId, function (err, hooks) {
    if (err) return console.error(err)
    var events = ['room_message', 'room_enter', 'room_exit']
    events.forEach(function (event) {
      if (_.find(hooks.items, 'url', 'https://' + HOSTNAME + '/' + event)) return
      hipchatter.create_webhook(roomId, {
        url: 'https://' + HOSTNAME + '/' + event,
        event: event,
        authentication: 'jwt'
      }, function (err, hook) {
        if (err) return console.error(err)
        console.log('created webhook for %s:%s', roomId, event)
      })
    })
  })
}

function deleteWebhooks (roomId) {
  hipchatter.webhooks(roomId, function (err, hooks) {
    if (err) return console.error(err)
    hooks.items.filter(function (webhook) {
      var hostname = url.parse(webhook.url).host
      return (hostname === HOSTNAME)
    }).forEach(function (webhook) {
      hipchatter.delete_webhook(roomId, webhook.id, function (err) {
        if (err) return console.error(err)
        console.log('deleted webhook for %s:%s', roomId, webhook.url)
      })
    })
  })
}

app.use(morgan('dev'))

// parse application/json
app.use(bodyParser.json())

// app.use(jwt({secret: HIPCHAT_TOKEN}))

app.use(function (req, res, next) {
  switch (req.body.event) {
    case 'room_enter':
    case 'room_exit':
      req.username = req.body.item.sender.mention_name
      break
    case 'room_message':
      req.username = req.body.item.message.from.mention_name
      break
  }
  next()
})

app.use(function (req, res, next) {
  switch (req.body.event) {
    case 'room_enter':
    case 'room_exit':
    case 'room_message':
      req.channel = req.body.item.room.name
      if (req.channel.slice(0, 1) !== '#') {
        return res.status(200).end()
      }
      break
  }
  next()
})

app.get('/', function (req, res) {
  res.send('hipchat irc sync').end()
})

app.post('/room_enter', function (req, res) {
  irc.joinChannel(req.username, req.channel)
  res.status(200).end()
})

app.post('/room_exit', function (req, res) {
  irc.partChannel(req.username, req.channel)
  res.status(200).end()
})

app.post('/room_message', function (req, res) {
  var message = req.body.item.message.message
  irc.say(req.username, req.channel, message)
  res.status(200).end()
})

app.get('/' + HIPCHAT_TOKEN + '/delete_webhooks', function (req, res) {
  irc.getIrcRooms(function (rooms) {
    for (var channel in rooms) {
      deleteWebhooks(rooms[channel])
    }
  })
  res.status(200).end()
})

// Handle errors
app.use(function (err, req, res, next) {
  console.error(err)
  if (err.name === 'UnauthorizedError') {
    res.status(401).send('invalid token...')
  }
})

// Start server
var port = process.env.PORT || 3000
app.listen(port)
console.log('Listening on port %s', port)
