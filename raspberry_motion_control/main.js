#!/home/pi/.nvm/versions/node/v14.15.4/bin/node

const mqtt = require("mqtt");
const raspi = require("raspi");
const Serial = require("raspi-serial").Serial;
const temp = require("pi-temperature");
const childProcess = require("child_process");
const checkInternetConnected = require("check-internet-connected");

// const host = "illantalex-Inspiron-3576.local";
const host = "broker.hivemq.com";
const videoHost = "illantalex-Inspiron-3576.local";
const port = 1883;
const myName = "illantal";
const serialPort = "/dev/serial0";

const serial = new Serial({ portId: serialPort, baudRate: 9600 });
const MqttClient = mqtt.connect(`mqtt://${host}:${port}`, { keepalive: 5, username: "illantal", password: "" });
// const MqttClient = mqtt.connect('mqtt://test.mosquitto.org')
let buffer = "";
const dataToSend = {};

const AI = true;
var front, back;
let is3GConnected = false;
let brokenConnection = false;

const config = {
    timeout: 5000, //timeout connecting to each server, each try
    retries: 2, //number of retries to do before failing
    domain: 'https://google.com', //the domain to check DNS record of
}

function video_send() {
    if (AI) {
        front = childProcess.exec(`python3 /home/pi/projects/cv_detect/detect_tflite.py -H ${videoHost}`);
        back = childProcess.exec(`python3 /home/pi/projects/cv_detect/detect_tflite_back.py -H ${videoHost}`);
    } else {
        front = childProcess.exec(`ffmpeg -f video4linux2 -input_format h264 -video_size 640x480 -framerate 10 -i /dev/video0 -c:v h264_omx -r 10 -vf "transpose=2,transpose=2" -tune zerolatency -f rtp rtp://${videoHost}:6504`);
        back = childProcess.exec(`ffmpeg -f video4linux2 -input_format yuyv422 -video_size 640x480 -framerate 10 -i /dev/video1 -c:v h264_omx -r 10 -tune zerolatency -f rtp rtp://${videoHost}:6514`);
    }
}

raspi.init(() => {
    serial.open(() => {
        // serial.write('7');
    });
});

serial.on('data', (data) => {
    // process.stdin.write(data);

    // if (data == "\r") {
    //     return;
    // } else
    buffer += `${data}`;
    if (data == "\n") {
        serial.emit("end");
        return;
    }
    // dataToSend.distance = data;
});

serial.on("end", async () => {
    temp.measure(function (err, temperature) {
        if (err) console.log(err);
        else dataToSend.temp = temperature;
    });
    [buffer, ...rest] = buffer.split("\r");
    [dataToSend.distance, dataToSend.gps, dataToSend.accelerometer, dataToSend.compass] = buffer.split(" ");
    dataToSend.time = new Date().toLocaleString();
    dataToSend.time_unix = (new Date()).getTime();
    // console.log(dataToSend);
    buffer = "";
    if (MqttClient.connected) { MqttClient.publish(`${myName}/telemetery`, JSON.stringify(dataToSend), { qos: 2, retain: false }); }
});


MqttClient.on('connect', function () {
    console.log("connected");
    MqttClient.subscribe(`${myName}/commands`, function (err) {
        if (!err) {
            // MqttClient.publish(`${myName}/telemetery`, 'Hello mqtt');
            video_send();
        } else {
            console.log(err);
        }
    })
})

MqttClient.on('message', function (topic, message) {
    // message is Buffer
    console.log(message.toString());
    serial.write(message.toString());
    // MqttClient.end();
});

MqttClient.on("error", (error) => {
    //childProcess.exec("sudo ifup wwan0");
    //MqttClient.reconnect();
    console.log(error);
    // console.log("connection closed");
    // MqttClient.reconnect();
})
MqttClient.on("close", function () {
    console.log("connection closed");
    //checkInternetConnected(config)
    //    .then((result) => {
    //        console.log(result);//successfully connected to a server
    //        MqttClient.reconnect();
    //    })
    //    .catch((ex) => {
    //        console.log(ex); // cannot connect to a server or error occurred.
    //        if (!is3GConnected) {
    //            childProcess.exec("sudo ifup wwan0");
    //            is3GConnected = true;
    //       }
    //    });
});

// MqttClient.on("offline", function () {
//     try {
//         // front.kill();
//         // back.kill();
//         childProcess.exec("sudo ifup wwan0");
//         MqttClient.reconnect();
//     } catch (error) {
//         console.log(error);
//     }
// });

// const getFromSerial = async (command) => {
//     buffer = "";
//     serial.write(command);
//     // await setTimeout(() => {
//     //     console.log(buffer);
//     //     return buffer;
//     // }, 100);
//     await waitFor('end', serial);
//     return buffer;
// }

// setInterval(async () => {
//     // dataToSend = {};
//     temp.measure(function (err, temperature) {
//         if (err) console.log(err);
//         else dataToSend.temp = temperature;
//     });
//     dataToSend.distance = await parseInt(await getFromSerial("7"));
//     dataToSend.gps = await getFromSerial("8");
//     dataToSend.accelerometer = await getFromSerial("9");
//     dataToSend.compass = await getFromSerial("a");
//     dataToSend.time = new Date().toLocaleString();
//     dataToSend.time_unix = (new Date()).getTime();
//     // console.log(dataToSend);

//     MqttClient.publish(`${myName}/telemetery`, JSON.stringify(dataToSend), { qos: 2, retain: false });
// }, 1000);
setInterval(() => {
    checkInternetConnected(config)
        .then((result) => {
            console.log(result);//successfully connected to a server
            if (brokenConnection) {
                MqttClient.reconnect();
                brokenConnection = false;
            }
        })
        .catch((ex) => {
            console.log(ex); // cannot connect to a server or error occurred.
            if (!is3GConnected) {
                childProcess.exec("sudo ifup wwan0");
                is3GConnected = true;
            }
            MqttClient.end(true);
            brokenConnection = true;
            // MqttClient.disconnect();
            // MqttClient.reconnect();
        });
    // MqttClient.end(true);
    // MqttClient.reconnect();
}, 5000)
