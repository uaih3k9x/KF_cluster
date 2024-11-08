const axios = require('axios');
const cluster = require('cluster');
const os = require('os');

// Configuration parameters
const url = 'http://10.191.31.203:9000'; // Replace with test URL
const concurrentRequests = 1000;  // Number of concurrent requests per process
const numProcesses = os.cpus().length; // Use CPU core count as number of processes

// Single request function
const sendRequest = async () => {
  try {
    const response = await axios.get(url);
    // console.log(`Process ${process.pid} response status: ${response.status}`);
  } catch (error) {
    console.error(`Process ${process.pid} request failed:`, error.message);
  }
};

// Execute load test
const performLoadTest = async () => {
  const promises = [];
  for (let i = 0; i < concurrentRequests; i++) {
    promises.push(sendRequest());
  }
  await Promise.all(promises);
  console.log(`Process ${process.pid} completed ${concurrentRequests} requests!`);
};

// Master process: create worker processes
if (cluster.isMaster) {
  console.log(`Master process ${process.pid} starting, creating ${numProcesses} worker processes...`);
  for (let i = 0; i < numProcesses; i++) {
    cluster.fork();  // Create child process
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker process ${worker.process.pid} exited`);
  });

// Child process: execute load test
} else {
  performLoadTest();
}
