var irc = require('irc')
var Hipchatter = require('hipchatter')
var assign = require('object-assign')
var _ = require('lodash')
var md = require('markdown-it')({
  linkify: true,
  breaks: true
})

var HIPCHAT_TOKEN = process.env.HIPCHAT_TOKEN
var pmUsers = process.env.PM_USERS || ''
var users = process.env.USERS_MAPPINGS || ''
var syncUser = process.env.SYNC_USER || 'ircbot:hipchat-bot'
var postfix = process.env.USER_POSTFIX || '-hipchat'

var ircServer = 'irc.freenode.net'
var ircOptions = {
  autoConnect: false,
  debug: true
}
var clients = {}
var ircRooms
var syncBot

users = users.split(',').reduce(function (prev, user) {
  user = parseUser(user)
  prev[user.mention_name] = user
  return prev
}, {})

syncUser = parseUser(syncUser)
pmUsers = pmUsers.split(',')

Hipchatter.prototype.get_participants = function (room, callback) {
  this.request('get', 'room/' + room + '/participant', function (err, results) {
    if (err) callback(err)
    else callback(err, results.items)
  })
}

var hipchatter = new Hipchatter(HIPCHAT_TOKEN)

getIrcRooms(function (err, rooms) {
  if (err) return onErr(err)
  ircRooms = rooms
  Object.keys(ircRooms).forEach(function (channel) {
    hipchatter.get_participants(ircRooms[channel], function (err, participants) {
      if (err) return onErr(err)
      participants.forEach(function (participant) {
        joinChannel(participant.mention_name, channel)
      })
    })

    if (!syncBot) {
      syncBot = createClient(syncUser, function (err, client) {
        if (err) console.error(err)
        client.join(channel)
      })
      syncBot.addListener('message', function (from, to, text, message) {
        if (to.slice(0, 1) !== '#' || !ircRooms[to]) return
        if (message.user === '~nodebot') return
        hipchatter.notify(ircRooms[to], {
          message: md.render('**' + from + ':** ' + text),
          notify: false
        }, onErr)
      })
    } else {
      syncBot.join(channel)
      syncBot.once('registered', function () {
        syncBot.join(channel)
      })
    }
  })
})

function onErr (err) {
  if (err) console.error(err)
}

function parseUser (userEnvVar) {
  var user = userEnvVar.split(':')
  return {
    mention_name: user[0],
    nickname: user[1],
    password: user.slice(2, user.length).join(':')
  }
}

function getIrcRooms (cb) {
  if (ircRooms) return cb(ircRooms)
  hipchatter.rooms(function (err, rooms) {
    if (err) return cb(err)
    var ircRooms = rooms.filter(function (room) {
      return room.name.slice(0, 1) === '#'
    }).reduce(function (prev, room) {
      prev[room.name] = room.id
      return prev
    }, {})
    cb(null, ircRooms)
  })
}

function createClient (user, cb) {
  var nickname = user.nickname || user.mention_name + postfix
  if (clients[user.mention_name]) return cb(null, clients[user.mention_name])
  var options = assign({}, ircOptions, {
    sasl: user.username && user.password,
    password: user.password
  })
  var client = new irc.Client(ircServer, nickname, options)
  if (user.mention_name && pmUsers.indexOf(user.mention_name) > -1) {
    client.addListener('message', function (from, to, text) {
      if (to !== nickname) return
      hipchatter.send_private_message('@' + user.mention_name, {
        message: md.render('**' + from + ':** ' + text),
        notify: true,
        message_format: 'html'
      }, onErr)
    })
  }
  client.addListener('error', onErr)
  clients[user.mention_name || Date.now()] = client
  client.connect(function (reply) {
    if (cb) cb(null, client)
  })
  return client
}

function joinChannel (username, channel) {
  var user = users[username] || parseUser(username)
  if (user) {
    createClient(user, function (err, client) {
      client.join(channel)
    })
  }
}

function partChannel (username, channel) {
  if (!clients[username]) return
  clients[username].part(channel)
}

function say (username, channel, message) {
  var user = users[username] || parseUser(username)
  if (user) {
    createClient(user, function (err, client) {
      client.say(channel, message)
    })
  }
}

function destroyClient (username) {
  var client = clients[username]
  if (!client) return
  client.removeAllListeners()
  client.disconnect()
  delete clients[username]
}

module.exports = {
  joinChannel: joinChannel,
  partChannel: partChannel,
  destroyClient: destroyClient,
  getIrcRooms: getIrcRooms,
  say: say
}
