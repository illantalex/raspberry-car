#!/home/pi/.nvm/versions/node/v14.15.4/bin/node

var mqtt = require('mqtt')
var client = mqtt.connect('mqtt://test.mosquitto.org')
var childProcess = require("child_process");

client.on('connect', function () {
    client.subscribe('presence', function (err) {
        if (!err) {
            client.publish('presence', 'Hello mqtt')
        }
    })
})

client.on('message', function (topic, message) {
    // message is Buffer
    console.log(message.toString())
    client.end()
})

childProcess.exec("sudo ifup wwan0");
