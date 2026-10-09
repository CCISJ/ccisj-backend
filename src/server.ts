import app from './app.js';
import { environment } from './config/environment.js';

// El puerto sale de la configuración validada: si `PORT` trae algo que no es
// un puerto, el proceso ya falló al arrancar en vez de escuchar en otro lado.
app.listen(environment.port, () => {
  console.log(`Server running on http://localhost:${environment.port}`);
});
