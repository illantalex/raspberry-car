"""
Run object detection on images, Press ESC to exit the program
For Raspberry PI, please use `import tflite_runtime.interpreter as tflite` instead
"""
import re
import cv2
import numpy as np

import tensorflow.lite as tflite

# import tflite_runtime.interpreter as tflite

from PIL import Image

from imutils.video import VideoStream, FPS
import os, fcntl
import v4l2

CAMERA_WIDTH = 640
CAMERA_HEIGHT = 480

cap = cv2.VideoCapture(0)
cap.set(3, CAMERA_WIDTH)
cap.set(4, CAMERA_HEIGHT)
ret, im = cap.read()
height, width, channels = im.shape

devName = "/dev/video6"
if not os.path.exists(devName):
    print("Warning: device does not exist", devName)
writer = open(devName, "wb")

# Set up the formatting of our loopback device - boilerplate
format = v4l2.v4l2_format()
format.type = v4l2.V4L2_BUF_TYPE_VIDEO_OUTPUT
format.fmt.pix.field = v4l2.V4L2_FIELD_NONE
format.fmt.pix.pixelformat = v4l2.V4L2_PIX_FMT_BGR24
format.fmt.pix.width = width
format.fmt.pix.height = height
format.fmt.pix.bytesperline = width * channels
format.fmt.pix.sizeimage = width * height * channels

print(
    "set format result (0 is good):{}".format(
        fcntl.ioctl(writer, v4l2.VIDIOC_S_FMT, format)
    )
)
print("begin loopback write")


def load_labels(label_path):
    r"""Returns a list of labels"""
    with open(label_path) as f:
        labels = {}
        for line in f.readlines():
            m = re.match(r"(\d+)\s+(\w+)", line.strip())
            labels[int(m.group(1))] = m.group(2)
        return labels


def load_model(model_path):
    r"""Load TFLite model, returns a Interpreter instance."""
    interpreter = tflite.Interpreter(model_path=model_path, num_threads=4)
    interpreter.allocate_tensors()
    return interpreter


def process_image(interpreter, image, input_index):
    r"""Process an image, Return a list of detected class ids and positions"""
    input_data = np.expand_dims(image, axis=0)  # expand to 4-dim

    # Process
    interpreter.set_tensor(input_index, input_data)
    interpreter.invoke()

    # Get outputs
    output_details = interpreter.get_output_details()
    # print(output_details)
    # output_details[0] - position
    # output_details[1] - class id
    # output_details[2] - score
    # output_details[3] - count

    positions = np.squeeze(interpreter.get_tensor(output_details[0]["index"]))
    classes = np.squeeze(interpreter.get_tensor(output_details[1]["index"]))
    scores = np.squeeze(interpreter.get_tensor(output_details[2]["index"]))

    result = []

    for idx, score in enumerate(scores):
        if score > 0.5:
            result.append({"pos": positions[idx], "_id": classes[idx]})

    return result


def display_result(result, frame, labels):
    r"""Display Detected Objects"""
    font = cv2.FONT_HERSHEY_SIMPLEX
    size = 0.6
    color = (255, 0, 0)  # Blue color
    thickness = 1

    # position = [ymin, xmin, ymax, xmax]
    # x * CAMERA_WIDTH
    # y * CAMERA_HEIGHT
    for obj in result:
        pos = obj["pos"]
        _id = obj["_id"]

        x1 = int(pos[1] * CAMERA_WIDTH)
        x2 = int(pos[3] * CAMERA_WIDTH)
        y1 = int(pos[0] * CAMERA_HEIGHT)
        y2 = int(pos[2] * CAMERA_HEIGHT)

        cv2.putText(frame, labels[_id], (x1, y1), font, size, color, thickness)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, thickness)

    writer.write(frame)
    # cv2.imshow("Object Detection", frame)


if __name__ == "__main__":

    model_path = "data/detect.tflite"
    label_path = "data/coco_labels.txt"

    # cap = cv2.VideoCapture(0)
    # cap = VideoStream(src=0).start()

    # cap.set(cv2.CAP_PROP_FPS, 15)
    # w = cv2.VideoWriter(
    #     "appsrc ! videoconvert ! x264enc tune=zerolatency ! rtph264pay ! application/x-rtp,media=video,encoding-name=H264,payload=96 ! udpsink host=localhost port=6547",
    #     cv2.CAP_GSTREAMER,
    #     25,
    #     (640, 480),
    #     True,
    # )

    interpreter = load_model(model_path)
    labels = load_labels(label_path)

    input_details = interpreter.get_input_details()

    # Get Width and Height
    input_shape = input_details[0]["shape"]
    height = input_shape[1]
    width = input_shape[2]

    # Get input index
    input_index = input_details[0]["index"]

    # Process Stream
    fps = FPS().start()
    while True:
        ret, frame = cap.read()

        # print(ret, frame)

        image = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        image = image.resize((width, height))

        top_result = process_image(interpreter, image, input_index)
        display_result(top_result, frame, labels)
        key = cv2.waitKey(1)
        fps.update()
        if key == 27:  # esc
            break
    fps.stop()
    print(fps.elapsed())
    print(fps.fps())
    cap.release()
    cv2.destroyAllWindows()
