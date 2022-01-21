// We make use of this `server` variable to provide the address of the
// REST Janus API. By default, in this example we assume that Janus is
// co-located with the web server hosting the HTML pages but listening
// on a different port (8088, the default for HTTP in Janus), which is
// why we make use of the `window.location.hostname` base address. Since
// Janus can also do HTTPS, and considering we don`t really want to make
// use of HTTP for Janus if your demos are served on HTTPS, we also rely
// on the `window.location.protocol` prefix to build the variable, in
// particular to also change the port used to contact Janus (8088 for
// HTTP and 8089 for HTTPS, if enabled).
// In case you place Janus behind an Apache frontend (as we did on the
// online demos at http://janus.conf.meetecho.com) you can just use a
// relative path for the variable, e.g.:
//
// 		var server = "/janus";
//
// which will take care of this on its own.
//
//
// If you want to use the WebSockets frontend to Janus, instead, you`ll
// have to pass a different kind of address, e.g.:
//
// 		var server = "ws://" + window.location.hostname + ":8188";
//
// Of course this assumes that support for WebSockets has been built in
// when compiling the server. WebSockets support has not been tested
// as much as the REST API, so handle with care!
//
//
// If you have multiple options available, and want to let the library
// autodetect the best way to contact your server (or pool of servers),
// you can also pass an array of servers, e.g., to provide alternative
// means of access (e.g., try WebSockets first and, if that fails, fall
// back to plain HTTP) or just have failover servers:
//
//		var server = [
//			"ws://" + window.location.hostname + ":8188",
//			"/janus"
//		];
//
// This will tell the library to try connecting to each of the servers
// in the presented order. The first working server will be used for
// the whole session.
//
var server = null;
if (window.location.protocol === `http:`)
  server = "http://illantalex-Inspiron-3576.local:8088/janus";
else
  server = "https://illantalex-Inspiron-3576.local:8089/janus";

var janus0 = null;
var janus1 = null;

var streaming = [null, null];
var opaqueId = ["streamingtest-" + Janus.randomString(12), "streamingtest-" + Janus.randomString(12)];

var bitrateTimer = [null, null];
var spinner = [null, null];

var simulcastStarted = [false, false], svcStarted = [false, false];

var selectedStream = [null, null];


$(document).ready(function () {
  // Initialize the library (all console debuggers enabled)
  Janus.init({
    debug: "all", callback: function () {
      // Use a button to start the demo
      $(`#start`).one(`click`, function () {
        $(this).attr(`disabled`, true).unbind(`click`);
        // Make sure the browser supports WebRTC
        if (!Janus.isWebrtcSupported()) {
          bootbox.alert("No WebRTC support... ");
          return;
        }
        // Create session
        janus0 = new Janus(
          {
            server: server,
            success: function () {
              // Attach to Streaming plugin
              janus0.attach(
                {
                  plugin: "janus.plugin.streaming",
                  opaqueId: opaqueId[0],
                  success: function (pluginHandle) {
                    $(`#details`).remove();
                    streaming[0] = pluginHandle;
                    Janus.log("Plugin attached! (" + streaming[0].getPlugin() + ", id=" + streaming[0].getId() + ")");
                    // Setup streaming session
                    $(`#update-streams0`).click(() => updateStreamsList(0));
                    updateStreamsList(0);
                    $(`#start`).removeAttr(`disabled`).html("Stop")
                      .click(function () {
                        $(this).attr(`disabled`, true);
                        clearInterval(bitrateTimer[0]);
                        janus0.destroy();
                        $(`#streamslist0`).attr(`disabled`, true);
                        $(`#watch0`).attr(`disabled`, true).unbind(`click`);
                        $(`#start`).attr(`disabled`, true).html("Bye").unbind(`click`);
                      });
                  },
                  error: function (error) {
                    Janus.error("  -- Error attaching plugin... ", error);
                    bootbox.alert("Error attaching plugin... " + error);
                  },
                  iceState: function (state) {
                    Janus.log("ICE state changed to " + state);
                  },
                  webrtcState: function (on) {
                    Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
                  },
                  onmessage: function (msg, jsep) {
                    Janus.debug(" ::: Got a message :::", msg);
                    var result = msg["result"];
                    if (result) {
                      if (result["status"]) {
                        var status = result["status"];
                        if (status === `starting`)
                          $(`#status0`).removeClass(`hide`).text("Starting, please wait...").show();
                        else if (status === `started`)
                          $(`#status0`).removeClass(`hide`).text("Started").show();
                        else if (status === `stopped`)
                          stopStream(0);
                      } else if (msg["streaming"] === "event") {
                        // Is simulcast in place?
                        var substream = result["substream"];
                        var temporal = result["temporal"];
                        if ((substream !== null && substream !== undefined) || (temporal !== null && temporal !== undefined)) {
                          if (!simulcastStarted[0]) {
                            simulcastStarted[0] = true;
                            addSimulcastButtons(temporal !== null && temporal !== undefined, 0);
                          }
                          // We just received notice that there`s been a switch, update the buttons
                          updateSimulcastButtons(substream, temporal, 0);
                        }
                        // Is VP9/SVC in place?
                        var spatial = result["spatial_layer"];
                        temporal = result["temporal_layer"];
                        if ((spatial !== null && spatial !== undefined) || (temporal !== null && temporal !== undefined)) {
                          if (!svcStarted[0]) {
                            svcStarted[0] = true;
                            addSvcButtons(0);
                          }
                          // We just received notice that there`s been a switch, update the buttons
                          updateSvcButtons(spatial, temporal, 0);
                        }
                      }
                    } else if (msg["error"]) {
                      bootbox.alert(msg["error"]);
                      stopStream(0);
                      return;
                    }
                    if (jsep) {
                      Janus.debug("Handling SDP as well...", jsep);
                      var stereo = (jsep.sdp.indexOf("stereo=1") !== -1);
                      // Offer from the plugin, let`s answer
                      streaming[0].createAnswer(
                        {
                          jsep: jsep,
                          // We want recvonly audio/video and, if negotiated, datachannels
                          media: { audioSend: false, videoSend: false, data: true },
                          customizeSdp: function (jsep) {
                            if (stereo && jsep.sdp.indexOf("stereo=1") == -1) {
                              // Make sure that our offer contains stereo too
                              jsep.sdp = jsep.sdp.replace("useinbandfec=1", "useinbandfec=1;stereo=1");
                            }
                          },
                          success: function (jsep) {
                            Janus.debug("Got SDP!", jsep);
                            var body = { request: "start" };
                            streaming[0].send({ message: body, jsep: jsep });
                            $(`#watch0`).html("Stop").removeAttr(`disabled`).click(() => stopStream(0));
                          },
                          error: function (error) {
                            Janus.error("WebRTC error:", error);
                            bootbox.alert("WebRTC error... " + error.message);
                          }
                        });
                    }
                  },
                  onremotestream: function (stream) {
                    Janus.debug(" ::: Got a remote stream :::", stream);
                    var addButtons = false;
                    if ($(`#remotevideo0`).length === 0) {
                      addButtons = true;
                      $(`#stream0`).append(`<video class="rounded centered hide" id="remotevideo0" width="100%" height="100%" playsinline/>`);
                      $(`#remotevideo0`).get(0).volume = 0;
                      // Show the stream and hide the spinner when we get a playing event
                      $("#remotevideo0").bind("playing", function () {
                        $(`#waitingvideo0`).remove();
                        if (this.videoWidth)
                          $(`#remotevideo0`).removeClass(`hide`).show();
                        if (spinner[0])
                          spinner[0].stop();
                        spinner[0] = null;
                        var videoTracks = stream.getVideoTracks();
                        if (!videoTracks || videoTracks.length === 0)
                          return;
                        var width = this.videoWidth;
                        var height = this.videoHeight;
                        $(`#curres0`).removeClass(`hide`).text(width + `x` + height).show();
                        if (Janus.webRTCAdapter.browserDetails.browser === "firefox") {
                          // Firefox Stable has a bug: width and height are not immediately available after a playing
                          setTimeout(function () {
                            var width = $("#remotevideo0").get(0).videoWidth;
                            var height = $("#remotevideo0").get(0).videoHeight;
                            $(`#curres0`).removeClass(`hide`).text(width + `x` + height).show();
                          }, 2000);
                        }
                      });
                    }
                    Janus.attachMediaStream($(`#remotevideo0`).get(0), stream);
                    $("#remotevideo0").get(0).play();
                    $("#remotevideo0").get(0).volume = 1;
                    var videoTracks = stream.getVideoTracks();
                    if (!videoTracks || videoTracks.length === 0) {
                      // No remote video
                      $(`#remotevideo0`).hide();
                      if ($(`#stream0 .no-video-container`).length === 0) {
                        $(`#stream0`).append(
                          `<div class="no-video-container">` +
                          `<i class="fa fa-video-camera fa-5 no-video-icon"></i>` +
                          `<span class="no-video-text">No remote video available</span>` +
                          `</div>`);
                      }
                    } else {
                      $(`#stream0 .no-video-container`).remove();
                      $(`#remotevideo0`).removeClass(`hide`).show();
                    }
                    if (!addButtons)
                      return;
                    if (videoTracks && videoTracks.length &&
                      (Janus.webRTCAdapter.browserDetails.browser === "chrome" ||
                        Janus.webRTCAdapter.browserDetails.browser === "firefox" ||
                        Janus.webRTCAdapter.browserDetails.browser === "safari")) {
                      $(`#curbitrate0`).removeClass(`hide`).show();
                      bitrateTimer[0] = setInterval(function () {
                        // Display updated bitrate, if supported
                        var bitrate = streaming[0].getBitrate();
                        $(`#curbitrate0`).text(bitrate);
                        // Check if the resolution changed too
                        var width = $("#remotevideo0").get(0).videoWidth;
                        var height = $("#remotevideo0").get(0).videoHeight;
                        if (width > 0 && height > 0)
                          $(`#curres0`).removeClass(`hide`).text(width + `x` + height).show();
                      }, 1000);
                    }
                  },
                  ondataopen: function (data) {
                    Janus.log("The DataChannel is available!");
                    $(`#waitingvideo0`).remove();
                    $(`#stream0`).append(
                      `<input class="form-control" type="text" id="datarecv0" disabled></input>`
                    );
                    if (spinner[0])
                      spinner[0].stop();
                    spinner[0] = null;
                  },
                  ondata: function (data) {
                    Janus.debug("We got data from the DataChannel!", data);
                    $(`#datarecv0`).val(data);
                  },
                  oncleanup: function () {
                    Janus.log(" ::: Got a cleanup notification :::");
                    $(`#waitingvideo0`).remove();
                    $(`#remotevideo0`).remove();
                    $(`#datarecv0`).remove();
                    $(`.no-video-container`).remove();
                    $(`#bitrate0`).attr(`disabled`, true);
                    $(`#bitrateset0`).html(`Bandwidth<span class="caret"></span>`);
                    $(`#curbitrate0`).hide();
                    if (bitrateTimer[0])
                      clearInterval(bitrateTimer[0]);
                    bitrateTimer[0] = null;
                    $(`#curres0`).hide();
                    $(`#simulcast0`).remove();
                    $(`#metadata0`).empty();
                    $(`#info0`).addClass(`hide`).hide();
                    simulcastStarted[0] = false;
                  }
                });
            },
            error: function (error) {
              Janus.error(error);
              bootbox.alert(error, function () {
                window.location.reload();
              });
            },
            destroyed: function () {
              window.location.reload();
            }
          });
        janus1 = new Janus(
          {
            server: server,
            success: function () {
              // Attach to Streaming plugin
              janus1.attach(
                {
                  plugin: "janus.plugin.streaming",
                  opaqueId: opaqueId[1],
                  success: function (pluginHandle) {
                    $(`#details`).remove();
                    streaming[1] = pluginHandle;
                    Janus.log("Plugin attached! (" + streaming[1].getPlugin() + ", id=" + streaming[1].getId() + ")");
                    // Setup streaming session
                    $(`#update-streams1`).click(() => updateStreamsList(1));
                    updateStreamsList(1);
                    $(`#start`).removeAttr(`disabled`).html("Stop")
                      .click(function () {
                        $(this).attr(`disabled`, true);
                        clearInterval(bitrateTimer[1]);
                        janus1.destroy();
                        $(`#streamslist1`).attr(`disabled`, true);
                        $(`#watch1`).attr(`disabled`, true).unbind(`click`);
                        $(`#start`).attr(`disabled`, true).html("Bye").unbind(`click`);
                      });
                  },
                  error: function (error) {
                    Janus.error("  -- Error attaching plugin... ", error);
                    bootbox.alert("Error attaching plugin... " + error);
                  },
                  iceState: function (state) {
                    Janus.log("ICE state changed to " + state);
                  },
                  webrtcState: function (on) {
                    Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
                  },
                  onmessage: function (msg, jsep) {
                    Janus.debug(" ::: Got a message :::", msg);
                    var result = msg["result"];
                    if (result) {
                      if (result["status"]) {
                        var status = result["status"];
                        if (status === `starting`)
                          $(`#status1`).removeClass(`hide`).text("Starting, please wait...").show();
                        else if (status === `started`)
                          $(`#status1`).removeClass(`hide`).text("Started").show();
                        else if (status === `stopped`)
                          stopStream(1);
                      } else if (msg["streaming"] === "event") {
                        // Is simulcast in place?
                        var substream = result["substream"];
                        var temporal = result["temporal"];
                        if ((substream !== null && substream !== undefined) || (temporal !== null && temporal !== undefined)) {
                          if (!simulcastStarted[1]) {
                            simulcastStarted[1] = true;
                            addSimulcastButtons(temporal !== null && temporal !== undefined, 1);
                          }
                          // We just received notice that there`s been a switch, update the buttons
                          updateSimulcastButtons(substream, temporal, 1);
                        }
                        // Is VP9/SVC in place?
                        var spatial = result["spatial_layer"];
                        temporal = result["temporal_layer"];
                        if ((spatial !== null && spatial !== undefined) || (temporal !== null && temporal !== undefined)) {
                          if (!svcStarted[1]) {
                            svcStarted[1] = true;
                            addSvcButtons(1);
                          }
                          // We just received notice that there`s been a switch, update the buttons
                          updateSvcButtons(spatial, temporal, 1);
                        }
                      }
                    } else if (msg["error"]) {
                      bootbox.alert(msg["error"]);
                      stopStream(1);
                      return;
                    }
                    if (jsep) {
                      Janus.debug("Handling SDP as well...", jsep);
                      var stereo = (jsep.sdp.indexOf("stereo=1") !== -1);
                      // Offer from the plugin, let`s answer
                      streaming[1].createAnswer(
                        {
                          jsep: jsep,
                          // We want recvonly audio/video and, if negotiated, datachannels
                          media: { audioSend: false, videoSend: false, data: true },
                          customizeSdp: function (jsep) {
                            if (stereo && jsep.sdp.indexOf("stereo=1") == -1) {
                              // Make sure that our offer contains stereo too
                              jsep.sdp = jsep.sdp.replace("useinbandfec=1", "useinbandfec=1;stereo=1");
                            }
                          },
                          success: function (jsep) {
                            Janus.debug("Got SDP!", jsep);
                            var body = { request: "start" };
                            streaming[1].send({ message: body, jsep: jsep });
                            $(`#watch1`).html("Stop").removeAttr(`disabled`).click(() => stopStream(1));
                          },
                          error: function (error) {
                            Janus.error("WebRTC error:", error);
                            bootbox.alert("WebRTC error... " + error.message);
                          }
                        });
                    }
                  },
                  onremotestream: function (stream) {
                    Janus.debug(" ::: Got a remote stream :::", stream);
                    var addButtons = false;
                    if ($(`#remotevideo1`).length === 0) {
                      addButtons = true;
                      $(`#stream1`).append(`<video class="rounded centered hide" id="remotevideo1" width="100%" height="100%" playsinline/>`);
                      $(`#remotevideo1`).get(0).volume = 0;
                      // Show the stream and hide the spinner when we get a playing event
                      $("#remotevideo1").bind("playing", function () {
                        $(`#waitingvideo1`).remove();
                        if (this.videoWidth)
                          $(`#remotevideo1`).removeClass(`hide`).show();
                        if (spinner[1])
                          spinner[1].stop();
                        spinner[1] = null;
                        var videoTracks = stream.getVideoTracks();
                        if (!videoTracks || videoTracks.length === 0)
                          return;
                        var width = this.videoWidth;
                        var height = this.videoHeight;
                        $(`#curres1`).removeClass(`hide`).text(width + `x` + height).show();
                        if (Janus.webRTCAdapter.browserDetails.browser === "firefox") {
                          // Firefox Stable has a bug: width and height are not immediately available after a playing
                          setTimeout(function () {
                            var width = $("#remotevideo1").get(0).videoWidth;
                            var height = $("#remotevideo1").get(0).videoHeight;
                            $(`#curres1`).removeClass(`hide`).text(width + `x` + height).show();
                          }, 2000);
                        }
                      });
                    }
                    Janus.attachMediaStream($(`#remotevideo1`).get(0), stream);
                    $("#remotevideo1").get(0).play();
                    $("#remotevideo1").get(0).volume = 1;
                    var videoTracks = stream.getVideoTracks();
                    if (!videoTracks || videoTracks.length === 0) {
                      // No remote video
                      $(`#remotevideo1`).hide();
                      if ($(`#stream1 .no-video-container`).length === 0) {
                        $(`#stream1`).append(
                          `<div class="no-video-container">` +
                          `<i class="fa fa-video-camera fa-5 no-video-icon"></i>` +
                          `<span class="no-video-text">No remote video available</span>` +
                          `</div>`);
                      }
                    } else {
                      $(`#stream1 .no-video-container`).remove();
                      $(`#remotevideo1`).removeClass(`hide`).show();
                    }
                    if (!addButtons)
                      return;
                    if (videoTracks && videoTracks.length &&
                      (Janus.webRTCAdapter.browserDetails.browser === "chrome" ||
                        Janus.webRTCAdapter.browserDetails.browser === "firefox" ||
                        Janus.webRTCAdapter.browserDetails.browser === "safari")) {
                      $(`#curbitrate1`).removeClass(`hide`).show();
                      bitrateTimer[1] = setInterval(function () {
                        // Display updated bitrate, if supported
                        var bitrate = streaming[1].getBitrate();
                        $(`#curbitrate1`).text(bitrate);
                        // Check if the resolution changed too
                        var width = $("#remotevideo1").get(0).videoWidth;
                        var height = $("#remotevideo1").get(0).videoHeight;
                        if (width > 0 && height > 0)
                          $(`#curres1`).removeClass(`hide`).text(width + `x` + height).show();
                      }, 1000);
                    }
                  },
                  ondataopen: function (data) {
                    Janus.log("The DataChannel is available!");
                    $(`#waitingvideo1`).remove();
                    $(`#stream1`).append(
                      `<input class="form-control" type="text" id="datarecv1" disabled></input>`
                    );
                    if (spinner[1])
                      spinner[1].stop();
                    spinner[1] = null;
                  },
                  ondata: function (data) {
                    Janus.debug("We got data from the DataChannel!", data);
                    $(`#datarecv1`).val(data);
                  },
                  oncleanup: function () {
                    Janus.log(" ::: Got a cleanup notification :::");
                    $(`#waitingvideo1`).remove();
                    $(`#remotevideo1`).remove();
                    $(`#datarecv1`).remove();
                    $(`.no-video-container`).remove();
                    $(`#bitrate1`).attr(`disabled`, true);
                    $(`#bitrateset1`).html(`Bandwidth<span class="caret"></span>`);
                    $(`#curbitrate1`).hide();
                    if (bitrateTimer[1])
                      clearInterval(bitrateTimer[1]);
                    bitrateTimer[1] = null;
                    $(`#curres1`).hide();
                    $(`#simulcast1`).remove();
                    $(`#metadata1`).empty();
                    $(`#info1`).addClass(`hide`).hide();
                    simulcastStarted[1] = false;
                  }
                });
            },
            error: function (error) {
              Janus.error(error);
              bootbox.alert(error, function () {
                window.location.reload();
              });
            },
            destroyed: function () {
              window.location.reload();
            }
          });
      });

    }
  });
});

function updateStreamsList(index) {
  $(`#update-streams${index}`).unbind(`click`).addClass(`fa-spin`);
  var body = { request: "list" };
  Janus.debug("Sending message:", body);
  streaming[index].send({
    message: body, success: function (result) {
      setTimeout(function () {
        $(`#update-streams${index}`).removeClass(`fa-spin`).click(() => updateStreamsList(index));
      }, 500);
      if (!result) {
        bootbox.alert("Got no response to our query for available streams");
        return;
      }
      if (result["list"]) {
        $(`#streams${index}`).removeClass(`hide`).show();
        $(`#streamslist${index}`).empty();
        $(`#watch${index}`).attr(`disabled`, true).unbind(`click`);
        var list = result["list"];
        Janus.log("Got a list of available streams");
        if (list && Array.isArray(list)) {
          list.sort(function (a, b) {
            if (!a || a.id < (b ? b.id : 0))
              return -1;
            if (!b || b.id < (a ? a.id : 0))
              return 1;
            return 0;
          });
        }
        Janus.debug(list);
        for (var mp in list) {
          Janus.debug("  >> [" + list[mp]["id"] + "] " + list[mp]["description"] + " (" + list[mp]["type"] + ")");
          $(`#streamslist${index}`).append("<li><a href='#' id='" + list[mp]["id"] + "'>" + list[mp]["description"] + " (" + list[mp]["type"] + ")" + "</a></li>");
        }
        $(`#streamslist${index} a`).unbind(`click`).click(function () {
          selectedStream[index] = $(this).attr("id");
          $(`#streamset${index}`).html($(this).html()).parent().removeClass(`open`);
          return false;

        });
        $(`#watch${index}`).removeAttr(`disabled`).unbind(`click`).click(() => startStream(index));
      }
    }
  });
}

function getStreamInfo(index) {
  $(`#metadata${index}`).empty();
  $(`#info${index}`).addClass(`hide`).hide();
  if (!selectedStream[index])
    return;
  // Send a request for more info on the mountpoint we subscribed to
  var body = { request: "info", id: parseInt(selectedStream[index]) || selectedStream[index] };
  streaming[index].send({
    message: body, success: function (result) {
      if (result && result.info && result.info.metadata) {
        $(`#metadata${index}`).html(result.info.metadata);
        $(`#info${index}`).removeClass(`hide`).show();
      }
    }
  });
}

function startStream(index) {
  Janus.log("Selected video id #" + selectedStream[index]);
  if (!selectedStream[index]) {
    bootbox.alert("Select a stream from the list");
    return;
  }
  $(`#streamset${index}`).attr(`disabled`, true);
  $(`#streamslist${index}`).attr(`disabled`, true);
  $(`#watch${index}`).attr(`disabled`, true).unbind(`click`);
  var body = { request: "watch", id: parseInt(selectedStream[index]) || selectedStream[index] };
  streaming[index].send({ message: body });
  // No remote video yet
  $(`#stream${index}`).append(`<video class="rounded centered" id="waitingvideo${index}" width="100%" height="100%" />`);
  if (spinner[index] == null) {
    var target = document.getElementById(`stream`);
    spinner[index] = new Spinner({ top: 100 }).spin(target);
  } else {
    spinner[index].spin();
  }
  // Get some more info for the mountpoint to display, if any
  getStreamInfo(index);
}

function stopStream(index) {
  $(`#watch${index}`).attr(`disabled`, true).unbind(`click`);
  var body = { request: "stop" };
  streaming[index].send({ message: body });
  streaming[index].hangup();
  $(`#streamset${index}`).removeAttr(`disabled`);
  $(`#streamslist${index}`).removeAttr(`disabled`);
  $(`#watch${index}`).html("Watch or Listen").removeAttr(`disabled`).unbind(`click`).click(() => startStream(index));
  $(`#status${index}`).empty().hide();
  $(`#bitrate${index}`).attr(`disabled`, true);
  $(`#bitrateset${index}`).html(`Bandwidth<span class="caret"></span>`);
  $(`#curbitrate${index}`).hide();
  if (bitrateTimer[index])
    clearInterval(bitrateTimer[index]);
  bitrateTimer[index] = null;
  $(`#curres${index}`).empty().hide();
  $(`#simulcast${index}`).remove();
  simulcastStarted[index] = false;
}

// Helpers to create Simulcast-related UI, if enabled
function addSimulcastButtons(temporal, index) {
  $(`#curres${index}`).parent().append(
    `<div id="simulcast${index}" class="btn-group-vertical btn-group-vertical-xs pull-right">` +
    `	<div class"row">` +
    `		<div class="btn-group btn-group-xs" style="width: 100%">` +
    `			<button id="sl-2${index}" type="button" class="btn btn-primary" data-toggle="tooltip" title="Switch to higher quality" style="width: 33%">SL 2</button>` +
    `			<button id="sl-1${index}" type="button" class="btn btn-primary" data-toggle="tooltip" title="Switch to normal quality" style="width: 33%">SL 1</button>` +
    `			<button id="sl-0${index}" type="button" class="btn btn-primary" data-toggle="tooltip" title="Switch to lower quality" style="width: 34%">SL 0</button>` +
    `		</div>` +
    `	</div>` +
    `	<div class"row">` +
    `		<div class="btn-group btn-group-xs hide" style="width: 100%">` +
    `			<button id="tl-2${index}" type="button" class="btn btn-primary" data-toggle="tooltip" title="Cap to temporal layer 2" style="width: 34%">TL 2</button>` +
    `			<button id="tl-1${index}" type="button" class="btn btn-primary" data-toggle="tooltip" title="Cap to temporal layer 1" style="width: 33%">TL 1</button>` +
    `			<button id="tl-0${index}" type="button" class="btn btn-primary" data-toggle="tooltip" title="Cap to temporal layer 0" style="width: 33%">TL 0</button>` +
    `		</div>` +
    `	</div>` +
    `</div>`);
  // Enable the simulcast selection buttons
  $(`#sl-0${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`)
    .unbind(`click`).click(function () {
      toastr.info("Switching simulcast substream, wait for it... (lower quality)", null, { timeOut: 2000 });
      if (!$(`#sl-2${index}`).hasClass(`btn-success`))
        $(`#sl-2${index}`).removeClass(`btn-primary btn-info`).addClass(`btn-primary`);
      if (!$(`#sl-1${index}`).hasClass(`btn-success`))
        $(`#sl-1${index}`).removeClass(`btn-primary btn-info`).addClass(`btn-primary`);
      $(`#sl-0${index}`).removeClass(`btn-primary btn-info btn-success`).addClass(`btn-info`);
      streaming[index].send({ message: { request: "configure", substream: 0 } });
    });
  $(`#sl-1${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`)
    .unbind(`click`).click(function () {
      toastr.info("Switching simulcast substream, wait for it... (normal quality)", null, { timeOut: 2000 });
      if (!$(`#sl-2${index}`).hasClass(`btn-success`))
        $(`#sl-2${index}`).removeClass(`btn-primary btn-info`).addClass(`btn-primary`);
      $(`#sl-1${index}`).removeClass(`btn-primary btn-info btn-success`).addClass(`btn-info`);
      if (!$(`#sl-0${index}`).hasClass(`btn-success`))
        $(`#sl-0${index}`).removeClass(`btn-primary btn-info`).addClass(`btn-primary`);
      streaming[index].send({ message: { request: "configure", substream: 1 } });
    });
  $(`#sl-2${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`)
    .unbind(`click`).click(function () {
      toastr.info("Switching simulcast substream, wait for it... (higher quality)", null, { timeOut: 2000 });
      $(`#sl-2${index}`).removeClass(`btn-primary btn-info btn-success`).addClass(`btn-info`);
      if (!$(`#sl-1${index}`).hasClass(`btn-success`))
        $(`#sl-1${index}`).removeClass(`btn-primary btn-info`).addClass(`btn-primary`);
      if (!$(`#sl-0${index}`).hasClass(`btn-success`))
        $(`#sl-0${index}`).removeClass(`btn-primary btn-info`).addClass(`btn-primary`);
      streaming[index].send({ message: { request: "configure", substream: 2 } });
    });
  if (!temporal)	// No temporal layer support
    return;
  $(`#tl-0${index}`).parent().removeClass(`hide`);
  $(`#tl-0${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`)
    .unbind(`click`).click(function () {
      toastr.info("Capping simulcast temporal layer, wait for it... (lowest FPS)", null, { timeOut: 2000 });
      if (!$(`#tl-2${index}`).hasClass(`btn-success`))
        $(`#tl-2${index}`).removeClass(`btn-primary btn-info`).addClass(`btn-primary`);
      if (!$(`#tl-1${index}`).hasClass(`btn-success`))
        $(`#tl-1${index}`).removeClass(`btn-primary btn-info`).addClass(`btn-primary`);
      $(`#tl-0${index}`).removeClass(`btn-primary btn-info btn-success`).addClass(`btn-info`);
      streaming[index].send({ message: { request: "configure", temporal: 0 } });
    });
  $(`#tl-1${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`)
    .unbind(`click`).click(function () {
      toastr.info("Capping simulcast temporal layer, wait for it... (medium FPS)", null, { timeOut: 2000 });
      if (!$(`#tl-2${index}`).hasClass(`btn-success`))
        $(`#tl-2${index}`).removeClass(`btn-primary btn-info`).addClass(`btn-primary`);
      $(`#tl-1${index}`).removeClass(`btn-primary btn-info`).addClass(`btn-info`);
      if (!$(`#tl-0${index}`).hasClass(`btn-success`))
        $(`#tl-0${index}`).removeClass(`btn-primary btn-info`).addClass(`btn-primary`);
      streaming[index].send({ message: { request: "configure", temporal: 1 } });
    });
  $(`#tl-2${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`)
    .unbind(`click`).click(function () {
      toastr.info("Capping simulcast temporal layer, wait for it... (highest FPS)", null, { timeOut: 2000 });
      $(`#tl-2${index}`).removeClass(`btn-primary btn-info btn-success`).addClass(`btn-info`);
      if (!$(`#tl-1${index}`).hasClass(`btn-success`))
        $(`#tl-1${index}`).removeClass(`btn-primary btn-info`).addClass(`btn-primary`);
      if (!$(`#tl-0${index}`).hasClass(`btn-success`))
        $(`#tl-0${index}`).removeClass(`btn-primary btn-info`).addClass(`btn-primary`);
      streaming[index].send({ message: { request: "configure", temporal: 2 } });
    });
}

function updateSimulcastButtons(substream, temporal, index) {
  // Check the substream
  if (substream === 0) {
    toastr.success("Switched simulcast substream! (lower quality)", null, { timeOut: 2000 });
    $(`#sl-2${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`);
    $(`#sl-1${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`);
    $(`#sl-0${index}`).removeClass(`btn-primary btn-info btn-success`).addClass(`btn-success`);
  } else if (substream === 1) {
    toastr.success("Switched simulcast substream! (normal quality)", null, { timeOut: 2000 });
    $(`#sl-2${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`);
    $(`#sl-1${index}`).removeClass(`btn-primary btn-info btn-success`).addClass(`btn-success`);
    $(`#sl-0${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`);
  } else if (substream === 2) {
    toastr.success("Switched simulcast substream! (higher quality)", null, { timeOut: 2000 });
    $(`#sl-2${index}`).removeClass(`btn-primary btn-info btn-success`).addClass(`btn-success`);
    $(`#sl-1${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`);
    $(`#sl-0${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`);
  }
  // Check the temporal layer
  if (temporal === 0) {
    toastr.success("Capped simulcast temporal layer! (lowest FPS)", null, { timeOut: 2000 });
    $(`#tl-2${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`);
    $(`#tl-1${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`);
    $(`#tl-0${index}`).removeClass(`btn-primary btn-info btn-success`).addClass(`btn-success`);
  } else if (temporal === 1) {
    toastr.success("Capped simulcast temporal layer! (medium FPS)", null, { timeOut: 2000 });
    $(`#tl-2${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`);
    $(`#tl-1${index}`).removeClass(`btn-primary btn-info btn-success`).addClass(`btn-success`);
    $(`#tl-0${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`);
  } else if (temporal === 2) {
    toastr.success("Capped simulcast temporal layer! (highest FPS)", null, { timeOut: 2000 });
    $(`#tl-2${index}`).removeClass(`btn-primary btn-info btn-success`).addClass(`btn-success`);
    $(`#tl-1${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`);
    $(`#tl-0${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`);
  }
}

// Helpers to create SVC-related UI for a new viewer
function addSvcButtons(index) {
  if ($(`#svc${index}`).length > 0)
    return;
  $(`#curres${index}`).parent().append(
    `<div id="svc${index}" class="btn-group-vertical btn-group-vertical-xs pull-right">` +
    `	<div class"row">` +
    `		<div class="btn-group btn-group-xs" style="width: 100%">` +
    `			<button id="sl-1${index}" type="button" class="btn btn-primary" data-toggle="tooltip" title="Switch to normal resolution" style="width: 50%">SL 1</button>` +
    `			<button id="sl-0${index}" type="button" class="btn btn-primary" data-toggle="tooltip" title="Switch to low resolution" style="width: 50%">SL 0</button>` +
    `		</div>` +
    `	</div>` +
    `	<div class"row">` +
    `		<div class="btn-group btn-group-xs" style="width: 100%">` +
    `			<button id="tl-2${index}" type="button" class="btn btn-primary" data-toggle="tooltip" title="Cap to temporal layer 2 (high FPS)" style="width: 34%">TL 2</button>` +
    `			<button id="tl-1${index}" type="button" class="btn btn-primary" data-toggle="tooltip" title="Cap to temporal layer 1 (medium FPS)" style="width: 33%">TL 1</button>` +
    `			<button id="tl-0${index}" type="button" class="btn btn-primary" data-toggle="tooltip" title="Cap to temporal layer 0 (low FPS)" style="width: 33%">TL 0</button>` +
    `		</div>` +
    `	</div>` +
    `</div>`
  );
  // Enable the VP8 simulcast selection buttons
  $(`#sl-0${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`)
    .unbind(`click`).click(function () {
      toastr.info("Switching SVC spatial layer, wait for it... (low resolution)", null, { timeOut: 2000 });
      if (!$(`#sl-1${index}`).hasClass(`btn-success`))
        $(`#sl-1${index}`).removeClass(`btn-primary btn-info`).addClass(`btn-primary`);
      $(`#sl-0${index}`).removeClass(`btn-primary btn-info btn-success`).addClass(`btn-info`);
      streaming[index].send({ message: { request: "configure", spatial_layer: 0 } });
    });
  $(`#sl-1${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`)
    .unbind(`click`).click(function () {
      toastr.info("Switching SVC spatial layer, wait for it... (normal resolution)", null, { timeOut: 2000 });
      $(`#sl-1${index}`).removeClass(`btn-primary btn-info btn-success`).addClass(`btn-info`);
      if (!$(`#sl-0${index}`).hasClass(`btn-success`))
        $(`#sl-0${index}`).removeClass(`btn-primary btn-info`).addClass(`btn-primary`);
      streaming[index].send({ message: { request: "configure", spatial_layer: 1 } });
    });
  $(`#tl-0${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`)
    .unbind(`click`).click(function () {
      toastr.info("Capping SVC temporal layer, wait for it... (lowest FPS)", null, { timeOut: 2000 });
      if (!$(`#tl-2${index}`).hasClass(`btn-success`))
        $(`#tl-2${index}`).removeClass(`btn-primary btn-info`).addClass(`btn-primary`);
      if (!$(`#tl-1${index}`).hasClass(`btn-success`))
        $(`#tl-1${index}`).removeClass(`btn-primary btn-info`).addClass(`btn-primary`);
      $(`#tl-0${index}`).removeClass(`btn-primary btn-info btn-success`).addClass(`btn-info`);
      streaming[index].send({ message: { request: "configure", temporal_layer: 0 } });
    });
  $(`#tl-1${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`)
    .unbind(`click`).click(function () {
      toastr.info("Capping SVC temporal layer, wait for it... (medium FPS)", null, { timeOut: 2000 });
      if (!$(`#tl-2${index}`).hasClass(`btn-success`))
        $(`#tl-2${index}`).removeClass(`btn-primary btn-info`).addClass(`btn-primary`);
      $(`#tl-1${index}`).removeClass(`btn-primary btn-info`).addClass(`btn-info`);
      if (!$(`#tl-0${index}`).hasClass(`btn-success`))
        $(`#tl-0${index}`).removeClass(`btn-primary btn-info`).addClass(`btn-primary`);
      streaming[index].send({ message: { request: "configure", temporal_layer: 1 } });
    });
  $(`#tl-2${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`)
    .unbind(`click`).click(function () {
      toastr.info("Capping SVC temporal layer, wait for it... (highest FPS)", null, { timeOut: 2000 });
      $(`#tl-2${index}`).removeClass(`btn-primary btn-info btn-success`).addClass(`btn-info`);
      if (!$(`#tl-1${index}`).hasClass(`btn-success`))
        $(`#tl-1${index}`).removeClass(`btn-primary btn-info`).addClass(`btn-primary`);
      if (!$(`#tl-0${index}`).hasClass(`btn-success`))
        $(`#tl-0${index}`).removeClass(`btn-primary btn-info`).addClass(`btn-primary`);
      streaming[index].send({ message: { request: "configure", temporal_layer: 2 } });
    });
}

function updateSvcButtons(spatial, temporal, index) {
  // Check the spatial layer
  if (spatial === 0) {
    toastr.success("Switched SVC spatial layer! (lower resolution)", null, { timeOut: 2000 });
    $(`#sl-1${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`);
    $(`#sl-0${index}`).removeClass(`btn-primary btn-info btn-success`).addClass(`btn-success`);
  } else if (spatial === 1) {
    toastr.success("Switched SVC spatial layer! (normal resolution)", null, { timeOut: 2000 });
    $(`#sl-1${index}`).removeClass(`btn-primary btn-info btn-success`).addClass(`btn-success`);
    $(`#sl-0${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`);
  }
  // Check the temporal layer
  if (temporal === 0) {
    toastr.success("Capped SVC temporal layer! (lowest FPS)", null, { timeOut: 2000 });
    $(`#tl-2${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`);
    $(`#tl-1${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`);
    $(`#tl-0${index}`).removeClass(`btn-primary btn-info btn-success`).addClass(`btn-success`);
  } else if (temporal === 1) {
    toastr.success("Capped SVC temporal layer! (medium FPS)", null, { timeOut: 2000 });
    $(`#tl-2${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`);
    $(`#tl-1${index}`).removeClass(`btn-primary btn-info btn-success`).addClass(`btn-success`);
    $(`#tl-0${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`);
  } else if (temporal === 2) {
    toastr.success("Capped SVC temporal layer! (highest FPS)", null, { timeOut: 2000 });
    $(`#tl-2${index}`).removeClass(`btn-primary btn-info btn-success`).addClass(`btn-success`);
    $(`#tl-1${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`);
    $(`#tl-0${index}`).removeClass(`btn-primary btn-success`).addClass(`btn-primary`);
  }
}
