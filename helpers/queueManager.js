const fs = require("fs");

let eventQueue = [];
const QUEUE_FILE_PATH = "eventQueue.json";

function createQueue() {
  eventQueue = [];
}

function addToQueue(items) {
  eventQueue.push(...items);
}

function saveQueueToFile() {
  try {
    fs.writeFileSync(QUEUE_FILE_PATH, JSON.stringify(eventQueue));
    console.log("Queue saved to file successfully.");
  } catch (error) {
    console.error("Error saving queue to file:", error);
  }
}

function loadQueueFromFile() {
  try {
    if (fs.existsSync(QUEUE_FILE_PATH)) {
      const data = fs.readFileSync(QUEUE_FILE_PATH);
      eventQueue = JSON.parse(data);
      console.log("Queue loaded from file.");
    }
  } catch (error) {
    console.error("Error loading queue from file:", error);
  }
}

function getEvent() {
  const event = eventQueue.shift();

  return event;
}

module.exports = {
  createQueue,
  addToQueue,
  saveQueueToFile,
  loadQueueFromFile,
  getEvent,
};
