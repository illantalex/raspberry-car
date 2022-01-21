# USAGE
# python real_time_object_detection.py --prototxt MobileNetSSD_deploy.prototxt.txt --model MobileNetSSD_deploy.caffemodel

# import the necessary packages
from imutils.video import VideoStream
from imutils.video import FPS
import numpy as np
import argparse
import imutils
import time
import cv2

# construct the argument parse and parse the arguments
ap = argparse.ArgumentParser()
ap.add_argument(
    "-p",
    "--prototxt",
    help="path to Caffe 'deploy' prototxt file",
    default="MobileNetSSD_deploy.prototxt.txt",
)
ap.add_argument(
    "-m",
    "--model",
    help="path to Caffe pre-trained model",
    default="MobileNetSSD_deploy.caffemodel",
)
ap.add_argument(
    "-c",
    "--confidence",
    type=float,
    default=0.2,
    help="minimum probability to filter weak detections",
)
args = vars(ap.parse_args())

# initialize the list of class labels MobileNet SSD was trained to
# detect, then generate a set of bounding box colors for each class
CLASSES = [
    "background",
    "aeroplane",
    "bicycle",
    "bird",
    "boat",
    "bottle",
    "bus",
    "car",
    "cat",
    "chair",
    "cow",
    "diningtable",
    "dog",
    "horse",
    "motorbike",
    "person",
    "pottedplant",
    "sheep",
    "sofa",
    "train",
    "tvmonitor",
]
COLORS = np.random.uniform(0, 255, size=(len(CLASSES), 3))
WIDTH = 640
HEIGHT = 480
HOST = "illantalex-Inspiron-3576.local"

# load our serialized model from disk
print("[INFO] loading model...")
net = cv2.dnn.readNetFromCaffe(args["prototxt"], args["model"])

# initialize the video stream, allow the cammera sensor to warmup,
# and initialize the FPS counter
print("[INFO] starting video stream...")
# cap = cv2.VideoCapture(
#     "udpsrc port=5504 ! application/x-rtp,media=video,clock-rate=90000,encoding-name=H264,payload=96 ! rtph264depay ! h264parse ! avdec_h264 ! decodebin ! videoconvert ! appsink",
#     cv2.CAP_GSTREAMER,
# )

cap = cv2.VideoCapture(0)
cap.set(3, WIDTH)
cap.set(4, HEIGHT)
# cap = cv2.VideoCapture(
#     "udpsrc port=5504 ! application/x-rtp,encoding-name=JPEG,payload=26 ! rtpjpegdepay ! jpegdec ! appsink",
#     cv2.CAP_GSTREAMER,
# )

writer = cv2.VideoWriter(
    "appsrc ! videoconvert ! x264enc tune=zerolatency bitrate=500 speed-preset=superfast ! rtph264pay ! udpsink host=localhost port=6504",
    cv2.CAP_GSTREAMER,
    0,
    10,
    (WIDTH, HEIGHT),
    True,
)
# writer = cv2.VideoWriter(
#     "appsrc ! image/jpeg, width=640, height=480 ! progressreport ! rtpjpegpay ! udpsink host=${HOST} port=6504",
#     cv2.CAP_GSTREAMER,
#     0,
#     10,
#     (WIDTH, HEIGHT),
#     True
# )
time.sleep(2.0)
# fps = FPS().start()

# setInterval(lambda: send_frame(writer), 40)
# loop over the frames from the video stream
def process_images(cap):
    # grab the frame from the threaded video stream and resize it
    # to have a maximum width of 400 pixels
    ret, frame = cap.read()
    # frame = imutils.resize(frame, width=640, height=480)

    # grab the frame dimensions and convert it to a blob
    # (h, w) = frame.shape[:2]
    # print(frame)
    if ret:
        blob = cv2.dnn.blobFromImage(
            cv2.resize(frame, (300, 300)), 0.007843, (300, 300), 127.5
        )

        # pass the blob through the network and obtain the detections and
        # predictions
        net.setInput(blob)
        detections = net.forward()

        # loop over the detections
        for i in np.arange(0, detections.shape[2]):
            # extract the confidence (i.e., probability) associated with
            # the prediction
            confidence = detections[0, 0, i, 2]
            # filter out weak detections by ensuring the `confidence` is

            # greater than the minimum confidence
            if confidence > args["confidence"]:
                # extract the index of the class label from the
                # `detections`, then compute the (x, y)-coordinates of
                # the bounding box for the object
                idx = int(detections[0, 0, i, 1])
                box = detections[0, 0, i, 3:7] * np.array(
                    [WIDTH, HEIGHT, WIDTH, HEIGHT]
                )
                (startX, startY, endX, endY) = box.astype("int")

                # draw the prediction on the frame
                label = "{}: {:.2f}%".format(CLASSES[idx], confidence * 100)
                cv2.rectangle(frame, (startX, startY), (endX, endY), COLORS[idx], 2)
                y = startY - 15 if startY - 15 > 15 else startY + 15
                cv2.putText(
                    frame,
                    label,
                    (startX, y),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    COLORS[idx],
                    2,
                )

        # show the output frame
        # cv2.imshow(str(cap), frame)
        writer.write(frame)

        # update the FPS counter
        # fps.update()
        key = cv2.waitKey(1) & 0xFF

        # if the `q` key was pressed, break from the loop
        if key == ord("q"):
            return 1


# stop the timer and display FPS information
while True:
    res = process_images(cap)
    if res:
        break

# fps.stop()
# print("[INFO] elapsed time: {:.2f}".format(fps.elapsed()))
# print("[INFO] approx. FPS: {:.2f}".format(fps.fps()))

# do a bit of cleanup
cv2.destroyAllWindows()
# cap.stop()
