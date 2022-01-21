const cv = require('opencv4nodejs');

async function main() {
  console.log(cv.getBuildInformation());
  let frame;
  // const vCap = new cv.VideoCapture(0);
  const vCap = new cv.VideoCapture(0)
  vCap.set(3, 640);
  vCap.set(4, 480);
  const w = new cv.VideoWriter('appsrc ! videoconvert ! video/x-raw,format=I420,width=640,height=480,framerate=25/1 ! x264enc ! rtph264pay ! udpsink host=127.0.0.1 port=5504', 0, 25, new cv.Size(640, 480));
  const intvl = setInterval(() => {
    frame = vCap.read();
    // loop back to start on end of stream reached
    if (frame.empty) {
      console.log('Frame empty!');
      vCap.reset();
      frame = vCap.read();
    }
    console.log(frame);

    console.error('will write frame');
    w.write(frame);
    console.error('has written frame');

    // cv.imshow("window", frame);
    frame.release();
    // w.release();

  }, 40);
  // w.release();
  //child.stdout.pipe(res);
}

main();
