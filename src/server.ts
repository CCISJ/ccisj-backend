import { createServer } from 'node:http';

import app from './app.js';
import { environment } from './config/environment.js';
import { configureSocket } from './config/socket.js';

const httpServer = createServer(app);

configureSocket(httpServer);

httpServer.listen(environment.port, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${environment.port}`);
});
