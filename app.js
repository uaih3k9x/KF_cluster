'use strict';

const cluster = require('cluster');
const os = require('os');
const express = require('express');
const mongoose = require('mongoose');
const config = require('./config/environment');
require('console-stamp')(console, { pattern: 'dd/mm/yyyy HH:MM:ss.l' });

// Connect to database
mongoose.connect(config.mongo.uri, config.mongo.options)
  .catch(error => {
    console.error("Mongodb Connection Failed");
    console.error(error.message);
    throw error;
  });

mongoose.connection.on('error', err => {
  console.error("Mongodb Connection Failed");
  console.error(err);
});

// Populate DB with sample data
if (config.seedDB) {
  require('./config/seed');
}

if (cluster.isMaster) {
  // Master process will fork workers

  const numCPUs = os.cpus().length;
  console.log(`Master process running on ${process.pid}, with ${numCPUs} CPUs`);

  // Fork workers for each CPU core
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  // Listen for dying workers and create a new one when a worker dies
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork();
  });

} else {
  //Let Worker handle

  const app = express();
  const server = require('http').createServer(app);
  const socketio = require('socket.io')(server, {
    serveClient: (config.env === 'production') ? false : true,
    path: '/socket.io-client'
  });

  // Middleware?
  app.use(function (req, res, next) {
    try {
      if (req.user) {
        console.log('User logged:', req.user);
      }
    } catch (error) {
      console.error('Error logging user:', error);
    }
    next();
  });

  // Setup socket.io and express configurations
  require('./config/socketio')(socketio);
  require('./config/express')(app);
  require('./routes')(app);

  // Start server
  server.listen(config.port, config.ip, function () {
    console.info(`Worker ${process.pid} listening on ${config.port}, in ${app.get('env')} mode`);
  });
}
