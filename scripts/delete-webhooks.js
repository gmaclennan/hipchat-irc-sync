#!/usr/bin/env node

var Hipchatter = require('hipchatter')
var url = require('url')

var HIPCHAT_TOKEN = process.env.HIPCHAT_TOKEN
var HOSTNAME = process.env.HOSTNAME

var hipchatter = new Hipchatter(HIPCHAT_TOKEN)

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

hipchatter.rooms(function (err, rooms) {
  if (err) return console.error(err)
  rooms.forEach(function (room) {
    deleteWebhooks(room.id)
  })
})
