var mqtt;
var reconnectTimeout = 2000;
// var host = "illantalex-Inspiron-3576.local";
// var port = 9001;
var host = "broker.hivemq.com";
var port = 8000;
var timeLastPress = 0;

document.addEventListener("keydown", (event) => {
    if (new Date().getTime() - timeLastPress >= 100) {
        timeLastPress = new Date().getTime();
        switch (event.key) {
            case "w":
                send("1");
                break;
            case "s":
                send("2");
                break;
            case "q":
                send("3");
                break;
            case "e":
                send("4");
                break;
            case "a":
                send("5");
                break;
            case "d":
                send("6");
                break;
            default:
                break;
        }
    }
})

// var client;
function makeid(length) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

var connectOptions = {
    timeout: 30,
    reconnect: true,
    cleanSession: false,
    mqttVersion: 4,
    keepAliveInterval: 10,
    onSuccess: onConnect,
    onFailure: onFailure,
    userName: null,
};

var client = new Paho.Client(
    host,
    port,
    "/mqtt",
    makeid(16)
);


function connect() {
    try {
        connectOptions.userName = document.forms.sender.user.value;
        client.connect(connectOptions);
    } catch (ex) {
        console.log(ex);
    }

}


function onConnect() {
    console.log("on connect");
    client.subscribe(`${connectOptions.userName}/telemetery`, { qos: 2 });
}

client.onMessageArrived = function (message) {
    console.log("onMessageArrived: " + message.payloadString);
    // var pTelemetery = document.createElement("p");
    var data = JSON.parse(message.payloadString);
    data.ping = (new Date()).getTime() - data.time_unix;
    // data.time = new Date().setMilliseconds(data.time);
    var pTelemetery = document.getElementById("telemetery");
    // document.body.insertBefore(pTelemetery, divTelemetery);
    pTelemetery.innerHTML = JSON.stringify(data);

}

function onFailure(err) {
    console.log("on failure", JSON.stringify(err));
}

function send(value) {
    var message = new Paho.Message(value);
    message.destinationName = `${connectOptions.userName}/commands`;
    message.qos = 2;
    // console.log(message.destinationName, message);
    console.log(message.payloadString);
    client.send(message);
}
